import type { SessionConfig } from '@mol/engine';
import { estimateDuration } from '@mol/engine';

/** mm:ss biçimli kalan süre (büyük Anton rakamlar için). */
export function formatClock(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

/** Faz bitişine kalan tam saniye; ondalık saniye hiçbir yüzeyde görünmez. */
export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Ortalama puan: 2 ondalık, Türkçe virgül (SPEC 8.2). */
export function formatScore(value: number): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Tahmini oyun süresi aralığı: "45–70 dk" / "45 dk" (SPEC 4.3). */
export function formatEstimatedDuration(config: SessionConfig, playerCount: number): string | null {
  const { minMs, maxMs } = estimateDuration(config, playerCount);
  if (maxMs <= 0) return null;
  const min = Math.max(1, Math.round(minMs / 60_000));
  const max = Math.max(min, Math.round(maxMs / 60_000));
  return min === max ? `~${min} dk` : `${min}–${max} dk`;
}

export const MODE_LABELS: Record<SessionConfig['mode'], string> = {
  elimination: 'Eleme',
  league: 'Lig',
  hybrid: 'Hibrit',
};

/** "12 Şub 17:03" biçimli kısa tarih (panel listeleri; Saat dilimi cihazın). */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
