import type { View } from '@mol/engine';
import type { RateScore } from '@/lib/contracts';
import { Countdown, LiveStatus } from '@/components/Countdown';
import { MemeFrame } from '@/components/MemeFrame';
import { ScoreScale } from '@/components/ScoreScale';
import { Note, PrimaryButton, Screen } from '@/components/ui';

/**
 * Final gözden geçirme (SPEC 7.3): tüm gönderiler listelenir; eksik puanlar
 * vurgulanır ama zorunlu değildir; kilitli olanlar (kendi gönderin, gizliler)
 * soluk görünür. "Bitirdim" ile katılımcı bitirir.
 */
export function ReviewScreen({
  view,
  now,
  onRate,
  onFinish,
  finished = false,
  doneCount,
  ownSubmissionId = null,
  className,
}: {
  view: View;
  now: number;
  onRate: (submissionId: string, score: RateScore) => void;
  onFinish: () => void;
  finished?: boolean;
  doneCount?: { done: number; total: number };
  ownSubmissionId?: string | null;
  className?: string;
}) {
  const phase = view.phase;
  const secondsLeft = phase.kind === 'review' ? Math.max(0, Math.ceil((phase.endsAt - now) / 1000)) : 0;

  return (
    <Screen className={className}>
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          {view.prompt?.text ?? '—'}
        </p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl uppercase leading-tight">Final gözden geçirme</h1>
          <Countdown secondsLeft={secondsLeft} totalSeconds={view.config.reviewSeconds} />
        </div>
        {doneCount ? (
          <p className="text-sm text-muted">
            {doneCount.done}/{doneCount.total} kişi bitirdi
          </p>
        ) : null}
      </div>

      <ul className="flex flex-col gap-3">
        {view.submissions.map((submission) => {
          const unrated = submission.canRate && submission.ownScore === undefined;
          const locked = !submission.canRate;
          return (
            <li
              key={submission.id}
              className={
                locked
                  ? 'rounded-[var(--radius-card)] border border-line bg-surface p-3 opacity-60'
                  : 'rounded-[var(--radius-card)] border border-line bg-surface p-3'
              }
              aria-label={
                unrated ? `Gönderi ${submission.id}, puanlanmadı` : `Gönderi ${submission.id}`
              }
            >
              <MemeFrame
                media={submission.media}
                title={submission.hidden ? 'Bu gönderi gizlendi' : undefined}
                className="aspect-video min-h-0 flex-none"
              />
              {submission.canRate ? (
                <div className="mt-2">
                  {unrated ? (
                    <p className="mb-1 text-xs font-bold text-accent">Puan ver</p>
                  ) : null}
                  <ScoreScale
                    size="sm"
                    label={`Gönderi ${submission.id} için puan`}
                    value={submission.ownScore}
                    onChange={(score) => onRate(submission.id, score)}
                  />
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  {submission.hidden
                    ? 'Gizlendi; puanlanamaz.'
                    : submission.id === ownSubmissionId
                      ? 'Kendi gönderin; puanlanamaz.'
                      : 'Bu gönderiyi puanlayamazsın.'}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-4 bg-background/95 px-4 pb-2 pt-3 backdrop-blur">
        <LiveStatus message={finished ? 'Bitirdin; diğer katılımcıları bekliyorsun.' : null} />
        <PrimaryButton onClick={onFinish} disabled={finished}>
          {finished ? 'Bitirdin, bekleniyor…' : 'Bitirdim'}
        </PrimaryButton>
        <Note className="mt-1 text-center">Eksik puanların zorunlu değil; bitirmek oyunu hızlandırır.</Note>
      </div>
    </Screen>
  );
}
