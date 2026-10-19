import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Konsol araç kutusu: sade, dokunma dostu kontroller (SPEC 16A.1).
 * Telefon öncelikli; hepsi klavyeyle de çalışır.
 */

/** Bölüm kartı: başlık + içerik; masaüstünde sütunlara yerleşir. */
export function Section({
  title,
  children,
  aside,
  className,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** İki adımlı onay: ilk dokunuş açıklamayı gösterir, ikinci dokunuş uygular. */
export function ConfirmButton({
  label,
  note,
  confirmLabel = 'Evet, onayla',
  onConfirm,
  disabled,
  className,
}: {
  label: string;
  /** Onay isteminde gösterilen açıklama (ör. hak uyarısı). */
  note: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed)
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        disabled={disabled}
        className={cn(
          'flex min-h-12 w-full items-center justify-center rounded-md border border-line bg-surface px-4 font-bold text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        {label}
      </button>
    );
  return (
    <div
      role="group"
      aria-label={`${label} onayı`}
      className={cn(
        'flex flex-col gap-2 rounded-md border border-accent bg-surface p-3',
        className,
      )}
    >
      <p className="text-sm font-bold leading-snug">{note}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
          className="flex min-h-12 flex-1 items-center justify-center rounded-md bg-accent px-3 font-bold text-accent-ink"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="flex min-h-12 flex-1 items-center justify-center rounded-md border border-line bg-surface px-3 font-bold text-foreground"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

const HOLD_TICK_MS = 50;

/**
 * Basılı tutma düğmesi (SPEC 12.5): 1 saniye basılı tutulunca ilerleyen dolgu
 * ile tamamlanır; erken bırakma sıfırlar. Kazara basmayı önler.
 */
export function HoldButton({
  children,
  onComplete,
  disabled,
  holdMs = 1000,
  className,
  hint,
}: {
  children: ReactNode;
  onComplete: () => void;
  disabled?: boolean;
  holdMs?: number;
  className?: string;
  /** Düğmenin altındaki kısa yönerge. */
  hint?: string;
}) {
  const [progress, setProgress] = useState(0);
  const hold = useRef<{ timer: number | null; startedAt: number; fired: boolean }>({
    timer: null,
    startedAt: 0,
    fired: false,
  });

  function stop(reset: boolean) {
    const h = hold.current;
    if (h.timer !== null) {
      window.clearInterval(h.timer);
      h.timer = null;
    }
    if (reset) {
      h.fired = false;
      setProgress(0);
    }
  }

  function begin() {
    if (disabled || hold.current.timer !== null) return;
    hold.current.fired = false;
    hold.current.startedAt = Date.now();
    hold.current.timer = window.setInterval(() => {
      const elapsed = Date.now() - hold.current.startedAt;
      const p = Math.min(1, elapsed / holdMs);
      setProgress(p);
      if (p >= 1 && !hold.current.fired) {
        hold.current.fired = true;
        stop(false);
        onComplete();
        setProgress(0);
      }
    }, HOLD_TICK_MS);
  }

  const holding = () => hold.current.timer !== null;

  return (
    <div className={className}>
      <button
        type="button"
        disabled={disabled}
        // Parmak kayması sayfayı kaydırmasın; dolgu net görünsün.
        className="relative flex min-h-12 w-full touch-none select-none items-center justify-center overflow-hidden rounded-md border border-line bg-surface px-4 font-bold text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        onPointerDown={(e) => {
          e.preventDefault();
          begin();
        }}
        onPointerUp={() => stop(true)}
        onPointerLeave={() => holding() && stop(true)}
        onPointerCancel={() => stop(true)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            begin();
          }
        }}
        onKeyUp={() => stop(true)}
        aria-label={typeof children === 'string' ? `${children} (1 saniye basılı tut)` : undefined}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-accent/40"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
        <span className="relative">{children}</span>
      </button>
      {hint ? <p className="mt-1 text-center text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Açık/Kapalı anahtarı; değişim hemen komut olarak gider. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold leading-snug">{label}</p>
        {description ? <p className="mt-0.5 text-xs leading-snug text-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex min-h-11 w-16 shrink-0 items-center justify-center rounded-md border font-display text-xs uppercase',
          checked ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-foreground',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {checked ? 'Açık' : 'Kapalı'}
      </button>
    </div>
  );
}

/** Sayı adımlayıcı: −/＋ düğmeleri ve girişe yazma; sınır dışına izin vermez. */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onCommit: (next: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  // Dış değer değişince (sunucu görünümü) odakta değilken taslağı tazele.
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  function commit(raw: number) {
    if (!Number.isFinite(raw)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(raw);
    if (next !== value) onCommit(next);
    setDraft(String(next));
  }

  const buttonClass =
    'flex h-12 w-12 items-center justify-center rounded-md border border-line bg-surface font-display text-xl disabled:opacity-40';
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-bold leading-snug">{label}</p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`${label} azalt`}
          disabled={disabled || value <= min}
          onClick={() => commit(value - step)}
          className={buttonClass}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          value={draft}
          disabled={disabled}
          min={min}
          max={max}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            commit(Number.parseFloat(draft));
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-12 w-14 rounded-md border border-line bg-background px-2 text-center font-display tabular-nums"
        />
        <button
          type="button"
          aria-label={`${label} arttır`}
          disabled={disabled || value >= max}
          onClick={() => commit(value + step)}
          className={buttonClass}
        >
          ＋
        </button>
        {suffix ? <span className="text-xs text-muted">{suffix}</span> : null}
      </div>
    </div>
  );
}

/** Segmentli seçim: mod gibi 3 seçenekli değerler için. */
export function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center rounded-md border px-2 font-display text-sm uppercase',
              selected ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-foreground',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Rozet: küçük durum işareti (renk tek başına anlam taşımaz). */
export function Badge({ children, tone = 'line' }: { children: ReactNode; tone?: 'line' | 'accent' | 'danger' | 'success' }) {
  const tones = {
    line: 'border-line text-muted',
    accent: 'border-accent bg-accent text-accent-ink',
    danger: 'border-danger text-danger',
    success: 'border-success text-success',
  } as const;
  return (
    <span className={cn('rounded-sm border px-1.5 py-0.5 text-xs font-bold uppercase', tones[tone])}>
      {children}
    </span>
  );
}
