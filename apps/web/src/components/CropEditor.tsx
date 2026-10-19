import { useId, useState, type KeyboardEvent } from 'react';

import { GhostButton, Note, PrimaryButton } from '@/components/ui';
import {
  CLIP_STEP_MS,
  MAX_CLIP_MS,
  MIN_CLIP_MS,
  clipIsValid,
  defaultClip,
  formatClipLength,
  formatClipTime,
  moveClipEnd,
  moveClipStart,
  type ClipRange,
} from '@/lib/youtube-crop';

/**
 * Dokunmatik zaman çizelgesi (SPEC 7.1): iki tutamaç, en fazla 25 sn,
 * ok tuşlarıyla 0,25 sn adım. Seçili aralık oynatıcıda önizlenir.
 */
export function CropEditor({
  durationMs,
  onPreview,
  onSelect,
}: {
  durationMs: number;
  onPreview: (startMs: number, endMs: number) => void;
  onSelect: (range: ClipRange) => void;
}) {
  const [clip, setClip] = useState<ClipRange>(() => defaultClip(durationMs));
  const [selected, setSelected] = useState(false);
  const hintId = useId();
  const startId = useId();
  const endId = useId();

  const duration = Math.max(0, Math.floor(durationMs));
  const valid = clipIsValid(clip);

  if (duration < MIN_CLIP_MS) {
    return (
      <section
        aria-label="Video kırpma"
        className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <Note>Bu video en az 1 sn olmalı; başka bir video seç.</Note>
      </section>
    );
  }

  function update(next: ClipRange) {
    setClip(next);
    setSelected(false);
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>, edge: 'start' | 'end') {
    const direction =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? -1
        : event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? 1
          : 0;
    if (direction === 0) return;
    event.preventDefault();
    const next =
      edge === 'start'
        ? moveClipStart(clip, duration, clip.startMs + direction * CLIP_STEP_MS)
        : moveClipEnd(clip, duration, clip.endMs + direction * CLIP_STEP_MS);
    update(next);
  }

  const leftPct = duration > 0 ? (clip.startMs / duration) * 100 : 0;
  const widthPct = duration > 0 ? ((clip.endMs - clip.startMs) / duration) * 100 : 0;

  return (
    <section
      aria-label="Video kırpma"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold">Zaman çizelgesi</p>
        <p className="text-sm text-muted">Video {formatClipTime(duration)}</p>
      </div>

      <div
        aria-hidden="true"
        className="relative h-3 w-full overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          className="absolute inset-y-0 rounded-full bg-accent/50"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
      </div>

      <label htmlFor={startId} className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold">Başlangıç</span>
        <span className="font-display text-lg tabular-nums">{formatClipTime(clip.startMs)}</span>
      </label>
      <input
        id={startId}
        type="range"
        min={0}
        max={duration}
        step={CLIP_STEP_MS}
        value={clip.startMs}
        aria-label="Başlangıç"
        aria-valuetext={formatClipTime(clip.startMs)}
        aria-describedby={hintId}
        onChange={(event) => update(moveClipStart(clip, duration, Number(event.target.value)))}
        onKeyDown={(event) => handleKey(event, 'start')}
        className="crop-range"
      />

      <label htmlFor={endId} className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold">Bitiş</span>
        <span className="font-display text-lg tabular-nums">{formatClipTime(clip.endMs)}</span>
      </label>
      <input
        id={endId}
        type="range"
        min={0}
        max={duration}
        step={CLIP_STEP_MS}
        value={clip.endMs}
        aria-label="Bitiş"
        aria-valuetext={formatClipTime(clip.endMs)}
        aria-describedby={hintId}
        onChange={(event) => update(moveClipEnd(clip, duration, Number(event.target.value)))}
        onKeyDown={(event) => handleKey(event, 'end')}
        className="crop-range"
      />

      <p id={hintId} className="text-xs leading-relaxed text-muted">
        Tutamaçları sürükle ya da ok tuşlarıyla 0,25 sn adımlarla ayarla. Seçim en fazla{' '}
        {MAX_CLIP_MS / 1000} sn olabilir.
      </p>

      <div className="flex items-baseline justify-between gap-2 border-t border-line pt-2 text-sm">
        <span>Seçili aralık</span>
        <span className={valid ? 'font-bold text-accent' : 'font-bold text-danger'}>
          {formatClipLength(clip.endMs - clip.startMs)}
        </span>
      </div>
      {!valid ? (
        <p role="alert" className="text-sm text-danger">
          En az 1 sn'lik bir aralık seç.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <GhostButton onClick={() => onPreview(clip.startMs, clip.endMs)} disabled={!valid}>
          Aralığı oynat
        </GhostButton>
        <PrimaryButton
          onClick={() => {
            onSelect({ startMs: clip.startMs, endMs: clip.endMs });
            setSelected(true);
          }}
          disabled={!valid}
        >
          {selected ? 'Aralık seçildi ✓' : 'Bu aralığı seç'}
        </PrimaryButton>
      </div>
      {selected ? (
        <p role="status" className="text-center text-sm text-success">
          Seçim gönderildi; alttaki “Seçimimi onayla” ile kesinleştir.
        </p>
      ) : null}
    </section>
  );
}
