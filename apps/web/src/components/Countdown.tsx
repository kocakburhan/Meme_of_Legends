import { formatClock } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * Geri sayım: büyük Anton rakam + ince süre çubuğu. `urgent` son karar
 * saniyelerindeki yavaş nabız için (SPEC 16A.3).
 */
export function Countdown({
  secondsLeft,
  totalSeconds,
  urgent = false,
  className,
}: {
  secondsLeft: number;
  totalSeconds: number;
  urgent?: boolean;
  className?: string;
}) {
  const s = Math.max(0, Math.floor(secondsLeft));
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (s / totalSeconds) * 100)) : 0;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <time
        role="timer"
        dateTime={`PT${s}S`}
        className={cn(
          'font-display text-3xl leading-none tabular-nums',
          urgent && 'text-accent',
        )}
      >
        {formatClock(s)}
      </time>
      <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
        <div
          className={cn('h-full rounded-full', urgent ? 'bg-accent' : 'bg-muted')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Ekran okuyucu için tek satırlık canlı bölge; görsel metin zaten ekrandadır. */
export function LiveStatus({ message }: { message: string | null }) {
  return (
    <p aria-live="polite" role="status" className="sr-only">
      {message}
    </p>
  );
}
