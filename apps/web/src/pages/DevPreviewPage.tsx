import { useMemo, useState } from 'react';
import type { Submission, View } from '@mol/engine';
import type { RateScore, RoundOutcome } from '@/lib/contracts';
import {
  ME_ID,
  fakeCategories,
  fakeDrawView,
  fakeFinishedView,
  fakeLobbyView,
  fakeLibrary,
  fakeMe,
  fakePresentationView,
  fakeRevealView,
  fakeResultsView,
  fakeReviewView,
  fakeRoom,
  fakeSelectionPlayerView,
  fakeSpectatorSelectionView,
} from '@/lib/fake';
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
  DrawScreen,
  EliminatedScreen,
  KickedScreen,
  NicknameChangeScreen,
  OvertimeScreen,
  PausedOverlay,
  ReconnectingOverlay,
  ResumeCountdownOverlay,
} from '@/screens/StatusScreens';
import { MemeFrame } from '@/components/MemeFrame';
import { Note, Screen } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const WIDTHS = [320, 390, 430] as const;

function Frame({ title, note, width, children }: { title: string; note?: string; width: number; children: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-2">
      <h2 className="font-display text-lg uppercase">{title}</h2>
      {note ? <p className="text-center text-xs text-muted">{note}</p> : null}
      <div
        className="flex h-[844px] flex-col overflow-y-auto rounded-xl border border-line bg-background"
        style={{ width }}
      >
        {children}
      </div>
    </section>
  );
}

function ownSubmission(media: Submission['media'], confirmed = false): Submission {
  return {
    id: 's1',
    playerId: ME_ID,
    media,
    confirmed,
    invalid: false,
    hidden: false,
    compensation: false,
    customType: null,
  };
}

function withOwnScore(view: View, score: number | undefined): View {
  const v = structuredClone(view);
  if (v.submissions[0]) v.submissions[0].ownScore = score;
  return v;
}

/* ------------------------------- Ekranlar -------------------------------- */

function JoinEntry() {
  const [entered, setEntered] = useState<{ nickname: string; role: string } | null>(null);
  if (entered) {
    return (
      <Screen className="h-full">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="font-display text-2xl uppercase">Girildi ✓</p>
          <Note>
            {entered.nickname} ({entered.role}) — gerçek oyunda lobiye geçilir; sıfırlamak için
            yenile.
          </Note>
        </div>
      </Screen>
    );
  }
  return (
    <JoinScreen
      code="KA7FT2"
      businessName="Anka Kafe"
      onEnter={({ nickname, role }) => setEntered({ nickname, role })}
    />
  );
}

function JoinCodeEntry() {
  return <JoinScreen onEnter={() => undefined} />;
}

function LobbyEntry() {
  const [hint, setHint] = useState<string | null>(null);
  return (
    <LobbyScreen
      view={fakeLobbyView()}
      me={fakeMe('player')}
      room={fakeRoom()}
      onShare={() => {
        setHint('Link kopyalandı.');
        window.setTimeout(() => setHint(null), 2500);
      }}
      shareHint={hint}
    />
  );
}

function SelectionEntry() {
  const now = useNow(250);
  const [own, setOwn] = useState<Submission | null>(null);
  const view = fakeSelectionPlayerView(now, own);
  return (
    <SelectionScreen
      view={view}
      me={fakeMe('player')}
      now={now}
      library={fakeLibrary()}
      categories={fakeCategories()}
      onSelect={(media) => setOwn(ownSubmission(media))}
      onConfirm={() => setOwn((o) => (o ? { ...o, confirmed: true } : o))}
    />
  );
}

function SpectatorSelectionEntry() {
  const now = useNow(250);
  const [browsing, setBrowsing] = useState(false);
  const me = { ...fakeMe('voter'), votingFromRound: 3 };
  if (browsing) {
    return (
      <Screen className="h-full">
        <h1 className="font-display text-xl uppercase">Kütüphane</h1>
        <ul className="grid grid-cols-2 gap-2">
          {fakeLibrary().map((meme) => (
            <li key={meme.memeId}>
              <MemeFrame
                media={{ source: 'system', memeId: meme.memeId, mediaType: meme.mediaType }}
                className="aspect-square min-h-0"
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setBrowsing(false)}
          className="mt-3 min-h-12 w-full rounded-md border border-line bg-surface font-bold"
        >
          Kapat
        </button>
      </Screen>
    );
  }
  return (
    <SpectatorSelectionScreen
      view={fakeSpectatorSelectionView(now)}
      me={me}
      now={now}
      onBrowseLibrary={() => setBrowsing(true)}
    />
  );
}

type PresentationVariant =
  | 'image'
  | 'gif'
  | 'video'
  | 'youtube'
  | 'locked-own'
  | 'locked-rival'
  | 'last-call'
  | 'hidden';

function PresentationEntry({ variant }: { variant: PresentationVariant }) {
  const now = useNow(250);
  const [muted, setMuted] = useState(true);
  const [score, setScore] = useState<RateScore | undefined>(undefined);
  const base = fakePresentationView(now, variant);
  const view = withOwnScore(base, score);
  return (
    <PresentationScreen
      view={view}
      me={fakeMe('player')}
      now={now}
      onRate={(_submissionId, value) => setScore(value)}
      onToggleMute={() => setMuted((m) => !m)}
      muted={muted}
      ownSubmissionId={variant === 'locked-own' ? 's4' : null}
      rivalSubmissionId={variant === 'locked-rival' ? 's4' : null}
      index={3}
      total={8}
    />
  );
}

function ReviewEntry({ finished = false }: { finished?: boolean }) {
  const now = useNow(1000);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [done, setDone] = useState(finished);
  const base = fakeReviewView(now);
  const view = useMemo(() => {
    const v = structuredClone(base);
    for (const s of v.submissions) {
      const value = ratings[s.id];
      s.ownScore = value;
      s.canRate = s.id !== 's4' && !s.hidden;
    }
    return v;
  }, [base, ratings]);
  return (
    <ReviewScreen
      view={view}
      now={now}
      ownSubmissionId="s4"
      doneCount={{ done: 18, total: 30 }}
      finished={done}
      onRate={(submissionId, score) => setRatings((r) => ({ ...r, [submissionId]: score }))}
      onFinish={() => setDone(true)}
    />
  );
}

const OUTCOMES: Record<string, RoundOutcome> = {
  p2: 'advanced',
  p5: 'eliminated',
  p4: 'advanced',
  p7: 'eliminated',
  p6: 'bye',
};

function RevealEntry({ step }: { step: number }) {
  const now = useNow(250);
  return <RoundResultScreen view={fakeRevealView(now, step)} now={now} outcomes={OUTCOMES} />;
}

function ResultsEntry({ mode }: { mode: 'elimination' | 'league' }) {
  const now = useNow(250);
  return (
    <RoundResultScreen
      view={fakeResultsView(now, mode)}
      now={now}
      outcomes={mode === 'elimination' ? OUTCOMES : undefined}
    />
  );
}

function DrawEntry() {
  const now = useNow(250);
  return <RoundResultScreen view={fakeDrawView(now)} now={now} drawCandidates={['Ali', 'Mehmet']} />;
}

function GameOverEntry() {
  return <GameOverScreen view={fakeFinishedView()} />;
}

function StatusEntries() {
  const [nicknameSaved, setNicknameSaved] = useState<string | null>(null);
  const [continued, setContinued] = useState<string | null>(null);
  const now = useNow(500);
  const seconds = 3 - Math.floor((now % 4000) / 1000);
  return (
    <>
      <Frame title="Duraklatıldı" width={390}>
        <PausedOverlay className="h-full" />
      </Frame>
      <Frame title="Yeniden bağlanıyor" width={390}>
        <ReconnectingOverlay className="h-full" />
      </Frame>
      <Frame title="Devam ediyoruz 3-2-1" width={390}>
        <ResumeCountdownOverlay secondsLeft={seconds} className="h-full" />
      </Frame>
      <Frame title="Odadan atıldın" width={390}>
        <KickedScreen className="h-full" />
      </Frame>
      <Frame title="Takma adını değiştir" width={390}>
        <NicknameChangeScreen
          currentNickname="Katılımcı 7"
          onSubmit={(nickname) => setNicknameSaved(nickname)}
        />
        {nicknameSaved ? <p className="pb-4 text-center text-sm text-success">Kaydedildi: {nicknameSaved}</p> : null}
      </Frame>
      <Frame title="Eldin → jüri" width={390}>
        <EliminatedScreen onContinue={() => setContinued('jüri')} />
        {continued ? <p className="pb-4 text-center text-sm text-muted">Devam edildi: {continued}</p> : null}
      </Frame>
      <Frame title="Bay geçtin" width={390}>
        <ByeScreen onContinue={() => setContinued('bay')} />
      </Frame>
      <Frame title="Uzatma turu (berabere kaldın)" width={390}>
        <OvertimeScreen inTie onContinue={() => setContinued('uzatma')} />
      </Frame>
      <Frame title="Uzatma turu (izleyici)" width={390}>
        <OvertimeScreen inTie={false} onContinue={() => setContinued('uzatma-izleyici')} />
      </Frame>
      <Frame title="Kura" width={390}>
        <DrawScreen candidates={['Ali', 'Mehmet']} />
      </Frame>
    </>
  );
}

/* --------------------------- Önizleme sayfası ---------------------------- */

export function DevPreviewPage() {
  const [width, setWidth] = useState<number>(390);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-background/95 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="font-display text-xl uppercase">Geliştirici önizleme</h1>
          <p className="text-xs text-muted">Tüm ekranlar sahte `View` verisiyle; bağlantı M3b'de.</p>
        </div>
        <div role="group" aria-label="Önizleme genişliği" className="flex gap-1">
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={width === w}
              onClick={() => setWidth(w)}
              className={cn(
                'min-h-11 min-w-14 rounded-md border px-2 text-sm font-bold',
                width === w ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface',
              )}
            >
              {w}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col items-center gap-10 px-4 py-8">
        <h2 className="sr-only">Katılım ve lobi</h2>
        <Frame title="Katılım (kod girişi)" note="Yol: /" width={width}>
          <JoinCodeEntry />
        </Frame>
        <Frame title="Katılım (odaya)" note="Yol: /oda/KA7FT2" width={width}>
          <JoinEntry />
        </Frame>
        <Frame title="Lobi" width={width}>
          <LobbyEntry />
        </Frame>

        <Frame title="Seçim (oyuncu)" width={width}>
          <SelectionEntry />
        </Frame>
        <Frame title="Seçim (seyirci)" width={width}>
          <SpectatorSelectionEntry />
        </Frame>

        {(
          [
            ['image', 'Gösterim: resim'],
            ['gif', 'Gösterim: GIF'],
            ['video', 'Gösterim: video (Sesi aç)'],
            ['youtube', 'Gösterim: YouTube'],
            ['locked-own', 'Gösterim: kendi gönderin (kilitli)'],
            ['locked-rival', 'Gösterim: rakip kilitli'],
            ['last-call', 'Gösterim: son karar'],
            ['hidden', 'Gösterim: gizlenmiş gönderi'],
          ] as Array<[PresentationVariant, string]>
        ).map(([variant, title]) => (
          <Frame key={variant} title={title} width={width}>
            <PresentationEntry variant={variant} />
          </Frame>
        ))}

        <Frame title="Final gözden geçirme" width={width}>
          <ReviewEntry />
        </Frame>
        <Frame title="Final gözden geçirme (bitirdin)" width={width}>
          <ReviewEntry finished />
        </Frame>

        <Frame title="Sonuç: açıklama (1. adım)" width={width}>
          <RevealEntry step={0} />
        </Frame>
        <Frame title="Sonuç: açıklama (2. adım)" width={width}>
          <RevealEntry step={1} />
        </Frame>
        <Frame title="Sonuç: eleme + geri sayım" width={width}>
          <ResultsEntry mode="elimination" />
        </Frame>
        <Frame title="Sonuç: lig tablosu" width={width}>
          <ResultsEntry mode="league" />
        </Frame>
        <Frame title="Kura" width={width}>
          <DrawEntry />
        </Frame>

        <Frame title="Oyun sonu" width={width}>
          <GameOverEntry />
        </Frame>

        <StatusEntries />
      </div>
    </div>
  );
}
