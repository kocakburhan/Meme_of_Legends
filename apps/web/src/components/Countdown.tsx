import type { View } from '@mol/engine';
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
      {/* Yalnız süre bittiğinde duyurulur; her saniye konuşmaz (SPEC 18). */}
      {s === 0 ? (
        <span role="status" aria-live="polite" className="sr-only">
          Süre doldu.
        </span>
      ) : null}
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

/**
 * Aşama değişimini bir kez duyuran canlı bölge (SPEC 18). Metin yalnız aşama
 * anahtarı değişince değişir; geri sayım her saniye ekran okuyucuya okunmaz.
 */
export function PhaseAnnouncer({ view }: { view: View }) {
  const phase = view.phase;
  let message: string;
  switch (phase.kind) {
    case 'lobby':
      message = 'Lobi açık; oyuncular bekleniyor.';
      break;
    case 'selection':
      message = `${phase.roundNo}. tur seçim aşaması açıldı. ${view.config.selectionSeconds} saniyen var.`;
      break;
    case 'presentation': {
      const index = view.presentation?.index ?? 0;
      const total = view.presentation?.total ?? view.submissions.length;
      message = `Gönderim sırası başladı. Sıra ${index + 1}; toplam ${total}.`;
      break;
    }
    case 'review':
      message = 'Puanlama gözden geçirmesi başladı. Eksik puanlarını tamamlayabilirsin.';
      break;
    case 'reveal':
      message = `${phase.roundNo}. tur bitti; sonuçlar açıklanıyor.`;
      break;
    case 'results':
      message = `${phase.roundNo}. tur bitti; sonuçlar açıklandı. Sıradaki tur bekleniyor.`;
      break;
    case 'draw':
      message = 'Beraberlik kura ile çözülüyor.';
      break;
    case 'finished':
      message = 'Karşılaşma tamamlandı. Sonuçlar ekranda.';
      break;
  }
  if (view.status === 'paused') message = `Oyun duraklatıldı. ${message}`;
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </p>
  );
}
