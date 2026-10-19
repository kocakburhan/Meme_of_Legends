import type { MediaRef } from '@mol/engine';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { uploadMediaUrl, useCustomMedia } from '@/components/CustomMedia';
import { YouTubeClip } from '@/components/YouTubeClip';

/**
 * Sistem meme'leri için kütüphanedeki medya ve kapak adresleri.
 */
export interface LibraryMedia {
  memeId: string;
  src?: string;
  coverUrl?: string;
}

export const LibraryMediaContext = createContext<LibraryMedia[]>([]);

function hashSeed(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) % 997;
  return h;
}

function badgeFor(media: MediaRef): string | undefined {
  if (media.source === 'youtube') return 'YouTube';
  if (media.mediaType === 'gif') return 'GIF';
  if (media.mediaType === 'video') return 'Video';
  return undefined;
}

function sourceKey(media: MediaRef): string {
  if (media.source === 'system') return `system:${media.memeId}`;
  if (media.source === 'upload') return `upload:${media.uploadId}`;
  return `youtube:${media.videoId}:${media.startMs}:${media.endMs}`;
}

/**
 * Nötr yer tutucu: emoji değil, koyu zeminde basit bir çizim (SPEC 16A.1).
 * Tohuma göre hafif varyasyon; ses/animasyon yok.
 */
function PlaceholderDrawing({ seed }: { seed: string }) {
  const variant = hashSeed(seed) % 3;
  const flip = variant === 1;
  return (
    <svg
      viewBox="0 0 120 80"
      role="presentation"
      aria-hidden="true"
      className="h-20 w-28 text-line"
    >
      <rect
        x="8"
        y="8"
        width="104"
        height="64"
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Konuşma balonu: comic çerçeve hissi */}
      <g transform={flip ? 'translate(120 0) scale(-1 1)' : undefined}>
        <path
          d={
            variant === 2
              ? 'M28 22h44a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H50l-10 10v-10h-12a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z'
              : 'M40 18h46a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H56l-12 12V46H40a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6z'
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx={variant === 2 ? 41 : 53} cy="32" r="2.5" fill="currentColor" />
        <circle cx={variant === 2 ? 50 : 63} cy="32" r="2.5" fill="currentColor" />
        <circle cx={variant === 2 ? 59 : 73} cy="32" r="2.5" fill="currentColor" />
      </g>
      <line
        x1="16"
        y1="62"
        x2="46"
        y2="62"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Ortak ekran gibi Bearer'lı yüzeylerde yüklenen dosya önce alınır, blob URL'e
 * çevrilir (custom-content.md; token'lı adres paylaşılmaz). Hata, tazeleme
 * denemesi MemeFrame'de yapılsın diye yukarı bildirilir.
 */
function BearerUpload({
  url,
  token,
  alt,
  className,
  onLoadError,
}: {
  url: string;
  token: string;
  alt: string;
  className: string;
  onLoadError: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const errorRef = useRef(onLoadError);

  useEffect(() => {
    errorRef.current = onLoadError;
  }, [onLoadError]);

  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    fetch(url, { headers: { authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (!alive) return;
        created = URL.createObjectURL(blob);
        setBlobUrl(created);
      })
      .catch(() => {
        if (alive) errorRef.current();
      });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, token]);

  if (!blobUrl) return null;
  return (
    <img
      src={blobUrl}
      alt={alt}
      onError={onLoadError}
      className={className}
    />
  );
}

/**
 * Meme'ler koyu çerçeve içinde (SPEC 16A.1). `src` varsa gerçek medya,
 * yoksa nötr yer tutucu çizimi gösterilir. Özel içerikte `upload` dosyaya
 * (ortak ekranda Bearer + blob URL), `youtube` ise gizlilik modlu klibe
 * çözülür. Medya yüklenmezse kırık resim simgesi yerine SPEC 12.3 uygulanır:
 * bir kez yeniden denenir, olmazsa sade "Bu cihazda yüklenemedi" yer tutucusu
 * gösterilir (katılımcı, ortak ekran, konsol, admin hepsinde); özel içerikte
 * ayrıca hata bildirimi ucu bir kez çağrılır (madde 4).
 */
export function MemeFrame({
  media,
  title,
  src,
  submissionId,
  className,
}: {
  media: MediaRef | null;
  title?: string;
  /** Doğrudan verilen medya adresi (R2 URL'si; YouTube M6'da). */
  src?: string;
  /** Özel içerik hata bildirimi için gönderi kimliği (SPEC 12.3). */
  submissionId?: string;
  className?: string;
}) {
  const entries = useContext(LibraryMediaContext);
  const custom = useCustomMedia();
  const entry =
    media?.source === 'system' ? entries.find((e) => e.memeId === media.memeId) : undefined;
  const resolved = src ?? entry?.src;
  const cover = entry?.coverUrl;
  const badge = media ? badgeFor(media) : undefined;
  const seed = media ? (media.source === 'system' ? media.memeId : media.source) : 'none';
  // SPEC 12.3: hata bir kez yeniden denenir, olmazsa yer tutucu. Deneme sayısı
  // medya anahtarına bağlı tutulur; medya değişince doğal olarak sıfırlanır.
  const [errors, setErrors] = useState<Record<string, number>>({});
  const mediaKey = media
    ? `${sourceKey(media)}#${resolved ?? 'none'}#${cover ?? 'none'}`
    : 'none';
  const attempt = errors[mediaKey] ?? 0;
  const failed = attempt >= 2;
  const reportedRef = useRef(new Set<string>());

  function handleError() {
    setErrors((prev) => ({ ...prev, [mediaKey]: Math.min((prev[mediaKey] ?? 0) + 1, 2) }));
  }

  function retry() {
    setErrors((prev) => (prev[mediaKey] ? { ...prev, [mediaKey]: 0 } : prev));
  }

  // Yüklenemeyen özel içerik bir kez bildirilir; oyun akışı durmaz (madde 4).
  const report = custom?.onMediaError;
  useEffect(() => {
    if (!failed || !report || !submissionId || !media || media.source === 'system') return;
    if (reportedRef.current.has(mediaKey)) return;
    reportedRef.current.add(mediaKey);
    report(submissionId);
  }, [failed, report, submissionId, media, mediaKey]);

  const retryKey = `${mediaKey}#${attempt}`;
  const mediaClass = 'h-full w-full object-contain';

  function placeholder() {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 self-stretch bg-surface px-4 py-6 text-center">
        <PlaceholderDrawing seed={seed} />
        <span className="text-sm text-muted">{failed ? 'Bu cihazda yüklenemedi' : title}</span>
        {failed ? (
          <button
            type="button"
            onClick={retry}
            className="min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-bold transition-colors hover:border-accent"
          >
            Yeniden dene
          </button>
        ) : null}
      </div>
    );
  }

  function renderMedia() {
    if (!media || failed) return placeholder();
    if (media.source === 'upload') {
      // Seçim paneli doğrudan `previewUrl` verir (sahibi çerezle görür).
      if (resolved)
        return (
          <img
            key={retryKey}
            src={resolved}
            alt={title ?? 'Meme'}
            onError={handleError}
            className={mediaClass}
            loading="lazy"
          />
        );
      if (!custom) return placeholder();
      const url = uploadMediaUrl(custom.code, media.uploadId);
      if (custom.token)
        return (
          <BearerUpload
            key={retryKey}
            url={url}
            token={custom.token}
            alt={title ?? 'Meme'}
            className={mediaClass}
            onLoadError={handleError}
          />
        );
      return (
        <img
          key={retryKey}
          src={url}
          alt={title ?? 'Meme'}
          onError={handleError}
          className={mediaClass}
          loading="lazy"
        />
      );
    }
    if (media.source === 'youtube')
      return (
        <YouTubeClip
          key={retryKey}
          videoId={media.videoId}
          startMs={media.startMs}
          endMs={media.endMs}
          muted={custom?.muted ?? true}
          title={title}
          onError={handleError}
          className="h-full w-full"
        />
      );
    if (!resolved) return placeholder();
    if (media.mediaType === 'video')
      return (
        <video
          key={retryKey}
          src={resolved}
          poster={cover}
          autoPlay
          muted={custom?.muted ?? true}
          playsInline
          controls
          onError={handleError}
          className="h-full w-full object-contain"
        />
      );
    return (
      <img
        key={retryKey}
        src={resolved}
        alt={title ?? 'Meme'}
        onError={handleError}
        className={mediaClass}
        loading="lazy"
      />
    );
  }

  return (
    <figure
      className={cn(
        'relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-raised',
        className,
      )}
    >
      {renderMedia()}
      {badge ? (
        <span className="absolute left-2 top-2 rounded-sm bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-ink">
          {badge}
        </span>
      ) : null}
      {title ? <figcaption className="sr-only">{title}</figcaption> : null}
    </figure>
  );
}

/** Ekran ağacına kütüphane çözümü sağlayan yardımcı. */
export function LibraryMediaProvider({
  entries,
  children,
}: {
  entries: LibraryMedia[];
  children: ReactNode;
}) {
  return <LibraryMediaContext.Provider value={entries}>{children}</LibraryMediaContext.Provider>;
}
