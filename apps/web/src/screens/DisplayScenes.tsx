import { DEFAULT_TIMING, mediaSlot, type View } from '@mol/engine';
import { Countdown } from '@/components/Countdown';
import { MemeFrame } from '@/components/MemeFrame';
import { QrCode } from '@/components/QrCode';
import { Card, Note } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatClock, formatScore, isFinalRoundResults, MODE_LABELS, remainingSeconds } from '@/lib/format';
import type { ReactNode } from 'react';

function nicknameOf(view: View, id: string): string {
  return view.participants.find((p) => p.id === id)?.nickname ?? '?';
}

export interface StageRoom {
  /** 6 karakterlik oda kodu. */
  code: string;
  /** Katılım linki (QR içeriği). */
  joinUrl: string;
}

/** 16:9 sahne çerçevesi. */
export function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-dvh w-full items-center justify-center bg-background p-4">
      <div className="relative flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-background">
        {children}
      </div>
    </div>
  );
}

/** Lobi sahnesi: büyük QR + oda kodu + katılımcılar (SPEC 13.1). */
export function DisplayLobbyScene({ view, room }: { view: View; room: StageRoom }) {
  const players = view.participants.filter((p) => p.role === 'player');
  return (
    <div className="flex flex-1 items-center justify-center gap-14 p-12">
      <div className="flex flex-col items-center gap-4">
        <QrCode value={room.joinUrl} size={300} />
        <p className="font-display text-6xl tracking-widest text-accent">{room.code}</p>
        <p className="text-sm text-muted">Oyun kodunu yaz ya da QR'ı okut</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Oyun başlamak üzere</p>
          <p className="font-display text-5xl uppercase leading-tight">
            Meme <span className="text-accent">of</span> Legends
          </p>
        </div>
        <Card>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Mod</span>
            <span className="font-display text-2xl uppercase">{MODE_LABELS[view.config.mode]}</span>
          </div>
        </Card>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
            {players.length} oyuncu · {view.spectatorCount} seyirci
          </p>
          {players.length === 0 ? (
            <Note>İlk oyuncular katıldığında adları burada görünür.</Note>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {players.map((p) => (
                <li
                  key={p.id}
                  className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2 font-display text-lg uppercase"
                >
                  {p.nickname}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Seçim sahnesi: büyük durum + geri sayım + hazır işaretleri. */
export function DisplaySelectionScene({ view, now, room }: { view: View; now: number; room: StageRoom }) {
  const phase = view.phase;
  const secondsLeft = phase.kind === 'selection' ? Math.max(0, (phase.endsAt - now) / 1000) : 0;
  const players = view.participants.filter((p) => p.role === 'player');
  const readyCount = players.filter((p) => p.ready).length;
  const pct = players.length > 0 ? Math.round((readyCount / players.length) * 100) : 0;
  return (
    <div className="flex flex-1 flex-col gap-8 p-12">
      <div className="flex items-start justify-between gap-10">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Durum</p>
          <p className="font-display text-6xl uppercase leading-tight text-accent">
            {view.prompt?.text ?? '—'}
          </p>
        </div>
        <Countdown
          secondsLeft={secondsLeft}
          totalSeconds={view.config.selectionSeconds}
          className="w-72 shrink-0 [&_time]:text-6xl"
        />
      </div>
      <div className="flex flex-1 flex-col gap-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm text-muted">oyuncu seçti</span>
            <span className="font-display text-4xl">
              {readyCount}/{players.length}
            </span>
          </div>
          <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {view.matches.length > 0 ? (
          <section aria-label="Eşleşmeler" className="grid grid-cols-3 gap-3">
            {view.matches.map((match, index) => (
              <DuelCard
                key={index}
                names={match.map((id) => nicknameOf(view, id))}
                marks={match.map((id) => view.participants.find((p) => p.id === id)?.ready ?? false)}
              />
            ))}
          </section>
        ) : null}
        {view.byes.length > 0 ? (
          <p className="text-sm text-muted">
            Bay: {view.byes.map((id) => nicknameOf(view, id)).join(', ')}
          </p>
        ) : null}
      </div>
      <CornerHud view={view} room={room} />
    </div>
  );
}

function DuelCard({ names, marks }: { names: string[]; marks: boolean[] }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4">
      <span className="truncate font-display text-2xl uppercase">
        {names[0]} <span className="text-muted">–</span> {names[1] ?? '—'}
      </span>
      <span className="flex items-center gap-2" aria-label={`Hazır: ${marks.filter(Boolean).length}/2`}>
        {marks.map((ready, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={
              ready
                ? 'flex h-8 w-8 items-center justify-center rounded-full bg-accent font-bold text-accent-ink'
                : 'flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised text-muted'
            }
          >
            {ready ? '✓' : '·'}
          </span>
        ))}
      </span>
    </div>
  );
}

/** Gösterim sahnesi: büyük gönderi, süre çubuğu, son karar, canlı oy sayacı. */
export function DisplayPresentationScene({
  view,
  now,
  room,
}: {
  view: View;
  now: number;
  room: StageRoom;
}) {
  const phase = view.phase;
  const submission = view.submissions[0] ?? null;
  if (phase.kind !== 'presentation' || !submission) return null;
  const remaining = Math.max(0, (phase.endsAt - now) / 1000);
  const lastCall = now >= phase.lastCallAt;
  const slot = submission.media
    ? mediaSlot(submission.media, { now: 0, prompts: [], timing: DEFAULT_TIMING })
    : null;
  const slotTotal = slot ? (slot.watch + slot.last) / 1000 : 0;
  const pct = slotTotal > 0 ? Math.max(0, Math.min(100, (remaining / slotTotal) * 100)) : 0;
  return (
    <div className="flex flex-1 flex-col gap-4 p-12">
      <div className="flex items-baseline justify-between gap-8">
        <p className="font-display text-5xl uppercase text-accent">{view.prompt?.text ?? '—'}</p>
        {view.presentation ? (
          <p className="text-sm text-muted">
            Gönderi {view.presentation.index + 1} / {view.presentation.total}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <MemeFrame
          media={submission.media}
          className="mx-auto aspect-video w-full max-w-[860px] flex-none"
        />
      </div>
      <div className="flex items-center gap-6">
        <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
          <div
            className={cn('h-full rounded-full', lastCall ? 'bg-accent' : 'bg-muted')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p
          className={cn(
            'font-display text-4xl tabular-nums',
            lastCall && 'text-accent motion-safe:animate-pulse-slow',
          )}
        >
          {formatClock(remaining)}
        </p>
        {submission.ratingProgress ? (
          <p className="min-w-44 text-right text-sm text-muted">
            {submission.ratingProgress.received}/{submission.ratingProgress.eligible} kişi puan
            verdi
          </p>
        ) : null}
      </div>
      {lastCall ? (
        <p
          aria-hidden="true"
          className="text-center font-display text-2xl uppercase text-accent motion-safe:animate-pulse-slow"
        >
          Son karar — puanlar hâlâ değişebilir
        </p>
      ) : null}
      <CornerHud view={view} room={room} />
    </div>
  );
}

/** Final gözden geçirme sahnesi: küçük resimler + bekleme (SPEC 13.1). */
export function DisplayReviewScene({ view, now, room }: { view: View; now: number; room: StageRoom }) {
  const phase = view.phase;
  const secondsLeft = phase.kind === 'review' ? Math.max(0, (phase.endsAt - now) / 1000) : 0;
  return (
    <div className="flex flex-1 flex-col gap-6 p-12">
      <div className="flex items-baseline justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">
            Final gözden geçirme
          </p>
          <p className="font-display text-5xl uppercase text-accent">{view.prompt?.text ?? '—'}</p>
        </div>
        <p className="font-display text-5xl tabular-nums">{formatClock(secondsLeft)}</p>
      </div>
      <ul className="grid grid-cols-4 gap-4 overflow-hidden">
        {view.submissions.map((submission) => (
          <li key={submission.id}>
            <MemeFrame
              media={submission.media}
              className="aspect-square w-full flex-none"
              title={submission.hidden ? 'Gizlendi' : undefined}
            />
          </li>
        ))}
      </ul>
      <Note className="text-center text-lg">
        Telefonlarda son puanlar veriliyor; bitirenler bekleniyor.
      </Note>
      <CornerHud view={view} room={room} />
    </div>
  );
}

/** Sonuç sahnesi: sırayla açıklama + tablo + kura. */
export function DisplayResultsScene({
  view,
  now,
  room,
  drawCandidates,
}: {
  view: View;
  now: number;
  room: StageRoom;
  drawCandidates: string[];
}) {
  const phase = view.phase;
  const secondsLeft = 'endsAt' in phase ? remainingSeconds(phase.endsAt, now) : 0;
  const revealed = view.submissions.filter((s) => s.playerId !== undefined);
  const scoreOf = (id: string) => revealed.find((s) => s.playerId === id)?.score;
  if (phase.kind === 'draw')
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12">
        <p className="font-display text-6xl uppercase text-accent motion-safe:animate-shuffle">
          Kura çekiliyor…
        </p>
        <p className="font-display text-4xl uppercase">{drawCandidates.join(' 🆚 ')}</p>
        <Note>Beraberlik zararla çözülüyor.</Note>
        <CornerHud view={view} room={room} />
      </div>
    );
  return (
    <div className="flex flex-1 flex-col gap-5 p-12">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-5xl uppercase">
          {'roundNo' in phase ? phase.roundNo : 0}. tur sonuçları
        </p>
        {secondsLeft > 0 ? (
          <p className="font-display text-4xl tabular-nums">{formatClock(secondsLeft)}</p>
        ) : null}
      </div>
      {view.matches.length > 0 ? (
        <section aria-label="Açıklanan sonuçlar" className="grid grid-cols-2 gap-4">
          {view.matches.map((match, index) => {
            const [a, b] = match;
            const scoreA = a ? scoreOf(a) : undefined;
            const scoreB = b ? scoreOf(b) : undefined;
            const winner =
              !scoreA || !scoreB
                ? null
                : scoreA.average === scoreB.average
                  ? null
                  : scoreA.average > scoreB.average
                    ? a
                    : b;
            return (
              <Card
                key={index}
                className={cn('flex flex-col justify-center gap-2 p-5', index === 0 ? '' : 'opacity-90')}
              >
                <p className="text-xs font-bold uppercase tracking-widest text-muted">
                  {index + 1}. düello
                </p>
                {(
                  [
                    [a, scoreA] as const,
                    [b, scoreB] as const,
                  ]
                ).map(([id, score], i) => (
                  <div
                    key={i}
                    className={
                      winner === id
                        ? 'flex items-center justify-between rounded-md bg-accent/15 px-4 py-3'
                        : 'flex items-center justify-between rounded-md bg-surface-raised px-4 py-3'
                    }
                  >
                    <span className="truncate font-display text-2xl uppercase">
                      {id ? nicknameOf(view, id) : '—'}
                    </span>
                    <span className="flex items-baseline gap-3">
                      {score ? (
                        <>
                          <span className="font-display text-3xl">{formatScore(score.average)}</span>
                          <span className="text-xs text-muted">{score.votes} oy</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted">açıklanıyor…</span>
                      )}
                    </span>
                  </div>
                ))}
              </Card>
            );
          })}
        </section>
      ) : null}
      {view.byes.length > 0 ? (
        <p className="text-sm text-muted">
          Bay: {view.byes.map((id) => nicknameOf(view, id)).join(', ')}
        </p>
      ) : null}
      {view.table.length > 0 && phase.kind !== 'reveal' ? (
        <section aria-label="Tablo" className="grid grid-cols-3 gap-x-8 gap-y-1">
          {view.table.map((row) => (
            <div
              key={row.participantId}
              className="flex items-center justify-between rounded-md bg-surface px-4 py-2"
            >
              <span className="truncate">
                <span className="font-display mr-2 text-muted">{row.rank}.</span>
                <span className="font-display text-lg uppercase">
                  {nicknameOf(view, row.participantId)}
                </span>
              </span>
              <span className="font-display text-xl">{formatScore(row.score)}</span>
            </div>
          ))}
        </section>
      ) : null}
      {phase.kind === 'results' ? (
        <p className="text-center text-sm text-muted">
          {isFinalRoundResults(view)
            ? 'Final sonuçları geliyor.'
            : `Sonraki tur ${secondsLeft} saniye içinde başlıyor.`}
        </p>
      ) : null}
      <CornerHud view={view} room={room} />
    </div>
  );
}

/** Oyun sonu sahnesi: şampiyon + kürsü + jüri ödülleri + sıralama. */
export function DisplayFinishedScene({ view, room }: { view: View; room: StageRoom }) {
  const result = view.result;
  const top3 = (result?.ranking ?? []).slice(0, 3);
  return (
    <div className="flex flex-1 flex-col gap-6 p-12">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Oyun bitti</p>
        <p className="font-display text-7xl uppercase leading-tight">
          Şampiyon:{' '}
          <span className="text-accent">
            {result?.champion ? nicknameOf(view, result.champion) : 'Yok'}
          </span>
        </p>
      </div>
      <section aria-label="Kürsü" className="flex items-end justify-center gap-3">
        {/* Soldan sağa: 2., 1. (en yüksek, vurgulu), 3.; rakam sıra numarasıdır. */}
        {[1, 0, 2].map((slot) => {
          const entry = top3[slot];
          if (!entry) return null;
          const heights = ['h-40', 'h-28', 'h-24'];
          return (
            <div key={entry.participantId} className="flex w-40 flex-col items-center gap-2">
              <span className="font-display text-2xl uppercase">
                {nicknameOf(view, entry.participantId)}
              </span>
              <div
                className={
                  entry.rank === 1
                    ? `flex w-full items-start justify-center rounded-t-[var(--radius-card)] border border-accent bg-accent/20 ${heights[entry.rank - 1]}`
                    : `flex w-full items-start justify-center rounded-t-[var(--radius-card)] border border-line bg-surface ${heights[entry.rank - 1]}`
                }
              >
                <span className="font-display pt-3 text-5xl">{entry.rank}</span>
              </div>
            </div>
          );
        })}
      </section>
      {result?.jury ? (
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ['En sert jüri', result.jury.harshest],
              ['En cömert jüri', result.jury.mostGenerous],
            ] as const
          ).map(([title, entries]) =>
            entries.length === 0 ? null : (
              <Card key={title} className="text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-muted">{title}</p>
                <p className="font-display text-2xl uppercase">{entries[0]?.nickname}</p>
                <p className="text-sm text-muted">{formatScore(entries[0]?.average ?? 0)} ort.</p>
              </Card>
            ),
          )}
        </div>
      ) : null}
      <section aria-label="Sıralama" className="grid grid-cols-3 gap-x-8 gap-y-1">
        {(result?.ranking ?? []).map((row) => (
          <div
            key={row.participantId}
            className="flex items-center justify-between rounded-md bg-surface px-4 py-2 text-lg"
          >
            <span className="truncate">
              <span className="font-display mr-2 text-muted">{row.rank}.</span>
              <span className="font-display uppercase">{nicknameOf(view, row.participantId)}</span>
            </span>
            <span className="font-display">
              {formatScore(view.table.find((t) => t.participantId === row.participantId)?.score ?? 0)}
            </span>
          </div>
        ))}
      </section>
      <CornerHud view={view} room={room} />
    </div>
  );
}

/** Köşe HUD: küçük QR + oda kodu + seyirci sayısı (SPEC 13.1). */
export function CornerHud({ view, room }: { view: View; room: StageRoom }) {
  return (
    <aside
      aria-label="Oda bilgisi"
      className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface/90 px-3 py-2 backdrop-blur"
    >
      <QrCode value={room.joinUrl} size={56} className="rounded-sm p-1" />
      <div>
        <p className="font-display text-xl tracking-widest text-accent">{room.code}</p>
        <p className="text-xs text-muted">{view.spectatorCount} seyirci</p>
      </div>
    </aside>
  );
}
