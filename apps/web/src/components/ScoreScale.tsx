import { useRef, type KeyboardEvent } from 'react';
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
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const current = value === undefined ? 0 : SCORES.indexOf(value as RateScore);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % SCORES.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (current - 1 + SCORES.length) % SCORES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = SCORES.length - 1;
    if (next === null) return;
    event.preventDefault();
    onChange?.(SCORES[next]!);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex w-full gap-2', className)}
      onKeyDown={handleKeyDown}
    >
      {SCORES.map((score, index) => {
        const checked = value === score;
        const tabbable = disabled ? false : checked || (value === undefined && index === 0);
        return (
          <button
            key={score}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabbable ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange?.(score)}
            className={cn(
              'flex-1 rounded-md border font-display transition-colors',
              size === 'lg' ? 'h-16 text-3xl' : 'h-11 text-xl',
              checked
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line bg-surface text-foreground hover:border-accent',
              disabled && 'cursor-not-allowed border-line bg-surface text-muted',
            )}
          >
            {score}
          </button>
        );
      })}
    </div>
  );
}
