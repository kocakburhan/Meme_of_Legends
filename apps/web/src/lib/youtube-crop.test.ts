import { describe, expect, it } from 'vitest';

import {
  MAX_CLIP_MS,
  MIN_CLIP_MS,
  clipIsValid,
  defaultClip,
  formatClipLength,
  formatClipTime,
  moveClipEnd,
  moveClipStart,
} from './youtube-crop';

describe('youtube-crop', () => {
  it('kısa videoda tamamını, uzun videoda ilk 25 sn’yi seçer', () => {
    expect(defaultClip(18_000)).toEqual({ startMs: 0, endMs: 18_000 });
    expect(defaultClip(90_000)).toEqual({ startMs: 0, endMs: MAX_CLIP_MS });
    expect(defaultClip(0)).toEqual({ startMs: 0, endMs: 0 });
  });

  it('bitişi ileri sürerken 25 sn sınırında başlangıcı birlikte kaydırır', () => {
    const clip = moveClipEnd({ startMs: 0, endMs: 25_000 }, 90_000, 60_000);
    expect(clip).toEqual({ startMs: 35_000, endMs: 60_000 });
    expect(clip.endMs - clip.startMs).toBe(MAX_CLIP_MS);
  });

  it('bitişi geri sürerken başlangıcı korur ve en az 1 sn bırakır', () => {
    expect(moveClipEnd({ startMs: 10_000, endMs: 20_000 }, 60_000, 4_000)).toEqual({
      startMs: 10_000,
      endMs: 11_000,
    });
  });

  it('başlangıcı geri sürerken 25 sn sınırında bitişi birlikte kaydırır', () => {
    const clip = moveClipStart({ startMs: 40_000, endMs: 60_000 }, 90_000, 10_000);
    expect(clip).toEqual({ startMs: 10_000, endMs: 35_000 });
  });

  it('başlangıcı ileri sürerken bitişi korur ve en az 1 sn bırakır', () => {
    expect(moveClipStart({ startMs: 0, endMs: 20_000 }, 60_000, 25_000)).toEqual({
      startMs: 19_000,
      endMs: 20_000,
    });
  });

  it('videonun sonunu aşmaz', () => {
    expect(moveClipEnd({ startMs: 0, endMs: 5_000 }, 12_000, 30_000)).toEqual({
      startMs: 0,
      endMs: 12_000,
    });
    expect(moveClipStart({ startMs: 0, endMs: 12_000 }, 12_000, 30_000)).toEqual({
      startMs: 11_000,
      endMs: 12_000,
    });
  });

  it('sözleşme aralığını doğrular', () => {
    expect(clipIsValid({ startMs: 0, endMs: MIN_CLIP_MS })).toBe(true);
    expect(clipIsValid({ startMs: 0, endMs: MAX_CLIP_MS })).toBe(true);
    expect(clipIsValid({ startMs: 0, endMs: MAX_CLIP_MS + 1 })).toBe(false);
    expect(clipIsValid({ startMs: 0, endMs: 500 })).toBe(false);
    expect(clipIsValid({ startMs: -1, endMs: 2_000 })).toBe(false);
    expect(clipIsValid({ startMs: 0.5, endMs: 2_000 })).toBe(false);
  });

  it('zaman ve uzunluk etiketlerini Türkçe biçimler', () => {
    expect(formatClipTime(0)).toBe('0:00');
    expect(formatClipTime(65_000)).toBe('1:05');
    expect(formatClipLength(25_000)).toBe('25,0 sn');
    expect(formatClipLength(1_500)).toBe('1,5 sn');
  });
});
