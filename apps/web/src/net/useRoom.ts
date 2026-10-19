import {
  type ClientCommand,
  type ManagerCommand,
  type ManagerShellInfo,
  type PublicCue,
  type ServerMessage,
  type ShellAction,
  type View,
} from '@mol/shared';
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
  state: SocketState;
  reason: SocketReason;
  view: View | null;
  seq: number;
  recoveryResumesAt: number | null;
  cue: (PublicCue & { receivedAt: number }) | null;
  /** Sunucu saatine hizalı akım zamanı (ms); geri sayımlar bununla hesaplanır. */
  now: number;
  send: (cmd: ClientCommand) => Promise<AckResult>;
}

/** `code` + `token` ile tek bir oda bağlantısı kurar; view, durum ve hizalı saati tutar. */
export function useParticipantSocket(
  code: string,
  token: string | null,
  nowIntervalMs = 250,
): ParticipantSocket {
  // Anlık görüntü üreten token'la damgalanır; token değişince (cihaz devri,
  // yeniden katılım) eski görüntü yerine INITIAL türetilir — etkide senkron
  // setState'e gerek kalmaz.
  const [snapshot, setSnapshot] = useState<{ token: string | null; value: SocketSnapshot }>({
    token: null,
    value: INITIAL,
  });
  const [now, setNow] = useState(() => Date.now());
  const socketRef = useRef<RoomSocket | null>(null);

  useEffect(() => {
    if (!token) {
      socketRef.current = null;
      return;
    }
    const socket = new RoomSocket({
      code,
      token,
      handlers: {
        onState: (state, reason) =>
          setSnapshot((s) => ({ token, value: { ...s.value, state, reason } })),
        onMessage: (message: ServerMessage) => {
          if (message.type === 'view')
            // Tam görünüm; eski seq yok sayılır (protokol §3).
            setSnapshot((s) =>
              message.seq <= s.value.seq
                ? { token, value: { ...s.value, state: 'open', reason: null } }
                : {
                    token,
                    value: {
                      ...s.value,
                      state: 'open',
                      reason: null,
                      view: message.view,
                      seq: message.seq,
                    },
                  },
            );
          else if (message.type === 'cue')
            setSnapshot((s) => ({
              token,
              value: { ...s.value, cue: { ...message.cue, receivedAt: Date.now() } },
            }));
          else if (message.type === 'recovery')
            setSnapshot((s) => ({
              token,
              value: { ...s.value, recoveryResumesAt: message.resumesAt },
            }));
        },
      },
    });
    socketRef.current = socket;
    socket.connect();
    const timer = window.setInterval(() => {
      const current = socketRef.current;
      if (current) setNow(current.serverNow());
    }, nowIntervalMs);
    return () => {
      window.clearInterval(timer);
      socket.close();
    };
  }, [code, token, nowIntervalMs]);

  const value = snapshot.token === token ? snapshot.value : INITIAL;
  return {
    state: value.state,
    reason: value.reason,
    view: value.view,
    seq: value.seq,
    recoveryResumesAt: value.recoveryResumesAt,
    cue: value.cue,
    now,
    send: (cmd) => socketRef.current?.sendCommand(cmd) ?? Promise.reject(new Error('NO_SOCKET')),
  };
}

export interface LibraryEntry {
  id: string;
  title: string;
  category: string | null;
  mediaType: 'image' | 'gif' | 'video';
}

/** Yönetici bağlantısı: `view` + `shell` (devri onayları, ekran eşleştirme). */
export interface ManagerSocket {
  state: SocketState;
  reason: SocketReason;
  view: View | null;
  shell: ManagerShellInfo | null;
  seq: number;
  /** Sunucu saatine hizalı akım zamanı (ms). */
  now: number;
  send: (cmd: ManagerCommand) => Promise<AckResult>;
  sendShell: (action: ShellAction) => Promise<AckResult>;
}

/**
 * `code` ile yönetici WebSocket'i: kimlik iş oturum çerezinden gelir (protokol
 * v0.2 §3); token gönderilmez. `enabled` false iken bağlanmaz.
 */
export function useManagerSocket(code: string, enabled: boolean, nowIntervalMs = 250): ManagerSocket {
  const [snapshot, setSnapshot] = useState<{
    enabled: boolean;
    value: {
      state: SocketState;
      reason: SocketReason;
      view: View | null;
      shell: ManagerShellInfo | null;
      seq: number;
    };
  }>({ enabled: false, value: { state: 'connecting', reason: null, view: null, shell: null, seq: -1 } });
  const [now, setNow] = useState(() => Date.now());
  const socketRef = useRef<RoomSocket | null>(null);

  useEffect(() => {
    if (!enabled) {
      socketRef.current = null;
      return;
    }
    const socket = new RoomSocket({
      code,
      handlers: {
        onState: (state, reason) =>
          setSnapshot((s) => ({ enabled, value: { ...s.value, state, reason } })),
        onMessage: (message: ServerMessage) => {
          if (message.type !== 'view') return;
          // Tam görünüm; eski seq yok sayılır (protokol §3). Shell bilgisi her
          // yönetici görünümüyle taze gelir.
          setSnapshot((s) =>
            message.seq <= s.value.seq
              ? { enabled, value: { ...s.value, state: 'open', reason: null } }
              : {
                  enabled,
                  value: {
                    ...s.value,
                    state: 'open',
                    reason: null,
                    view: message.view,
                    shell: message.shell ?? null,
                    seq: message.seq,
                  },
                },
          );
        },
      },
    });
    socketRef.current = socket;
    socket.connect();
    const timer = window.setInterval(() => {
      const current = socketRef.current;
      if (current) setNow(current.serverNow());
    }, nowIntervalMs);
    return () => {
      window.clearInterval(timer);
      socket.close();
    };
  }, [code, enabled, nowIntervalMs]);

  const fresh =
    snapshot.enabled === enabled
      ? snapshot.value
      : { state: 'connecting' as SocketState, reason: null, view: null, shell: null, seq: -1 };
  return {
    state: fresh.state,
    reason: fresh.reason,
    view: fresh.view,
    shell: fresh.shell,
    seq: fresh.seq,
    now,
    send: (cmd) => socketRef.current?.sendCommand(cmd) ?? Promise.reject(new Error('NO_SOCKET')),
    sendShell: (action) =>
      socketRef.current?.sendShell(action) ?? Promise.reject(new Error('NO_SOCKET')),
  };
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
  // Sonuç isteğin koduyla damgalanır; yüklenebilirlik damga eşleşmesinden
  // türetilir — etkide senkron setState yerine.
  const [result, setResult] = useState<{
    code: string | null;
    entries: LibraryEntry[];
    failed: boolean;
  }>({ code: null, entries: [], failed: false });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getLibrary(code)
      .then((data) => {
        if (alive) setResult({ code, entries: data.memes, failed: false });
      })
      .catch(() => {
        // Başarısızlıkta önceki listeyi koru; yalnız bayrak set et.
        if (alive) setResult((r) => ({ code, entries: r.entries, failed: true }));
      });
    return () => {
      alive = false;
    };
  }, [code, enabled]);

  const fresh = enabled && result.code === code;
  return {
    library: fresh ? result.entries : [],
    categories: fresh
      ? [...new Set(result.entries.map((m) => m.category).filter((c): c is string => !!c))]
      : [],
    loading: enabled && !fresh,
    failed: fresh ? result.failed : false,
  };
}
