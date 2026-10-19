import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { loadYouTubeIframeApi } from '@/components/YouTubePlayer';

/**
 * Gönderi gösterimi klibi (SPEC 7.2): gizlilik modlu oynatıcı `startMs`ten
 * başlar, `endMs`te durur ve bir kez oynar. Oynatıcı aşama zamanlamasını
 * etkilemez; faz sunucu saatine göre ilerler. Otomatik oynatma engellenirse
 * kısık sesle yeniden denenir ve kullanıcıya "Sesi aç" / "Videoyu oynat"
 * düğmesi gösterilir (SPEC 13.2).
 */

interface YTInstance {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
  getIframe?: () => HTMLIFrameElement;
}

export interface YouTubeClipProps {
  videoId: string;
  startMs: number;
  endMs: number;
  /** Kısık başlat (telefonlar); ortak ekranda sesli denenir. */
  muted?: boolean;
  title?: string;
  className?: string;
  onError?: () => void;
}

const TICK_MS = 100;
/** Bu süre içinde ilerleme yoksa otomatik oynatmanın engellendiği varsayılır. */
const BLOCK_DETECT_MS = 2000;

export function YouTubeClip({
  videoId,
  startMs,
  endMs,
  muted = true,
  title = 'Gönderi videosu',
  className,
  onError,
}: YouTubeClipProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<YTInstance | null>(null);
  const errorRef = useRef(onError);
  const mutedRef = useRef(muted);
  const [fallback, setFallback] = useState<'none' | 'sound' | 'play'>('none');

  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  // Ses tercihi değişince oynatıcıyı yeniden kurmadan uygula.
  useEffect(() => {
    mutedRef.current = muted;
    const instance = instanceRef.current;
    if (!instance) return;
    if (muted) instance.mute();
    else instance.unMute();
  }, [muted]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let player: YTInstance | null = null;
    let tick: number | null = null;
    let retried = false;
    let ended = false;
    let readyAt = 0;
    const startSeconds = Math.max(0, startMs / 1000);
    const endSeconds = Math.max(startSeconds, endMs / 1000);

    const mount = document.createElement('div');
    mount.className = 'h-full w-full';
    host.replaceChildren(mount);
    setFallback('none');

    const stop = () => {
      if (tick !== null) window.clearInterval(tick);
      tick = null;
    };
    const fail = () => {
      if (!cancelled) errorRef.current?.();
    };

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(mount, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            // Sunucu zamanlaması belirleyicidir; kullanıcı kontrollerle klip
            // aralığını kaydıramaz.
            controls: 0,
            disablekb: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              const instance = event.target;
              instanceRef.current = instance;
              const iframe = instance.getIframe?.();
              if (iframe) {
                iframe.title = title;
                iframe.setAttribute(
                  'allow',
                  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
                );
              }
              if (mutedRef.current) instance.mute();
              else instance.unMute();
              instance.seekTo(startSeconds, true);
              instance.playVideo();
              readyAt = Date.now();
              tick = window.setInterval(() => {
                if (cancelled || !player || ended) return;
                const current = instance.getCurrentTime();
                if (!Number.isFinite(current)) return;
                if (current >= endSeconds - 0.05) {
                  ended = true;
                  instance.pauseVideo();
                  instance.seekTo(endSeconds, true);
                  stop();
                  return;
                }
                if (
                  !retried &&
                  Date.now() - readyAt > BLOCK_DETECT_MS &&
                  current < startSeconds + 0.05
                ) {
                  // Otomatik oynatma engellendi: sesli denendiyse kısığa düş,
                  // sessizken de ilerleme yoksa kullanıcı başlatmasını iste.
                  retried = true;
                  if (mutedRef.current) {
                    setFallback('play');
                    instance.playVideo();
                  } else {
                    instance.mute();
                    mutedRef.current = true;
                    setFallback('sound');
                    instance.playVideo();
                  }
                }
              }, TICK_MS);
            },
            onError: fail,
          },
        });
      })
      .catch(fail);

    return () => {
      cancelled = true;
      stop();
      instanceRef.current = null;
      try {
        player?.destroy();
      } catch {
        /* Oynatıcı zaten kaldırıldı. */
      }
      host.replaceChildren();
    };
  }, [videoId, startMs, endMs, title]);

  function handleFallback() {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.unMute();
    mutedRef.current = false;
    instance.playVideo();
    setFallback('none');
  }

  return (
    <div
      data-youtube-clip={videoId}
      className={cn('relative h-full w-full overflow-hidden bg-black', className)}
    >
      <div ref={hostRef} className="h-full w-full" />
      {fallback !== 'none' ? (
        <button
          type="button"
          onClick={handleFallback}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-4 text-center text-sm font-bold text-white"
        >
          <span aria-hidden="true" className="font-display text-3xl">
            ▶
          </span>
          {fallback === 'sound' ? 'Sesi aç' : 'Videoyu oynat'}
        </button>
      ) : null}
    </div>
  );
}
