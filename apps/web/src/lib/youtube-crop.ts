/**
 * YouTube kırpma aralığı (SPEC 7.1, custom-content.md): en az 1 sn, en fazla
 * 25 sn. Saf yardımcılar; UI ve testler aynı kuralları kullanır.
 */

export const MAX_CLIP_MS = 25_000;
export const MIN_CLIP_MS = 1_000;
/** Zaman çizelgesi ve ok tuşu adımı. */
export const CLIP_STEP_MS = 250;

export interface ClipRange {
  startMs: number;
  endMs: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const wholeMs = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** Yeni video için başlangıç aralığı: ilk 25 sn (daha kısa videoda tamamı). */
export function defaultClip(durationMs: number): ClipRange {
  const duration = wholeMs(durationMs);
  return { startMs: 0, endMs: Math.min(duration, MAX_CLIP_MS) };
}

/**
 * Başlangıç tutamacını taşır. Sağ tutamaç yerinde kalır; seçim 25 sn'yi
 * aşacaksa sağ tutamaç seçimle birlikte sürüklenir (ya da videonun sonunda
 * sınırlanır). Başlangıç, bitişten en az 1 sn önce kalır.
 */
export function moveClipStart(clip: ClipRange, durationMs: number, nextStartMs: number): ClipRange {
  const duration = wholeMs(durationMs);
  const end = clamp(wholeMs(clip.endMs), 0, duration);
  const start = clamp(wholeMs(nextStartMs), 0, Math.max(0, end - MIN_CLIP_MS));
  const nextEnd = end - start > MAX_CLIP_MS ? Math.min(duration, start + MAX_CLIP_MS) : end;
  return { startMs: start, endMs: nextEnd };
}

/**
 * Bitiş tutamacını taşır. Sol tutamaç yerinde kalır; seçim 25 sn'yi aşacaksa
 * sol tutamaç seçimle birlikte sürüklenir. Bitiş her zaman başlangıçtan en az
 * 1 sn sonradır ve video süresini aşmaz.
 */
export function moveClipEnd(clip: ClipRange, durationMs: number, nextEndMs: number): ClipRange {
  const duration = wholeMs(durationMs);
  const start = clamp(wholeMs(clip.startMs), 0, duration);
  const minEnd = Math.min(duration, start + MIN_CLIP_MS);
  const end = clamp(wholeMs(nextEndMs), minEnd, duration);
  const nextStart = end - start > MAX_CLIP_MS ? Math.max(0, end - MAX_CLIP_MS) : start;
  return { startMs: nextStart, endMs: end };
}

/** Sözleşmedeki `1 <= endMs - startMs <= 25000` kuralı. */
export function clipIsValid(clip: ClipRange): boolean {
  const length = clip.endMs - clip.startMs;
  return (
    Number.isInteger(clip.startMs) &&
    Number.isInteger(clip.endMs) &&
    clip.startMs >= 0 &&
    length >= MIN_CLIP_MS &&
    length <= MAX_CLIP_MS
  );
}

/** `m:ss` biçimli zaman çizelgesi etiketi. */
export function formatClipTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Seçili aralığın uzunluğu: "25,0 sn". */
export function formatClipLength(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toLocaleString('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} sn`;
}
