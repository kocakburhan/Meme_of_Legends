import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Ekran kökü: gerçek sayfada flex-1, önizleme çerçevesinde yüksekliği doldurur. */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={cn(
        'mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-4 px-4 pb-6 pt-4',
        className,
      )}
    >
      {children}
    </main>
  );
}

/** Üst sabit durum alanı: kicker (küçük üst bilgi) + Anton başlık + sağ köşe. */
export function TopBar({
  kicker,
  title,
  right,
  titleLevel = 'h1',
  className,
}: {
  kicker?: string;
  title: ReactNode;
  right?: ReactNode;
  titleLevel?: 'h1' | 'p';
  className?: string;
}) {
  const Title = titleLevel;
  return (
    <header className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {kicker ? <p className="text-xs font-bold uppercase tracking-wider text-muted">{kicker}</p> : null}
        {titleLevel === 'h1' ? (
          <Title className="font-display text-2xl uppercase leading-tight">{title}</Title>
        ) : (
          <Title className="font-display text-xl uppercase leading-tight">{title}</Title>
        )}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface p-4', className)}>
      {children}
    </div>
  );
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-sm leading-relaxed text-muted', className)}>{children}</p>;
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
  ariaLabel,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 font-bold text-accent-ink transition-colors hover:bg-[#ffdd66] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  className,
  ariaLabel,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex min-h-12 w-full items-center justify-center rounded-md border border-line bg-surface px-4 font-bold text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** "5/7 hazır" ve "23/30 puan verdi" çubukları. */
export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn('w-full', className)}>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-display">
          {value}/{max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-raised"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
