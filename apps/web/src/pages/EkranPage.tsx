import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { View } from '@mol/engine';
import type { SocketReason } from '@/net/socket';
import { pairDisplay } from '@/net/http';
import { forgetDisplay, loadDisplay, saveDisplay, type StoredDisplay } from '@/net/tokens';
import { useParticipantSocket, useSyncedNow } from '@/net/useRoom';
import { Card, GhostButton, Note, PrimaryButton, Screen, TopBar } from '@/components/ui';
import {
  DisplayFinishedScene,
  DisplayLobbyScene,
  DisplayPresentationScene,
  DisplayResultsScene,
  DisplayReviewScene,
  DisplaySelectionScene,
  Stage,
  type StageRoom,
} from '@/screens/DisplayScenes';
import {
  PausedOverlay,
  ReconnectingOverlay,
  ResumeCountdownOverlay,
  SessionEndedScreen,
  SupersededScreen,
} from '@/screens/StatusScreens';

/**
 * `/ekran` — ortak ekran (SPEC 13.1): eşleştirme kodu → token → "Ekranı
 * başlat" (ses kilidi + tam ekran) → 16:9 sahne. Yalnız izler; komut yok.
 */
export default function EkranPage() {
  const [stored, setStored] = useState<StoredDisplay | null>(() => loadDisplay());
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [started, setStarted] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mountedAt = useRef(Date.now()).current;

  const { socket, state, reason, view, seq, recoveryResumesAt } = useParticipantSocket(
    stored?.roomCode ?? '',
    stored?.token ?? null,
  );
  const now = useSyncedNow(socket, seq);

  // Token geçersizse (görünüm hiç gelmediyse) eşleştirmeye dön.
  useEffect(() => {
    if (state === 'reconnecting' && !view && Date.now() - mountedAt > 8000) {
      forgetDisplay();
      setStored(null);
      setStarted(false);
    }
  }, [state, view, mountedAt]);

  async function handlePair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const code = String(input.get('code') ?? '').replace(/\D/g, '');
    if (code.length !== 6) {
      setPairError('Eşleştirme kodu 6 hanelidir.');
      return;
    }
    setPairing(true);
    setPairError(null);
    try {
      const res = await pairDisplay(code);
      saveDisplay({ token: res.token, roomCode: res.roomCode });
      setStored({ token: res.token, roomCode: res.roomCode });
    } catch {
      setPairError('Eşleştirilemedi; kodu kontrol et, süresi 5 dakikadır.');
    } finally {
      setPairing(false);
    }
  }

  async function handleStart() {
    setStarted(true);
    try {
      await stageRef.current?.requestFullscreen?.();
    } catch {
      /* Tam ekran reddedildi; sahne normal boyutta sürer. */
    }
    try {
      // Ses kilidi: tarayıcı otomatik oynatma politikası bu kullanıcı hareketiyle açılır.
      const audio = new AudioContext();
      void audio.resume();
    } catch {
      /* Ses yoksa sessiz devam. */
    }
  }

  function unpair() {
    forgetDisplay();
    setStored(null);
    setStarted(false);
  }

  if (!stored) return <PairForm onSubmit={handlePair} error={pairError} busy={pairing} />;

  if (reason) return <ClosedScreens reason={reason} />;

  if (!view || state !== 'open') return <ReconnectingOverlay className="h-dvh" />;

  const room: StageRoom = {
    code: stored.roomCode,
    joinUrl: `${location.origin}/oda/${stored.roomCode}`,
  };

  if (!started)
    return (
      <Screen className="h-dvh items-center justify-center">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <TopBar kicker="Ortak ekran" title={`Oda ${stored.roomCode} eşleşti`} />
          <Card className="max-w-md">
            <Note>
              Bu ekran lobiden oyun sonuna kadar her aşamayı 16:9 sahnede gösterir. Sesi yalnız
              ortak ekran çalar; telefonlar sessiz kalır (SPEC 13.2).
            </Note>
          </Card>
          <div className="w-full max-w-sm">
            <PrimaryButton onClick={handleStart} ariaLabel="Ekranı başlat, tam ekran ve ses">
              Ekranı başlat
            </PrimaryButton>
            <div className="mt-2">
              <GhostButton onClick={unpair}>Eşleştirmeyi bitir</GhostButton>
            </div>
          </div>
        </div>
      </Screen>
    );

  return (
    <div ref={stageRef}>
      <Stage>{sceneFor(view, now, room, recoveryResumesAt)}</Stage>
    </div>
  );
}

function sceneFor(view: View, now: number, room: StageRoom, recoveryResumesAt: number | null) {
  if (view.status === 'paused')
    return (
      <div className="flex flex-1 items-center justify-center">
        <PausedOverlay />
      </div>
    );
  if (recoveryResumesAt !== null && recoveryResumesAt > now)
    return (
      <ResumeCountdownOverlay
        secondsLeft={Math.max(0, Math.ceil((recoveryResumesAt - now) / 1000))}
      />
    );
  switch (view.phase.kind) {
    case 'lobby':
      return <DisplayLobbyScene view={view} room={room} />;
    case 'selection':
      return <DisplaySelectionScene view={view} now={now} room={room} />;
    case 'presentation':
      return <DisplayPresentationScene view={view} now={now} room={room} />;
    case 'review':
      return <DisplayReviewScene view={view} now={now} room={room} />;
    case 'reveal':
    case 'results':
      return <DisplayResultsScene view={view} now={now} room={room} drawCandidates={[]} />;
    case 'draw':
      // Kura adayları: uzatma turunun oyuncuları açıklanan gönderilerden okunur.
      return (
        <DisplayResultsScene
          view={view}
          now={now}
          room={room}
          drawCandidates={view.submissions
            .map((s) => s.playerId)
            .filter((id): id is string => !!id)
            .map((id) => view.participants.find((p) => p.id === id)?.nickname ?? '?')}
        />
      );
    case 'finished':
      return <DisplayFinishedScene view={view} room={room} />;
  }
}

function ClosedScreens({ reason }: { reason: SocketReason }) {
  if (reason === 'superseded') return <SupersededScreen className="h-dvh" />;
  return <SessionEndedScreen reason={reason === 'roomExpired' ? 'roomExpired' : 'sessionEnded'} />;
}

function PairForm({
  onSubmit,
  error,
  busy,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string | null;
  busy: boolean;
}) {
  return (
    <Screen className="h-dvh items-center justify-center">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
        <TopBar kicker="Ortak ekran" title="Ekranı eşleştir" />
        <p className="text-sm text-muted">
          Yönetici konsolunda "Ekran eşleştir"e basınca üretilen 6 haneli kodu gir.
        </p>
        <div>
          <label htmlFor="pair-code" className="mb-1 block text-sm font-bold">
            Eşleştirme kodu
          </label>
          <input
            id="pair-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="h-14 w-full rounded-md border border-line bg-surface px-3 text-center font-display text-3xl tracking-widest placeholder:text-muted"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? 'Eşleştiriliyor…' : 'Eşleştir'}
        </PrimaryButton>
      </form>
    </Screen>
  );
}
