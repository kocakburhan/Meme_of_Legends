import type { View } from '@mol/engine';
import type { RoundOutcome } from '@/lib/contracts';
import { Countdown } from '@/components/Countdown';
import { Card, Note, Screen } from '@/components/ui';
import { formatScore } from '@/lib/format';

function nicknameOf(view: View, id: string): string {
  return view.participants.find((p) => p.id === id)?.nickname ?? '?';
}

function outcomeLabel(outcome: RoundOutcome | undefined): string | null {
  switch (outcome) {
    case 'bye':
      return 'Tur atladı';
    case 'eliminated':
      return 'Elendi → jüri';
    case 'advanced':
      return 'Tur atladı';
    default:
      return null;
  }
}

/**
 * Tur sonucu (SPEC 7.4): düellolar/puanlar sırayla açıklanır (reveal step),
 * ardından tablo ve sonraki tura geri sayım. Lig/hibritte tablo görünümü.
 */
export function RoundResultScreen({
  view,
  now,
  outcomes,
  drawCandidates,
  className,
}: {
  view: View;
  now: number;
  /** Kişi başına tur sonucu ("Tur atladı" / "Elendi → jüri"). */
  outcomes?: Record<string, RoundOutcome>;
  /** Kura adayları (beraberlik); View'da taşınmadığı için ayrı geçilir. */
  drawCandidates?: string[];
  className?: string;
}) {
  const phase = view.phase;
  const roundNo = 'roundNo' in phase ? phase.roundNo : 0;
  const showTable = view.table.length > 0;

  const secondsLeft = 'endsAt' in phase ? Math.max(0, Math.ceil((phase.endsAt - now) / 1000)) : 0;
  const revealedSubs = view.submissions.filter((s) => s.playerId !== undefined);
  const scoreOf = (id: string) => revealedSubs.find((s) => s.playerId === id)?.score;

  return (
    <Screen className={className}>
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          {view.prompt?.text ?? '—'}
        </p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl uppercase leading-tight">{roundNo}. tur sonuçları</h1>
          {secondsLeft > 0 ? <Countdown secondsLeft={secondsLeft} totalSeconds={15} /> : null}
        </div>
      </div>

      {phase.kind === 'draw' ? (
        <Card className="flex flex-col items-center gap-2 py-8">
          <p className="font-display text-3xl uppercase text-accent motion-safe:animate-shuffle">
            Kura çekiliyor…
          </p>
          <Note>
            {(drawCandidates ?? []).join(' ve ')} berabere kaldı; kura ile belirlenecek.
          </Note>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <section aria-label="Açıklanan sonuçlar" className="flex flex-col gap-3">
            {view.matches.map((match, index) => {
              const [a, b] = match;
              const scoreA = a ? scoreOf(a) : undefined;
              const scoreB = b ? scoreOf(b) : undefined;
              const winner = !scoreA || !scoreB ? null : scoreA.average === scoreB.average ? null : scoreA.average > scoreB.average ? a : b;
              return (
                <Card key={index} className={index === 0 ? '' : 'opacity-90'}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                    {index + 1}. düello
                  </p>
                  <div className="flex flex-col gap-2">
                    {[a, b].map((id, i) => {
                      const score = i === 0 ? scoreA : scoreB;
                      const isWinner = winner === id;
                      return (
                        <div
                          key={i}
                          className={
                            isWinner
                              ? 'flex items-center justify-between rounded-md bg-accent/15 px-3 py-2'
                              : 'flex items-center justify-between rounded-md bg-surface-raised px-3 py-2'
                          }
                        >
                          <span className="font-display text-lg uppercase">{id ? nicknameOf(view, id) : '—'}</span>
                          <span className="flex items-baseline gap-2">
                            {score ? (
                              <>
                                <span className="font-display text-xl">{formatScore(score.average)}</span>
                                <span className="text-xs text-muted">{score.votes} oy</span>
                              </>
                            ) : (
                              <span className="text-xs text-muted">açıklanıyor…</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {[a, b]
                      .map((id) =>
                        id && outcomeLabel(outcomes?.[id]) ? `${nicknameOf(view, id)}: ${outcomeLabel(outcomes?.[id])}` : null,
                      )
                      .filter(Boolean)
                      .join(' · ') || 'Sonuçlar açıklanıyor…'}
                  </p>
                </Card>
              );
            })}
          </section>

          {view.byes.length > 0 ? (
            <p className="text-sm text-muted">
              {view.byes.map((id) => nicknameOf(view, id)).join(', ')} tur atladı.
            </p>
          ) : null}

          {showTable && phase.kind === 'results' ? (
            <section aria-label="Tablo">
              <h2 className="mb-2 font-display text-lg uppercase">Tablo</h2>
              <ol className="flex flex-col gap-1">
                {view.table.map((row) => (
                  <li
                    key={row.participantId}
                    className="flex items-center justify-between rounded-md bg-surface px-3 py-2"
                  >
                    <span>
                      <span className="font-display mr-2 text-muted">{row.rank}.</span>
                      {nicknameOf(view, row.participantId)}
                    </span>
                    <span className="font-display text-lg">{formatScore(row.score)}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {phase.kind === 'results' ? (
            <Note className="text-center">
              Sonraki tur {secondsLeft} saniye içinde başlıyor; yeni durum geliyor.
            </Note>
          ) : null}
        </div>
      )}
    </Screen>
  );
}
