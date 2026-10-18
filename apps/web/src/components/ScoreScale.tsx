import type { RateScore } from '@/lib/contracts';
import { cn } from '@/lib/cn';

const SCORES: RateScore[] = [1, 2, 3, 4, 5];

/**
 * 1–5 puanlama: tek dokunuş, değiştirilebilir (SPEC 7.2). Radio semantiği
 * kullanılır; seçili puan vurgu sarısıyla yoğunlaşır (SPEC 16A.1).
 */
export function ScoreScale({
  value,
  onChange,
  disabled,
  size,
  label = 'Puan ver',
  className,
}: {
  value?: number;
  onChange?: (score: RateScore) => void;
  disabled?: boolean;
  size: 'lg' | 'sm';
  label?: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex w-full gap-2', className)}>
      {SCORES.map((score) => {
        const checked = value === score;
        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange?.(score)}
            className={cn(
              'flex-1 rounded-md border font-display transition-colors',
              size === 'lg' ? 'h-16 text-3xl' : 'h-11 min-w-11 text-xl',
              checked
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line bg-surface text-foreground hover:border-accent',
              disabled && 'cursor-not-allowed opacity-40',
              !disabled && 'min-h-11',
            )}
          >
            {score}
          </button>
        );
      })}
    </div>
  );
}
