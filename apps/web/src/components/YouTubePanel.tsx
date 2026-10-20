import { useId, useRef, useState, type ComponentType } from 'react';
import type { MediaRef } from '@mol/engine';

import { CropEditor } from '@/components/CropEditor';
import {
  YouTubePlayer,
  type YouTubePlayerControls,
  type YouTubePlayerProps,
} from '@/components/YouTubePlayer';
import { Note, PrimaryButton } from '@/components/ui';
import { youtubeErrorMessage } from '@/lib/custom';
import { HttpError } from '@/net/http';
import type { YoutubeVerification } from '@/net/custom';

/**
 * "YouTube" sekmesi (SPEC 7.1): link doğrulama → gizlilik modlu oynatıcı →
 * oynatıcıdan okunan süreyle dokunmatik kırpma → mevcut `select` akışı.
 */
export function YouTubePanel({
  onVerify,
  onSelect,
  PlayerComponent = YouTubePlayer,
}: {
  onVerify: (url: string) => Promise<YoutubeVerification>;
  onSelect: (media: MediaRef) => void;
  /** Testlerde gerçek IFrame API'sine dokunmamak için sahte oynatıcı. */
  PlayerComponent?: ComponentType<YouTubePlayerProps>;
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [url, setUrl] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [video, setVideo] = useState<YoutubeVerification | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [playerError, setPlayerError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const controlsRef = useRef<YouTubePlayerControls | null>(null);

  async function verify() {
    const value = url.trim();
    if (!value) {
      setError('Bir YouTube linki yapıştır.');
      return;
    }
    setError(null);
    setVerifying(true);
    setPlayerError(false);
    setDurationMs(null);
    setAttempt(0);
    try {
      const result = await onVerify(value);
      setVideo(result);
      setDurationMs(result.durationMs);
    } catch (failure) {
      setVideo(null);
      setError(youtubeErrorMessage(failure instanceof HttpError ? failure.code : 'NETWORK_ERROR'));
    } finally {
      setVerifying(false);
    }
  }

  function retryPlayer() {
    setPlayerError(false);
    setDurationMs(null);
    setAttempt((value) => value + 1);
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <form
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void verify();
        }}
      >
        <label htmlFor={inputId} className="font-display text-lg uppercase">
          YouTube linki
        </label>
        <input
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className="h-11 w-full rounded-md border border-line bg-background px-3 text-sm placeholder:text-muted"
        />
        <p id={hintId} className="text-xs leading-relaxed text-muted">
          Video herkese açık ve gömülebilir olmalı. Klibi en fazla 25 sn'lik bir aralığa
          kırpacaksın.
        </p>
        <PrimaryButton type="submit" disabled={verifying}>
          {verifying ? 'Doğrulanıyor…' : 'Linki doğrula'}
        </PrimaryButton>
        {verifying ? (
          <p role="status" className="text-center text-sm text-muted">
            YouTube kontrol ediliyor…
          </p>
        ) : null}
      </form>

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      {video ? (
        <div className="flex flex-col gap-3">
          <PlayerComponent
            key={`${video.videoId}:${attempt}`}
            videoId={video.videoId}
            controlsRef={controlsRef}
            onDuration={(value) => {
              setDurationMs(value);
              setPlayerError(false);
            }}
            onError={() => setPlayerError(true)}
            title="YouTube klibi önizlemesi"
          />
          {playerError ? (
            <div className="flex flex-col gap-2 rounded-md border border-danger/40 bg-danger/10 p-3">
              <p role="alert" className="text-sm text-danger">
                Video bu cihazda yüklenemedi. Bağlantını kontrol edip yeniden dene.
              </p>
              <button
                type="button"
                onClick={retryPlayer}
                className="min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-bold hover:border-accent"
              >
                Oynatıcıyı yeniden dene
              </button>
            </div>
          ) : durationMs === null ? (
            <p role="status" className="text-center text-sm text-muted">
              Video hazırlanıyor; süre oynatıcıdan okunuyor…
            </p>
          ) : (
            <CropEditor
              key={`${video.videoId}:${durationMs}`}
              durationMs={durationMs}
              onPreview={(startMs, endMs) => controlsRef.current?.playRange(startMs, endMs)}
              onSelect={({ startMs, endMs }) =>
                onSelect({ source: 'youtube', videoId: video.videoId, startMs, endMs })
              }
            />
          )}
          <Note className="text-center">
            Seçim gönderildikten sonra alttaki “Seçimimi onayla” ile kesinleştir.
          </Note>
        </div>
      ) : null}
    </div>
  );
}
