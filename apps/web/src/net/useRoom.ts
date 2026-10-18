import { type ClientCommand, type PublicCue, type ServerMessage, type View } from '@mol/shared';
import { getLibrary } from '@/net/http';
import { RoomSocket, type AckResult, type SocketReason, type SocketState } from '@/net/socket';
import { useEffect, useRef, useState } from 'react';

/**
 * React bağlayıcıları: `RoomSocket`'i bileşen durumuna çevirir. Ekranlar
 * yalnız `View` + `now` alır; ağ ayrıntıları burada kalır.
 */

interface SocketSnapshot {
  state: SocketState;
  reason: SocketReason;
  view: View | null;
  seq: number;
  recoveryResumesAt: number | null;
  cue: (PublicCue & { receivedAt: number }) | null;
}

const INITIAL: SocketSnapshot = {
  state: 'connecting',
  reason: null,
  view: null,
  seq: -1,
  recoveryResumesAt: null,
  cue: null,
};

export interface ParticipantSocket {
  socket: RoomSocket | null;
  state: SocketState;
  reason: SocketReason;
  view: View | null;
  seq: number;
  recoveryResumesAt: number | null;
  cue: (PublicCue & { receivedAt: number }) | null;
  send: (cmd: ClientCommand) => Promise<AckResult>;
}

/** `code` + `token` ile tek bir oda bağlantısı kurar ve `view`'ı tutar. */
export function useParticipantSocket(code: string, token: string | null): ParticipantSocket {
  const [snapshot, setSnapshot] = useState<SocketSnapshot>(INITIAL);
  const socketRef = useRef<RoomSocket | null>(null);

  useEffect(() => {
    if (!token) {
      socketRef.current = null;
      setSnapshot(INITIAL);
      return;
    }
    const socket = new RoomSocket({
      code,
      token,
      handlers: {
        onState: (state, reason) => setSnapshot((s) => ({ ...s, state, reason })),
        onMessage: (message: ServerMessage) => {
          if (message.type === 'view')
            // Tam görünüm; eski seq yok sayılır (protokol §3).
            setSnapshot((s) =>
              message.seq <= s.seq
                ? s
                : { ...s, state: 'open', reason: null, view: message.view, seq: message.seq },
            );
          else if (message.type === 'cue')
            setSnapshot((s) => ({ ...s, cue: { ...message.cue, receivedAt: Date.now() } }));
          else if (message.type === 'recovery')
            setSnapshot((s) => ({ ...s, recoveryResumesAt: message.resumesAt }));
        },
      },
    });
    socketRef.current = socket;
    socket.connect();
    return () => socket.close();
  }, [code, token]);

  return {
    socket: socketRef.current,
    state: snapshot.state,
    reason: snapshot.reason,
    view: snapshot.view,
    seq: snapshot.seq,
    recoveryResumesAt: snapshot.recoveryResumesAt,
    cue: snapshot.cue,
    send: (cmd) => socketRef.current?.sendCommand(cmd) ?? Promise.reject(new Error('NO_SOCKET')),
  };
}

/** Sunucu saatine hizalı akım zamanı; geri sayımlar bununla hesaplanır. */
export function useSyncedNow(socket: RoomSocket | null, seq: number, intervalMs = 250): number {
  const [now, setNow] = useState(() => socket?.serverNow() ?? Date.now());
  useEffect(() => {
    if (!socket) return;
    setNow(socket.serverNow());
    const timer = window.setInterval(() => setNow(socket.serverNow()), intervalMs);
    return () => window.clearInterval(timer);
  }, [socket, seq, intervalMs]);
  return now;
}

export interface LibraryEntry {
  id: string;
  title: string;
  category: string | null;
  mediaType: 'image' | 'gif' | 'video';
}

/** Oda kütüphanesi: sunucudaki aktif sistem meme'leri. */
export function useLibrary(
  code: string,
  enabled = true,
): {
  library: LibraryEntry[];
  categories: string[];
  loading: boolean;
  failed: boolean;
} {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    getLibrary(code)
      .then((data) => {
        if (alive) {
          setEntries(data.memes);
          setFailed(false);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [code, enabled]);
  const categories = [...new Set(entries.map((m) => m.category).filter((c): c is string => !!c))];
  return { library: entries, categories, loading, failed };
}
