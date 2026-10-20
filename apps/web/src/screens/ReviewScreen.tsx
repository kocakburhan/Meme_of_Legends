import type { View } from '@mol/engine';
import type { RateScore } from '@/lib/contracts';
import { Countdown, LiveStatus } from '@/components/Countdown';
import { MemeFrame } from '@/components/MemeFrame';
import { ScoreScale } from '@/components/ScoreScale';
import { Note, PrimaryButton, Screen } from '@/components/ui';
import { remainingSeconds } from '@/lib/format';

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
  const secondsLeft = phase.kind === 'review' ? remainingSeconds(phase.endsAt, now) : 0;

  return (
    <Screen className={className}>
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-2 pt-1 backdrop-blur">
        {/* Durum metni büyük başlık; aşama adı küçük bilgi (M3b hiyerarşi düzeltmesi). */}
        <h1 className="font-display text-2xl uppercase leading-tight text-accent">
          {view.prompt?.text ?? '—'}
        </h1>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
            Final gözden geçirme
          </h2>
          <Countdown secondsLeft={secondsLeft} totalSeconds={view.config.reviewSeconds} />
        </div>
        {doneCount ? (
          <p className="text-sm text-muted" aria-live="polite" aria-atomic="true">
            {doneCount.done}/{doneCount.total} kişi bitirdi
          </p>
        ) : null}
      </div>

      <ul className="flex flex-col gap-3">
        {view.submissions.map((submission, index) => {
          const unrated = submission.canRate && submission.ownScore === undefined;
          return (
            <li
              key={submission.id}
              className="rounded-[var(--radius-card)] border border-line bg-surface p-3"
              aria-label={
                unrated ? `Gönderi ${index + 1}, puanlanmadı` : `Gönderi ${index + 1}`
              }
            >
              <MemeFrame
                media={submission.media}
                submissionId={submission.id}
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
                    label={`Gönderi ${index + 1} için puan`}
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
