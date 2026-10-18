import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import type { MediaRef, View } from '@mol/engine';
import { getRoom, joinRoom, requestTakeover, HttpError, type RoomInfo } from '@/net/http';
import {
  forgetParticipant,
  loadParticipant,
  saveParticipant,
  loadSoundOn,
  saveSoundOn,
  type StoredParticipant,
} from '@/net/tokens';
import { useLibrary, useParticipantSocket, useSyncedNow, type LibraryEntry } from '@/net/useRoom';
import type { SocketReason } from '@/net/socket';
import { LibraryMediaProvider, MemeFrame } from '@/components/MemeFrame';
import type { RateScore, RoundOutcome } from '@/lib/contracts';
import { JoinScreen } from '@/screens/JoinScreen';
import { LobbyScreen } from '@/screens/LobbyScreen';
import { SelectionScreen } from '@/screens/SelectionScreen';
import { SpectatorSelectionScreen } from '@/screens/SpectatorSelectionScreen';
import { PresentationScreen } from '@/screens/PresentationScreen';
import { ReviewScreen } from '@/screens/ReviewScreen';
import { RoundResultScreen } from '@/screens/RoundResultScreen';
import { GameOverScreen } from '@/screens/GameOverScreen';
import {
  ByeScreen,
  EliminatedScreen,
  KickedScreen,
  NicknameChangeScreen,
  OvertimeScreen,
  PausedOverlay,
  PendingApprovalScreen,
  ReconnectingOverlay,
  ResumeCountdownOverlay,
  RoomNotFoundScreen,
  SessionEndedScreen,
  SupersededScreen,
  TakeoverPendingScreen,
} from '@/screens/StatusScreens';

/**
 * `/oda/:code` — katılımcı odası (M3b): gerçek sunucuya bağlanır. Akış:
 * oda bilgisi → katılım (ad kullanımdaysa cihaz devri) → canlı `view`'a göre
 * doğru ekran. Token tarayıcıda saklanır; yenileme aynı kimlikle döner.
 */

type ScreenTransition =
  | { kind: 'eliminated'; roundNo: number }
  | { kind: 'overtime'; inTie: boolean };

interface Me {
  id: string;
  nickname: string;
  role: 'player' | 'voter';
  /** Geç katılım kuralı (SPEC 5.6): bu turdan itibaren puanlayabilir. */
  votingFromRound: number;
}

function roundNoOf(view: View): number {
  const p = view.phase;
  return 'roundNo' in p ? p.roundNo : 0;
}

/** Geç katılım kuralının istemci karşılığı (SPEC 5.6). */
function votingFromRoundFor(view: View): number {
  const p = view.phase;
  if (p.kind === 'selection') return p.roundNo;
  if ('roundNo' in p) return p.roundNo + 1;
  return 1;
}

/** Uzatma turu algısı: eşit puanlı düello oyuncuları yeni eşleşmedeyse (SPEC 10.2). */
function overtimeState(view: View, meId: string): { inTie: boolean } | null {
  if (view.phase.kind !== 'selection') return null;
  const prev = view.completedRounds.at(-1);
  if (!prev || view.phase.roundNo !== prev.no + 1) return null;
  const scoreOf = (id: string) => prev.submissions.find((s) => s.playerId === id)?.score;
  const tiedMatch = view.matches.find((m) => {
    const [a, b] = m;
    const sa = a ? scoreOf(a) : undefined;
    const sb = b ? scoreOf(b) : undefined;
    return !!sa && !!sb && sa.average === sb.average;
  });
  if (!tiedMatch) return null;
  return { inTie: tiedMatch.includes(meId) };
}

/** Eleme turu sonuçları: düello kazananı tur atlar, kaybeden jüriye geçer (SPEC 9.1). */
function outcomesOf(view: View): Record<string, RoundOutcome> {
  if (view.stage.context !== 'elimination' || view.phase.kind !== 'reveal') return {};
  const outcomes: Record<string, RoundOutcome> = {};
  for (const [a, b] of view.matches) {
    const sa = a ? view.submissions.find((s) => s.playerId === a)?.score : undefined;
    const sb = b ? view.submissions.find((s) => s.playerId === b)?.score : undefined;
    if (!sa || !sb || sa.average === sb.average) continue;
    const winner = sa.average > sb.average ? a : b;
    const loser = sa.average > sb.average ? b : a;
    if (winner) outcomes[winner] = 'advanced';
    if (loser) outcomes[loser] = 'eliminated';
  }
  for (const id of view.byes) outcomes[id] = 'bye';
  return outcomes;
}

function nicknameInUseNote(): string {
  return 'Bu ad kullanımda. Sen misin? Yöneticiden devam onayı iste ya da başka bir ad seç.';
}

function ackNoteFor(reason: string | undefined): string {
  switch (reason) {
    case 'paused':
      return 'Oyun duraklatıldı; komut şimdi kabul edilmez.';
    case 'notCurrentSubmission':
      return 'Bu gönderi artık ekranda değil; puan güncellenmedi.';
    case 'cannotRate':
    case 'cannotSelect':
      return 'Bu aşamada bu komut geçerli değil.';
    case 'invalidNickname':
      return 'Bu ad kullanımda; başka bir ad dene.';
    case 'RECOVERING':
      return 'Devam ediyoruz; komutlar kısa süre içinde açık.';
    default:
      return 'Komut uygulanmadı.';
  }
}

export function OdaPage() {
  const { code = '' } = useParams();
  const roomCode = code.toUpperCase();

  const [stored, setStored] = useState<StoredParticipant | null>(() => loadParticipant(roomCode));
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [infoState, setInfoState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [takeoverOffer, setTakeoverOffer] = useState(false);
  const [takeover, setTakeover] = useState<
    { requestId: string; receipt: string; nickname: string } | null
  >(null);
  const [invalidToken, setInvalidToken] = useState(false);
  const [ackNote, setAckNote] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => loadSoundOn());
  const [browsing, setBrowsing] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [byeDismissedRound, setByeDismissedRound] = useState(0);
  const [transition, setTransition] = useState<ScreenTransition | null>(null);
  const selfLeftRef = useRef(false);
  const awaitingFirstViewRef = useRef(false);
  const dismissedRef = useRef<{ eliminated?: number; overtime?: number }>({});
  const mountedAt = useRef(Date.now()).current;
  const prevRoleRef = useRef<'player' | 'voter' | null>(null);

  const connection = useParticipantSocket(roomCode, stored?.token ?? null);
  const now = useSyncedNow(connection.socket, connection.seq);
  const { library, categories, loading: libraryLoading } = useLibrary(
    roomCode,
    connection.view !== null,
  );

  // Oda bilgisi: işletme adı ve oyuncu kartının durumu (SPEC 5.2).
  useEffect(() => {
    let alive = true;
    setInfoState('loading');
    getRoom(roomCode)
      .then((info) => {
        if (!alive) return;
        setRoomInfo(info);
        setInfoState('ready');
      })
      .catch(() => {
        if (alive) setInfoState('missing');
      });
    return () => {
      alive = false;
    };
  }, [roomCode]);

  // Katılımcı token'ı geçersizse (bağlanıyor ama görünüm gelmiyor) formu göster.
  useEffect(() => {
    if (!stored || connection.view) return;
    if (connection.state === 'reconnecting' && Date.now() - mountedAt > 8000) {
      forgetParticipant(roomCode);
      setStored(null);
      setInvalidToken(true);
    }
  }, [stored, connection.state, connection.view, mountedAt, roomCode]);

  // İlk görünüm geldiğinde seyircinin puanlama turunu kesinleştir.
  useEffect(() => {
    if (!awaitingFirstViewRef.current || !connection.view || !stored) return;
    awaitingFirstViewRef.current = false;
    const votingFromRound = votingFromRoundFor(connection.view);
    if (votingFromRound !== stored.votingFromRound) {
      const next = { ...stored, votingFromRound };
      saveParticipant(roomCode, next);
      setStored(next);
    }
  }, [connection.view, stored, roomCode]);

  // Elenme ve uzatma geçişleri (SPEC 9.1, 10.2).
  useEffect(() => {
    const view = connection.view;
    if (!view || !stored) return;
    const meId = stored.participantId;
    const role = view.participants.find((p) => p.id === meId)?.role;
    if (prevRoleRef.current === 'player' && role === 'voter' && !selfLeftRef.current)
      setTransition({ kind: 'eliminated', roundNo: roundNoOf(view) });
    prevRoleRef.current = role ?? null;
    if (view.phase.kind === 'selection') {
      const ot = overtimeState(view, meId);
      if (ot && dismissedRef.current.overtime !== view.phase.roundNo) {
        dismissedRef.current.overtime = view.phase.roundNo;
        setTransition({ kind: 'overtime', inTie: ot.inTie });
      }
    }
  }, [connection.view, stored]);

  const me: Me | null = useMemo(() => {
    if (!stored) return null;
    const p = connection.view?.participants.find((x) => x.id === stored.participantId);
    return {
      id: stored.participantId,
      nickname: p?.nickname ?? stored.nickname,
      role: p?.role ?? stored.role,
      votingFromRound: stored.votingFromRound,
    };
  }, [stored, connection.view]);

  async function handleJoin(input: { nickname: string; role: 'player' | 'voter' }) {
    setJoinError(null);
    setTakeoverOffer(false);
    try {
      const res = await joinRoom(roomCode, { nickname: input.nickname, wants: input.role });
      const next: StoredParticipant = {
        participantId: res.participantId,
        nickname: input.nickname,
        role: input.role,
        votingFromRound: roomInfo?.started ? 2 : 1,
        token: res.token,
      };
      saveParticipant(roomCode, next);
      selfLeftRef.current = false;
      prevRoleRef.current = input.role;
      awaitingFirstViewRef.current = true;
      setStored(next);
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.code === 'ROOM_NOT_FOUND') setInfoState('missing');
        else if (error.code === 'invalidNickname') {
          setJoinError(nicknameInUseNote());
          setTakeoverOffer(true);
        } else if (error.code === 'VOTERS_CLOSED')
          setJoinError('Yeni seyirci kabulü kapalı; yöneticiye sor.');
        else if (error.code === 'GAME_ALREADY_STARTED')
          setJoinError('Oyun başladı; yalnız seyirci olarak katılabilirsin.');
        else setJoinError('Katılım olmadı; biraz sonra tekrar dene.');
      } else setJoinError('Katılım olmadı; biraz sonra tekrar dene.');
    }
  }

  async function handleTakeover(nickname: string) {
    try {
      const res = await requestTakeover(roomCode, { nickname });
      if (res.status === 'approved') applyApprovedTakeover(res.participantId, res.token, nickname);
      else if ('requestId' in res)
        setTakeover({ requestId: res.requestId, receipt: res.receipt, nickname });
    } catch (error) {
      if (error instanceof HttpError && error.code === 'PARTICIPANT_NOT_FOUND')
        setJoinError('Bu adla bir katılımcı yok; kodu ve adı kontrol et.');
      else setJoinError('İstek gönderilemedi; biraz sonra tekrar dene.');
    }
  }

  function applyApprovedTakeover(participantId: string, token: string, nickname: string) {
    const next: StoredParticipant = {
      participantId,
      nickname,
      role: 'player',
      votingFromRound: roomInfo?.started ? 2 : 1,
      token,
    };
    saveParticipant(roomCode, next);
    setTakeover(null);
    selfLeftRef.current = false;
    prevRoleRef.current = null;
    awaitingFirstViewRef.current = true;
    setStored(next);
  }

  // Cihaz devri sonucunu kısa aralıklı yoklama (protokol §2).
  useEffect(() => {
    if (!takeover) return;
    let alive = true;
    const timer = window.setInterval(() => {
      requestTakeover(roomCode, { requestId: takeover.requestId, receipt: takeover.receipt })
        .then((res) => {
          if (!alive) return;
          if (res.status === 'approved')
            applyApprovedTakeover(res.participantId, res.token, takeover.nickname);
          else if (res.status === 'rejected') {
            setTakeover(null);
            setJoinError('İstek reddedildi. Farklı bir adla seyirci olarak katılabilirsin.');
          }
        })
        .catch(() => {
          /* Yoklama sürer. */
        });
    }, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [takeover, roomCode]);

  async function sendParticipant(cmd: Parameters<typeof connection.send>[0]) {
    try {
      const ack = await connection.send(cmd);
      if (!ack.ok) setAckNote(ackNoteFor(ack.reason));
      return ack;
    } catch {
      setAckNote('Komut gönderilemedi; bağlantı bekleniyor.');
      return { ok: false };
    }
  }

  // "Bitirdim" durumu: kendi ack ile işaretlenir; aşama değişince sıfırlanır.
  useEffect(() => {
    if (connection.view?.phase.kind !== 'review') setReviewDone(false);
  }, [connection.view?.phase.kind]);

  useEffect(() => {
    if (!ackNote) return;
    const timer = window.setTimeout(() => setAckNote(null), 3000);
    return () => window.clearTimeout(timer);
  }, [ackNote]);

  function toggleSound() {
    setSoundOn((on) => {
      saveSoundOn(!on);
      return !on;
    });
  }

  function handleRate(submissionId: string, score: RateScore) {
    void sendParticipant({ type: 'rate', submissionId, score });
  }

  function handleLeaveToVoter() {
    selfLeftRef.current = true;
    void sendParticipant({ type: 'leaveToVoter' });
  }

  async function handleShare() {
    const url = `${location.origin}/oda/${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareHint('Link kopyalandı.');
    } catch {
      setShareHint(url);
    }
    window.setTimeout(() => setShareHint(null), 2500);
  }

  /* ------------------------------ Ekranlar ------------------------------- */

  if (infoState === 'missing')
    return <RoomNotFoundScreen onBack={() => (location.href = '/')} />;

  if (connection.reason !== null && connection.state === 'closed')
    return <ClosedScreens reason={connection.reason} />;

  if (takeover)
    return (
      <PageFrame>
        <TakeoverPendingScreen nickname={takeover.nickname} onCancel={() => setTakeover(null)} />
      </PageFrame>
    );

  if (!connection.view) {
    if (stored) {
      // Bağlantı kuruluyor ya da kopmuş; görünüm gelene kadar bekle.
      return (
        <PageFrame>
          <ReconnectingOverlay className="flex-1" />
        </PageFrame>
      );
    }
    if (infoState === 'ready' && roomInfo)
      return (
        <PageFrame>
          <JoinScreen
            code={roomCode}
            businessName={roomInfo.businessName}
            allowPlayer={!roomInfo.started}
            serverError={invalidToken ? 'Oturumun geçersizleşti; yeniden katıl.' : joinError}
            takeoverAvailable={takeoverOffer}
            onRequestTakeover={(nickname) => void handleTakeover(nickname)}
            onEnter={({ nickname, role }) => void handleJoin({ nickname, role })}
          />
        </PageFrame>
      );
    return (
      <PageFrame>
        <ConnectingScreen />
      </PageFrame>
    );
  }

  const view = connection.view;
  const rosterEntry = me ? view.participants.find((p) => p.id === me.id) : undefined;

  // Onay kuyruğu: kimlik görünümde henüz yok (SPEC 5.2).
  if (me && !rosterEntry) return <PageFrame><PendingApprovalScreen className="flex-1" /></PageFrame>;

  if (me && rosterEntry?.needsNickname)
    return (
      <PageFrame>
        <NicknameChangeScreen
          currentNickname={me.nickname}
          onSubmit={(nickname) => void sendParticipant({ type: 'changeNickname', nickname })}
        />
      </PageFrame>
    );

  if (!me) return null;

  if (browsing)
    return (
      <PageFrame>
        <LibraryBrowseScreen
          library={library}
          onClose={() => setBrowsing(false)}
        />
      </PageFrame>
    );

  if (view.status === 'finished' || view.phase.kind === 'finished')
    return (
      <PageFrame>
        <GameOverScreen view={view} />
      </PageFrame>
    );

  if (transition)
    return (
      <PageFrame>
        {transition.kind === 'eliminated' ? (
          <EliminatedScreen onContinue={() => setTransition(null)} className="flex-1" />
        ) : (
          <OvertimeScreen
            inTie={transition.inTie}
            onContinue={() => setTransition(null)}
            className="flex-1"
          />
        )}
      </PageFrame>
    );

  if (view.status === 'paused')
    return (
      <PageFrame>
        <PausedOverlay className="flex-1" />
      </PageFrame>
    );

  const phase = view.phase;
  const overtime = phase.kind === 'selection' ? overtimeState(view, me.id) : null;
  // Bay geçen oyuncuya bay geçişi göster (SPEC 9.1); "Puanlamaya geç" ile kapanır.
  const showBye =
    phase.kind === 'selection' && view.byes.includes(me.id) && byeDismissedRound !== phase.roundNo;

  if (showBye)
    return (
      <PageFrame>
        <ByeScreen onContinue={() => setByeDismissedRound(phase.roundNo)} className="flex-1" />
      </PageFrame>
    );

  return (
    <PageFrame>
      <LibraryMediaProvider entries={library.map((m) => ({ memeId: m.id }))}>
        {connection.state !== 'open' ? (
          <div className="fixed inset-0 z-40 bg-background/95">
            <ReconnectingOverlay className="h-full" />
          </div>
        ) : null}
        {connection.recoveryResumesAt !== null && connection.recoveryResumesAt > now ? (
          <div className="fixed inset-0 z-40 bg-background/95">
            <ResumeCountdownOverlay
              secondsLeft={Math.max(0, Math.ceil((connection.recoveryResumesAt - now) / 1000))}
              className="h-full"
            />
          </div>
        ) : null}
        <Scene
          view={view}
          me={me}
          now={now}
          library={library}
          categories={categories}
          libraryLoading={libraryLoading}
          onRate={handleRate}
          onLeave={handleLeaveToVoter}
          onReviewFinish={async () => {
            const ack = await sendParticipant({ type: 'finishReview' });
            if (ack.ok) setReviewDone(true);
          }}
          onSelect={(media: MediaRef) => void sendParticipant({ type: 'select', media })}
          onConfirm={() => void sendParticipant({ type: 'confirm' })}
          onBrowseLibrary={() => setBrowsing(true)}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          overtime={overtime}
          roomInfo={roomInfo}
          roomCode={roomCode}
          onShare={() => void handleShare()}
          shareHint={shareHint}
          reviewFinished={reviewDone}
        />
        {ackNote ? (
          <p
            role="status"
            className="fixed bottom-2 left-1/2 z-50 -translate-x-1/2 rounded-md bg-surface px-4 py-2 text-sm text-danger shadow-lg"
          >
            {ackNote}
          </p>
        ) : null}
      </LibraryMediaProvider>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col">{children}</div>;
}

function ConnectingScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p
        aria-hidden="true"
        className="font-display text-3xl uppercase text-accent motion-safe:animate-pulse-slow"
      >
        Meme of Legends
      </p>
      <p className="text-sm text-muted">Odaya bağlanılıyor…</p>
    </div>
  );
}

interface SceneProps {
  view: View;
  me: Me;
  now: number;
  library: LibraryEntry[];
  categories: string[];
  libraryLoading: boolean;
  onRate: (submissionId: string, score: RateScore) => void;
  onLeave: () => void;
  onReviewFinish: () => void;
  onSelect: (media: MediaRef) => void;
  onConfirm: () => void;
  onBrowseLibrary: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  overtime: { inTie: boolean } | null;
  roomInfo: RoomInfo | null;
  roomCode: string;
  onShare: () => void;
  shareHint: string | null;
  reviewFinished: boolean;
}

function Scene(props: SceneProps) {
  const { view, me, now, library, libraryLoading } = props;
  const phase = view.phase;
  const room = {
    code: props.roomCode,
    businessName: props.roomInfo?.businessName ?? null,
    shareUrl: `${location.origin}/oda/${props.roomCode}`,
  };

  switch (phase.kind) {
    case 'lobby':
      return (
        <LobbyScreen
          view={view}
          me={me}
          room={room}
          onShare={props.onShare}
          shareHint={props.shareHint}
          onLeave={me.role === 'player' ? props.onLeave : undefined}
        />
      );
    case 'selection': {
      if (libraryLoading)
        return <WaitScreen note="Kütüphane yükleniyor…" />;
      if (me.role === 'player' && !view.byes.includes(me.id) && !props.overtime)
        return (
          <SelectionScreen
            view={view}
            me={me}
            now={now}
            library={libraryEntries(library)}
            categories={props.categories}
            onSelect={props.onSelect}
            onConfirm={props.onConfirm}
          />
        );
      return (
        <SpectatorSelectionScreen
          view={view}
          me={me}
          now={now}
          onBrowseLibrary={props.onBrowseLibrary}
        />
      );
    }
    case 'presentation': {
      const sub = view.submissions[0] ?? null;
      const rivalPlayer =
        view.matches.find((m) => m.includes(me.id))?.find((x) => x !== me.id) ?? null;
      const rivalSubmissionId =
        rivalPlayer && sub && sub.id !== view.ownSubmissionId && sub.canRate === false && !sub.hidden
          ? sub.id
          : null;
      return (
        <PresentationScreen
          view={view}
          me={me}
          now={now}
          onRate={props.onRate}
          onToggleMute={props.onToggleSound}
          muted={!props.soundOn}
          ownSubmissionId={view.ownSubmissionId ?? null}
          rivalSubmissionId={rivalSubmissionId}
          index={view.presentation?.index}
          total={view.presentation?.total}
        />
      );
    }
    case 'review':
      return (
        <ReviewScreen
          view={view}
          now={now}
          onRate={props.onRate}
          onFinish={props.onReviewFinish}
          finished={props.reviewFinished}
          ownSubmissionId={view.ownSubmissionId ?? null}
        />
      );
    case 'reveal':
    case 'results':
    case 'draw':
      return (
        <RoundResultScreen
          view={view}
          now={now}
          outcomes={outcomesOf(view)}
          drawCandidates={drawCandidatesOf(view)}
        />
      );
    case 'finished':
      return <GameOverScreen view={view} />;
  }
}

export function libraryEntries(library: LibraryEntry[]) {
  return library.map((m) => ({
    memeId: m.id,
    title: m.title,
    category: m.category ?? 'Diğer',
    mediaType: m.mediaType,
  }));
}

/** Kura adayları: uzatma turunun açıklanan gönderilerinden okunur (SPEC 10.2). */
function drawCandidatesOf(view: View): string[] {
  if (view.phase.kind !== 'draw') return [];
  return view.submissions
    .map((s) => s.playerId)
    .filter((id): id is string => !!id)
    .map((id) => view.participants.find((p) => p.id === id)?.nickname ?? '?');
}

/** Kütüphane göz atma ekranı: seyirci/bay/gönderi yapmayan için (SPEC 7.1). */
function LibraryBrowseScreen({
  library,
  onClose,
}: {
  library: LibraryEntry[];
  onClose: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-4 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl uppercase">Kütüphane</h1>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-bold hover:border-accent"
        >
          Kapat
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {library.map((meme) => (
          <li key={meme.id}>
            <MemeFrame
              media={{ source: 'system', memeId: meme.id, mediaType: meme.mediaType }}
              title={meme.title}
              className="aspect-square min-h-0 flex-none"
            />
          </li>
        ))}
      </ul>
    </main>
  );
}

function WaitScreen({ note }: { note: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p aria-hidden="true" className="font-display text-3xl uppercase text-accent motion-safe:animate-pulse-slow">
        ⋯
      </p>
      <p className="text-sm text-muted">{note}</p>
    </div>
  );
}

function ClosedScreens({ reason }: { reason: SocketReason }) {
  switch (reason) {
    case 'kicked':
      return <KickedScreen />;
    case 'superseded':
      return <SupersededScreen />;
    default:
      return (
        <SessionEndedScreen reason={reason === 'roomExpired' ? 'roomExpired' : 'sessionEnded'} />
      );
  }
}
