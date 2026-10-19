import type { MediaRef } from '@mol/engine';
import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

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
 * Meme'ler koyu çerçeve içinde (SPEC 16A.1). `src` varsa gerçek medya,
 * yoksa nötr yer tutucu çizimi gösterilir; ağ erişimi yapılmaz.
 */
export function MemeFrame({
  media,
  title,
  src,
  className,
}: {
  media: MediaRef | null;
  title?: string;
  /** Doğrudan verilen medya adresi (R2 URL'si; YouTube M6'da). */
  src?: string;
  className?: string;
}) {
  const entries = useContext(LibraryMediaContext);
  const entry =
    media?.source === 'system' ? entries.find((e) => e.memeId === media.memeId) : undefined;
  const resolved = src ?? entry?.src;
  const badge = media ? badgeFor(media) : undefined;
  const seed = media ? (media.source === 'system' ? media.memeId : media.source) : 'none';
  return (
    <figure
      className={cn(
        'relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-raised',
        className,
      )}
    >
      {resolved && media ? (
        'mediaType' in media && media.mediaType === 'video' ? (
          <video
            src={resolved}
            poster={entry?.coverUrl}
            autoPlay
            muted
            playsInline
            controls
            className="h-full w-full object-contain"
          />
        ) : (
          <img
            src={resolved}
            alt={title ?? 'Meme'}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        )
      ) : (
        <div
          aria-hidden="true"
          className="flex flex-1 flex-col items-center justify-center gap-2 self-stretch bg-surface px-4 py-6 text-center"
        >
          <PlaceholderDrawing seed={seed} />
          {title ? <span className="text-sm text-muted">{title}</span> : null}
        </div>
      )}
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
