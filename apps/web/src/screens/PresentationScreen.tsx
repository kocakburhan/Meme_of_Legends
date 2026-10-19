import type { View } from '@mol/engine';
import type { Me, RateScore } from '@/lib/contracts';
import { cn } from '@/lib/cn';
import { LiveStatus } from '@/components/Countdown';
import { MemeFrame } from '@/components/MemeFrame';
import { ScoreScale } from '@/components/ScoreScale';
import { Note, Screen } from '@/components/ui';

/**
 * Gönderi gösterimi + puanlama (SPEC 7.2): durum üstte, büyük anonim gönderi
 * altında, 1–5 tek dokunuşla ve değiştirilebilir. "Son karar" saniyelerinde
 * yavaş nabız; kendi gönderi ve rakip gönderisi kilitli görünür.
 */
export function PresentationScreen({
  view,
  now,
  onRate,
  onToggleMute,
  muted = true,
  ownSubmissionId = null,
  rivalSubmissionId = null,
  index,
  total,
  className,
}: {
  view: View;
  me: Me;
  now: number;
  onRate: (submissionId: string, score: RateScore) => void;
  onToggleMute: () => void;
  muted?: boolean;
  /** Gönderenin kim olduğu oylar kilitlenene kadar gizlidir; istemci kendi bilgisini taşır. */
  ownSubmissionId?: string | null;
  rivalSubmissionId?: string | null;
  /** "Gönderi 3 / 8" sayacı; protokolde netleşene kadar ayrı geçilir. */
  index?: number;
  total?: number;
  className?: string;
}) {
  const phase = view.phase;
  const submission = view.submissions[0] ?? null;
  if (phase.kind !== 'presentation' || !submission) return null;

  const lastCall = now >= phase.lastCallAt;
  const locked = submission.canRate === false || submission.hidden;
  const isOwn = ownSubmissionId !== null && submission.id === ownSubmissionId;
  const isRival = rivalSubmissionId !== null && submission.id === rivalSubmissionId;

  const lockedNote = submission.hidden
    ? 'Bu gönderi gizlendi.'
    : isOwn
      ? 'Kendi gönderini puanlayamazsın.'
      : isRival
        ? 'Düello rakibinin gönderisi kilitli.'
        : 'Bu gönderiyi puanlayamazsın.';

  const hasSound = submission.media !== null && (submission.media.source === 'youtube' || submission.media.mediaType === 'video');

  return (
    <Screen className={className}>
      {/* Durum metni en baskın öğedir; "Gönderi 4/8" yalnız bilgi satırıdır (M3b düzeltmesi). */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-2 pt-1 backdrop-blur">
        <h1 className="font-display text-2xl uppercase leading-tight text-accent">
          {view.prompt?.text ?? '—'}
        </h1>
        <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted">
          {index !== undefined && total !== undefined ? (
            <span className="font-bold uppercase tracking-wider">Gönderi {index + 1} / {total}</span>
          ) : (
            <span />
          )}
          {submission.ratingProgress ? (
            <span aria-live="polite" aria-atomic="true">
              {submission.ratingProgress.received}/{submission.ratingProgress.eligible} kişi puan
              verdi
            </span>
          ) : null}
        </div>
      </div>

      {/* Meme alanı 1–5 düğmeleri kaydırmadan görünür olacak yükseklikte kalır. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <MemeFrame media={submission.media} className="flex-1" />
        {hasSound ? (
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={!muted}
            className="min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-bold transition-colors hover:border-accent"
          >
            {muted ? '🔇 Sesi aç' : '🔊 Sesi kapat'}
          </button>
        ) : null}
      </div>

      <div className="sticky bottom-0 -mx-4 bg-background/95 px-4 pb-2 pt-2 backdrop-blur">
        <LiveStatus message={lastCall ? 'Son karar saniyeleri; puanın hâlâ değişebilir.' : null} />
        {lastCall ? (
          <p
            aria-hidden="true"
            className="text-center font-display text-base uppercase text-accent motion-safe:animate-pulse-slow"
          >
            Son karar!
          </p>
        ) : null}
        {locked ? (
          <Note className="text-center">{lockedNote}</Note>
        ) : (
          <Note className="text-center">Tek dokunuşla puanla; son karara kadar değiştirebilirsin.</Note>
        )}
        <ScoreScale
          size="lg"
          label={`Puan ver — gönderi ${index !== undefined && total !== undefined ? `${index + 1} / ${total}` : ''}`}
          value={submission.ownScore}
          disabled={locked}
          onChange={(score) => onRate(submission.id, score)}
          className={cn('mt-2', lastCall && !locked && 'motion-safe:animate-pulse-slow')}
        />
      </div>
    </Screen>
  );
}
