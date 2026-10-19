import { useEffect, useRef, type RefObject } from 'react';

/**
 * Gizlilik modlu YouTube IFrame Player (SPEC 7.1): oynatıcı
 * `youtube-nocookie.com` üzerinden yüklenir; süre oynatıcıdan okunur.
 * Zaman çizelgesi önizlemesi seçilen aralıkta başlar ve bitişte durur.
 */

export interface YouTubePlayerControls {
  playRange: (startMs: number, endMs: number) => void;
  stop: () => void;
}

export interface YouTubePlayerProps {
  videoId: string;
  /** Testlerde sahte oynatıcıya kontrol bırakmak için; üretimde panel doldurur. */
  controlsRef?: RefObject<YouTubePlayerControls | null>;
  onDuration: (durationMs: number) => void;
  onError?: () => void;
  title?: string;
}

interface YTPlayerInstance {
  getDuration: () => number;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  getIframe?: () => HTMLIFrameElement;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayerInstance }) => void;
        onError?: () => void;
      };
    },
  ) => YTPlayerInstance;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = 'https://www.youtube.com/iframe_api';
const API_TIMEOUT_MS = 15_000;
let apiPromise: Promise<YTNamespace> | null = null;

/** IFrame API betiğini bir kez yükler; başarısızlıkta yeniden denenebilir. */
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    let script: HTMLScriptElement | null = null;
    const timer = window.setTimeout(() => fail(new Error('YOUTUBE_API_TIMEOUT')), API_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timer);
      window.onYouTubeIframeAPIReady = previous;
    }

    function fail(error: Error) {
      cleanup();
      script?.remove();
      apiPromise = null;
      reject(error);
    }

    function ready() {
      if (!window.YT?.Player) return;
      cleanup();
      resolve(window.YT);
    }

    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      ready();
    };

    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      script = document.createElement('script');
      script.src = API_SRC;
      script.async = true;
      script.onerror = () => fail(new Error('YOUTUBE_API_UNAVAILABLE'));
      document.head.append(script);
    }
  });
  return apiPromise;
}

export function YouTubePlayer({
  videoId,
  controlsRef,
  onDuration,
  onError,
  title = 'YouTube önizleme',
}: YouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const durationRef = useRef(onDuration);
  const errorRef = useRef(onError);

  useEffect(() => {
    durationRef.current = onDuration;
    errorRef.current = onError;
  }, [onDuration, onError]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (controlsRef) controlsRef.current = null;
    let cancelled = false;
    let player: YTPlayerInstance | null = null;
    let durationTimer: number | null = null;
    let rangeTimer: number | null = null;

    const stopRange = () => {
      if (rangeTimer !== null) window.clearInterval(rangeTimer);
      rangeTimer = null;
    };
    const mount = document.createElement('div');
    mount.className = 'h-full w-full';
    host.replaceChildren(mount);

    function fail() {
      if (cancelled) return;
      errorRef.current?.();
    }

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
            controls: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              const instance = event.target;
              const iframe = instance.getIframe?.();
              if (iframe) {
                iframe.title = title;
                iframe.setAttribute(
                  'allow',
                  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
                );
              }
              let attempts = 0;
              const readDuration = () => {
                if (cancelled) return;
                const seconds = instance.getDuration();
                if (Number.isFinite(seconds) && seconds > 0) {
                  durationRef.current(Math.floor(seconds * 1000));
                  if (controlsRef) {
                    controlsRef.current = {
                      playRange(startMs, endMs) {
                        stopRange();
                        instance.pauseVideo();
                        instance.seekTo(startMs / 1000, true);
                        instance.playVideo();
                        const beganAt = Date.now();
                        rangeTimer = window.setInterval(() => {
                          if (cancelled) {
                            stopRange();
                            return;
                          }
                          // Arama oturana kadar eski konumla karşılaştırma yapma.
                          if (Date.now() - beganAt < 400) return;
                          const currentMs = instance.getCurrentTime() * 1000;
                          if (
                            currentMs >= endMs - 40 ||
                            Date.now() - beganAt > endMs - startMs + 10_000
                          ) {
                            stopRange();
                            instance.pauseVideo();
                            instance.seekTo(endMs / 1000, true);
                          }
                        }, 100);
                      },
                      stop() {
                        stopRange();
                        instance.pauseVideo();
                      },
                    };
                  }
                  return;
                }
                if (attempts < 20) {
                  attempts += 1;
                  durationTimer = window.setTimeout(readDuration, 250);
                } else fail();
              };
              readDuration();
            },
            onError: fail,
          },
        });
      })
      .catch(fail);

    return () => {
      cancelled = true;
      stopRange();
      if (durationTimer !== null) window.clearTimeout(durationTimer);
      if (controlsRef) controlsRef.current = null;
      try {
        player?.destroy();
      } catch {
        /* Oynatıcı zaten kaldırıldı. */
      }
      host.replaceChildren();
    };
  }, [videoId, controlsRef, title]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-black">
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
