import { describe, expect, it } from 'vitest';

import {
  formatClock,
  formatDateTime,
  formatDuration,
  formatEndReason,
  remainingSeconds,
} from './format';

const NOW = 1_000_000;

describe('remainingSeconds', () => {
  it('tam sayıya yuvarlar ve negatif olmaz', () => {
    expect(remainingSeconds(NOW + 15_181, NOW)).toBe(16);
    expect(remainingSeconds(NOW + 15_000, NOW)).toBe(15);
    expect(remainingSeconds(NOW + 499, NOW)).toBe(1);
    expect(remainingSeconds(NOW - 5_000, NOW)).toBe(0);
  });

  it('formatClock ondalık saniye göstermez', () => {
    expect(formatClock(15.181449951171874)).toBe('0:15');
  });
});

describe('formatDateTime', () => {
  it('gün, kısa ay ve saati Türkçe biçimde birleştirir', () => {
    // Saat diliminden bağımsız: yalnız bileşenlerin biçimi denetlenir.
    expect(formatDateTime(Date.UTC(2026, 1, 12, 14, 3))).toMatch(/^12 Ş\w+ \d{2}:\d{2}$/u);
  });
});

describe('formatDuration', () => {
  it('dakika ve saniyeyi "X dk Y sn" biçiminde gösterir', () => {
    expect(formatDuration(0, 200_000)).toBe('3 dk 20 sn');
    expect(formatDuration(0, 120_000)).toBe('2 dk');
    expect(formatDuration(0, 45_000)).toBe('45 sn');
  });

  it('süre yoksa veya geçersizse null döner', () => {
    expect(formatDuration(null, 1)).toBeNull();
    expect(formatDuration(1, null)).toBeNull();
    expect(formatDuration(10, 5)).toBeNull();
  });
});

describe('formatEndReason', () => {
  it('bilinen nedenleri Türkçeleştirir', () => {
    expect(formatEndReason('completed')).toBe('Oyun tamamlandı');
    expect(formatEndReason('manager')).toBe('Yönetici oyunu bitirdi');
    expect(formatEndReason('lobbyExpired')).toBe('Lobi süresi doldu');
  });

  it('bilinmeyen ve boş nedenleri işaretler', () => {
    expect(formatEndReason('zzz')).toBe('Bilinmiyor');
    expect(formatEndReason(null)).toBe('—');
  });
});
