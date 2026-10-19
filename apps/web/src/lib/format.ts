import type { SessionSummary } from '@mol/shared';
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

/** Oturum durumunun tek Türkçe eşlemesi (panel listeleri; SPEC 14.4). */
export const SESSION_STATUS_LABELS: Record<SessionSummary['status'], string> = {
  lobby: 'Lobi',
  running: 'Oyun',
  paused: 'Duraklatıldı',
  finished: 'Bitti',
  cancelled: 'İptal edildi',
  terminated: 'Sonlandırıldı',
};

/**
 * Bitiş nedeni (business-api.md `endReason`): motor ve sunucu nedenlerinin tek
 * Türkçe eşlemesi; bilinmeyenlerde "Bilinmiyor" der.
 */
export const END_REASON_LABELS: Record<string, string> = {
  completed: 'Oyun tamamlandı',
  players: 'Yeterli oyuncu kalmadı',
  manager: 'Yönetici oyunu bitirdi',
  empty: 'Oda boşaldı',
  noPrompts: 'Durum havuzu boşaldı',
  managerCancelled: 'Lobi iptal edildi',
  lobbyExpired: 'Lobi süresi doldu',
  businessInactive: 'İşletme hesabı devre dışı bırakıldı',
};

export function formatEndReason(reason: string | null): string {
  if (!reason) return '—';
  return END_REASON_LABELS[reason] ?? 'Bilinmiyor';
}

/** "3 dk 20 sn" / "45 sn" biçimli oturum süresi; süre yoksa null. */
export function formatDuration(startedAt: number | null, endedAt: number | null): string | null {
  if (startedAt === null || endedAt === null || endedAt < startedAt) return null;
  const total = Math.max(1, Math.round((endedAt - startedAt) / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return `${sec} sn`;
  return sec > 0 ? `${min} dk ${sec} sn` : `${min} dk`;
}

/** "12 Şub 17:03" biçimli kısa tarih (panel listeleri; Saat dilimi cihazın). */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
