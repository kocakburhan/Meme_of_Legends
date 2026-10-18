import type { MediaRef } from '@mol/engine';
import { cn } from '@/lib/cn';

const PLACEHOLDER_EMOJI = ['😹', '🐸', '🤡', '🗿', '🦄', '🐱', '🥲', '🔥', '⚽', '🎓'];

function hashIndex(id: string, length: number): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.codePointAt(0)!) % 997;
  return h % length;
}

function badgeFor(media: MediaRef): string | undefined {
  if (media.source === 'youtube') return 'YouTube';
  if (media.mediaType === 'gif') return 'GIF';
  if (media.mediaType === 'video') return 'Video';
  return undefined;
}

/**
 * Meme'ler koyu çerçeve içinde (SPEC 16A.1). Gerçek görsel yoksa (sahte veri)
 * düz zeminli yer tutucu çizilir; ağ erişimi yapılmaz.
 */
export function MemeFrame({
  media,
  title,
  className,
}: {
  media: MediaRef | null;
  title?: string;
  className?: string;
}) {
  const badge = media ? badgeFor(media) : undefined;
  return (
    <figure
      className={cn(
        'relative flex min-h-40 w-full flex-1 items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-raised',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex flex-1 flex-col items-center justify-center gap-1 self-stretch bg-surface px-4 py-8 text-center"
      >
        <span className="text-5xl">
          {media ? PLACEHOLDER_EMOJI[hashIndex(media.source === 'system' ? media.memeId : media.source, PLACEHOLDER_EMOJI.length)] : '🙈'}
        </span>
        {title ? <span className="text-sm text-muted">{title}</span> : null}
      </div>
      {badge ? (
        <span className="absolute left-2 top-2 rounded-sm bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-ink">
          {badge}
        </span>
      ) : null}
      {title ? <figcaption className="sr-only">{title}</figcaption> : null}
    </figure>
  );
}
