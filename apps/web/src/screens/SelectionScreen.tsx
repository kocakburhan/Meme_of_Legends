import { useId, useMemo, useState } from 'react';
import type { MediaRef, View } from '@mol/engine';
import type { LibraryMeme, Me } from '@/lib/contracts';
import { cn } from '@/lib/cn';
import { Countdown, LiveStatus } from '@/components/Countdown';
import { MemeFrame } from '@/components/MemeFrame';
import { Note, PrimaryButton, Screen } from '@/components/ui';
import { remainingSeconds } from '@/lib/format';

const TABS = [
  { id: 'library', label: 'Kütüphane' },
  { id: 'upload', label: 'Yükle' },
  { id: 'youtube', label: 'YouTube' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function nicknameOf(view: View, id: string): string {
  return view.participants.find((p) => p.id === id)?.nickname ?? 'Rakip';
}

function systemMedia(meme: LibraryMeme): MediaRef {
  return {
    source: 'system',
    memeId: meme.memeId,
    mediaType: meme.mediaType,
    ...(meme.durationMs ? { durationMs: meme.durationMs } : {}),
  };
}

/**
 * Seçim ekranı (oyuncu): durum + süre + rakip üstte; Kütüphane/Yükle/YouTube
 * sekmeleri; arama + kategori + iki sütun ızgara; altta seçim ve onay.
 * Yükle ve YouTube yalnız görsel iskelettir (işlev M6'da).
 */
export function SelectionScreen({
  view,
  me,
  now,
  library,
  categories,
  onSelect,
  onConfirm,
  className,
}: {
  view: View;
  me: Me;
  now: number;
  library: LibraryMeme[];
  categories: string[];
  onSelect: (media: MediaRef) => void;
  onConfirm: () => void;
  className?: string;
}) {
  const [tab, setTab] = useState<TabId>('library');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const phase = view.phase;
  const selection = phase.kind === 'selection' ? remainingSeconds(phase.endsAt, now) : 0;
  const total = phase.kind === 'selection' ? view.config.selectionSeconds : 1;
  const urgent = selection <= 10;

  const rival = view.matches.find((m) => m.includes(me.id))?.find((id) => id !== me.id) ?? null;

  const own = view.ownSubmission ?? null;
  const selectedMemeId = own?.media && own.media.source === 'system' ? own.media.memeId : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return library.filter(
      (meme) =>
        (category === null || meme.category === category) &&
        (q === '' || meme.title.toLocaleLowerCase('tr').includes(q)),
    );
  }, [library, query, category]);

  const panelId = useId();

  return (
    <Screen className={className}>
      {/* Durum: seçim boyunca ekranda (SPEC 7.1) */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Durum</p>
            <p className="font-display text-2xl uppercase leading-tight text-accent">
              {view.prompt?.text ?? '—'}
            </p>
            {rival ? (
              <p className="mt-1 text-sm text-muted">Düello: {nicknameOf(view, rival)} ile</p>
            ) : null}
          </div>
        </div>
        <Countdown secondsLeft={selection} totalSeconds={total} urgent={urgent} className="mt-2" />
      </div>

      {/* Sekmeler */}
      <div
        role="tablist"
        aria-label="İçerik kaynağı"
        className="flex gap-1 rounded-md bg-surface p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'min-h-11 flex-1 rounded-sm px-2 text-sm font-bold transition-colors',
              tab === t.id ? 'bg-accent text-accent-ink' : 'text-muted hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'library' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div>
            <label htmlFor={`${panelId}-search`} className="sr-only">
              Ara
            </label>
            <input
              id={`${panelId}-search`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ara…"
              className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm placeholder:text-muted"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Kategoriler">
            <button
              type="button"
              aria-pressed={category === null}
              onClick={() => setCategory(null)}
              className={cn(
                'min-h-11 shrink-0 rounded-md border px-3 text-sm font-bold transition-colors',
                category === null
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-line bg-surface',
              )}
            >
              Tümü
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(category === c ? null : c)}
                className={cn(
                  'min-h-11 shrink-0 rounded-md border px-3 text-sm font-bold transition-colors',
                  category === c
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-line bg-surface',
                )}
              >
                {c}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <Note>Meme kalmadı; aramayı değiştir.</Note>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {filtered.map((meme) => {
                const selected = selectedMemeId === meme.memeId;
                return (
                  <li key={meme.memeId}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelect(systemMedia(meme))}
                      className={cn(
                        'flex w-full flex-col gap-1 rounded-[var(--radius-card)] border p-1.5 text-left transition-colors',
                        selected
                          ? 'border-accent bg-accent/10'
                          : 'border-line bg-surface hover:border-accent',
                      )}
                    >
                      <MemeFrame
                        media={systemMedia(meme)}
                        className="aspect-square min-h-0 flex-none"
                      />
                      <span className="line-clamp-2 min-h-8 px-1 text-xs leading-snug">
                        {meme.title}
                      </span>
                      {selected ? (
                        <span className="mx-1 mb-1 rounded-sm bg-accent px-1.5 py-0.5 text-center text-xs font-bold text-accent-ink">
                          Seçili
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : tab === 'upload' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-surface p-6 text-center">
          <p className="font-display text-xl uppercase">Yakında</p>
          <Note>Resim/GIF yükleme M6'da geliyor. JPG, PNG, WebP, GIF; en fazla 10 MB olacak.</Note>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-surface p-6 text-center">
          <p className="font-display text-xl uppercase">Yakında</p>
          <Note>YouTube kırpma M6'da geliyor; en fazla 25 sn'lik klip seçebileceksin.</Note>
        </div>
      )}

      {/* Alt onay çubuğu */}
      <div className="sticky bottom-0 -mx-4 mt-2 bg-background/95 px-4 pb-2 pt-3 backdrop-blur">
        <LiveStatus
          message={
            own ? (own.confirmed ? 'Seçimin onaylandı.' : 'Seçim yapıldı; onay bekleniyor.') : null
          }
        />
        <div className="flex items-center gap-3">
          <div className="w-14 shrink-0">
            {own?.media ? <MemeFrame media={own.media} className="aspect-square min-h-0" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <Note>
              {own
                ? own.confirmed
                  ? 'Onaylandı. Süre bitene kadar değiştirebilirsin.'
                  : 'Süre dolarsa bu gönderilir.'
                : 'Bir meme seç ya da boş bırak.'}
            </Note>
          </div>
        </div>
        <div className="mt-2">
          <PrimaryButton
            onClick={onConfirm}
            disabled={!own || own.confirmed}
            ariaLabel="Seçimimi onayla"
          >
            {own?.confirmed ? 'Onaylandı ✓' : 'Seçimimi onayla'}
          </PrimaryButton>
        </div>
      </div>
    </Screen>
  );
}
