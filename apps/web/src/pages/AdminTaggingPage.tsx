import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AdminMeme } from '@mol/shared';
import {
  listAdminCategories,
  listAdminMemes,
  updateAdminMeme,
  type AdminCategory,
} from '@/net/admin';
import { HttpError } from '@/net/http';
import { MemeFrame } from '@/components/MemeFrame';
import { Card, GhostButton, Note, PrimaryButton, TopBar } from '@/components/ui';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin/icerik/etiketle` (SPEC 12, madde 4): hızlı etiketleme — kuyruktaki
 * en eski etiketlenmemiş meme büyük önizlemeyle gelir; kategori + açıklama
 * verilip "Kaydet ve sıradakine geç" ile aktifleşir, "Atla" kuyruk sonuna
 * bırakır, "Arşivle" çıkarır. Kısayollar ekranda yazılıdır: Ctrl/⌘+Enter
 * kaydet, 1–9 kategori seçimi, Esc atla. Kuyruk boşsa kalmadı denir.
 */

const QUEUE_LIMIT = 100;
const NEXT_PATH = '/admin/icerik/etiketle';

type QueueState =
  | { state: 'loading' }
  | { state: 'ready'; queue: AdminMeme[] }
  | { state: 'error' };

export default function AdminTaggingPage() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueState>({ state: 'loading' });
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listAdminCategories()
      .then((d) => {
        if (alive) setCategories(d.categories);
      })
      .catch(() => {
        /* Kategoriler yüklenemezse sayfa yine de açılır; seçim yapılamaz. */
      });
    return () => {
      alive = false;
    };
  }, []);

  function fail(error: unknown, onOther: () => void) {
    if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
    else onOther();
  }

  /** Kuyruğu uçtan yeniden çeker (başka yerden eklenenler için de). */
  async function refreshQueue(): Promise<AdminMeme[]> {
    try {
      const d = await listAdminMemes({ status: 'untagged', order: 'oldest', limit: QUEUE_LIMIT });
      setQueue({ state: 'ready', queue: d.memes });
      return d.memes;
    } catch (error) {
      fail(error, () => setQueue({ state: 'error' }));
      return [];
    }
  }

  useEffect(() => {
    let alive = true;
    listAdminMemes({ status: 'untagged', order: 'oldest', limit: QUEUE_LIMIT })
      .then((d) => {
        if (alive) setQueue({ state: 'ready', queue: d.memes });
      })
      .catch((error) => {
        if (!alive) return;
        fail(error, () => setQueue({ state: 'error' }));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = queue.state === 'ready' ? (queue.queue[0] ?? null) : null;

  /** Kuyruğun başını bırakır ve sıradakine geçer. */
  function advance(rest: AdminMeme[], message: string) {
    setQueue({ state: 'ready', queue: rest });
    setCategoryId('');
    setDescription('');
    setError(null);
    setNote(message);
  }

  async function handleSave() {
    if (queue.state !== 'ready' || !current || busy) return;
    const trimmed = description.trim();
    if (!categoryId || !trimmed) {
      setError('Kategori ve boş olmayan bir açıklama gerekli.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAdminMeme(current.id, {
        categoryId,
        description: trimmed,
        status: 'active',
      });
      const rest = queue.queue.slice(1);
      advance(rest, 'Kaydedildi.');
      if (rest.length === 0) await refreshQueue();
    } catch (err) {
      fail(err, () =>
        setError(
          err instanceof HttpError &&
            (err.code === 'MEME_TAGS_REQUIRED' || err.code === 'CATEGORY_NOT_FOUND')
            ? 'Kategori ve boş olmayan bir açıklama gerekli.'
            : 'Kaydedilemedi; biraz sonra tekrar dene.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (queue.state !== 'ready' || !current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateAdminMeme(current.id, { status: 'archived' });
      const rest = queue.queue.slice(1);
      advance(rest, 'Arşivlendi.');
      if (rest.length === 0) await refreshQueue();
    } catch (err) {
      fail(err, () => setError('Arşivlenemedi; biraz sonra tekrar dene.'));
    } finally {
      setBusy(false);
    }
  }

  /** Atla: içerik kuyruk sonuna bırakılır, sıradakine geçilir. */
  function handleSkip() {
    if (queue.state !== 'ready' || !current || busy) return;
    if (queue.queue.length === 1) {
      setNote('Tek etiketlenecek içerik bu; atlanacak başka içerik yok.');
      return;
    }
    const [, ...rest] = queue.queue;
    setQueue({ state: 'ready', queue: [...rest, current] });
    setCategoryId('');
    setDescription('');
    setError(null);
    setNote('Atlandı; kuyruk sonuna alındı.');
  }

  function pickCategory(index: number) {
    const category = categories[index];
    if (category) setCategoryId(category.id);
  }

  // Klavye kısayolları: Ctrl/⌘+Enter kaydet, 1–9 kategori seç, Esc atla.
  // Metin alanındayken 1–9 ve Esc yazma işine karışmaz.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleSave();
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.tagName === 'SELECT';
      if (typing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        handleSkip();
        return;
      }
      const choice = Number(event.key);
      if (Number.isInteger(choice) && choice >= 1 && choice <= 9) pickCategory(choice - 1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const tagsReady = categoryId !== '' && description.trim().length > 0;

  return (
    <>
      <TopBar kicker="İçerik" title="Hızlı etiketleme" />

      {queue.state === 'loading' ? (
        <Card>
          <Note>Yükleniyor…</Note>
        </Card>
      ) : queue.state === 'error' ? (
        <Card>
          <Note>Kuyruk alınamadı; sayfayı yenile.</Note>
        </Card>
      ) : !current ? (
        <Card className="flex flex-col gap-3">
          <Note>Etiketlenecek içerik kalmadı.</Note>
          <p className="text-sm">
            <Link to="/admin/icerik/kutuphane" className="underline underline-offset-4">
              Meme kütüphanesine git
            </Link>
          </p>
        </Card>
      ) : (
        <>
          <p aria-live="polite" className="text-sm text-muted">
            {note ?? `Kuyrukta ${queue.queue.length} içerik var.`}
          </p>

          <div className="h-72 shrink-0 sm:h-96">
            <MemeFrame
              media={{
                source: 'system',
                memeId: current.id,
                mediaType: current.mediaType,
                ...(current.durationMs !== null ? { durationMs: current.durationMs } : {}),
              }}
              src={current.mediaUrl}
              title={current.description || 'Etiketlenmemiş meme'}
              className="h-full"
            />
          </div>

          {current.sourceUrl ? (
            <p className="text-sm">
              <a
                href={current.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4"
              >
                Kaynağı aç
              </a>
            </p>
          ) : (
            <Note>Kaynak linki yok.</Note>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
            aria-label="Meme etiketle"
            className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
            noValidate
          >
            <div>
              <label htmlFor="tagging-category" className="mb-1 block text-sm font-bold">
                Kategori
              </label>
              <select
                id="tagging-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
              >
                <option value="">Kategori seçin</option>
                {categories.map((category, index) => (
                  <option key={category.id} value={category.id}>
                    {category.archived
                      ? `${category.name} (arşiv)`
                      : `${index < 9 ? `${index + 1}· ` : ''}${category.name}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tagging-description" className="mb-1 block text-sm font-bold">
                Açıklama
              </label>
              <textarea
                id="tagging-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                placeholder="Kütüphanede ve seçim ekranında görünen ad"
                className="w-full rounded-md border border-line bg-background p-3 text-base"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            {!tagsReady ? (
              <p className="text-xs text-muted">Kaydetmek için kategori ve açıklama gerekli.</p>
            ) : null}
            <PrimaryButton type="submit" disabled={busy || !tagsReady}>
              {busy ? 'Kaydediliyor…' : 'Kaydet ve sıradakine geç'}
            </PrimaryButton>
            <div className="flex gap-2">
              <GhostButton
                onClick={handleSkip}
                disabled={busy}
                className="min-h-11 flex-1 px-3 text-sm"
              >
                Atla
              </GhostButton>
              <GhostButton
                onClick={() => void handleArchive()}
                disabled={busy}
                className="min-h-11 flex-1 px-3 text-sm"
              >
                Arşivle
              </GhostButton>
            </div>
            <p className="text-xs text-muted">
              Kısayollar: Ctrl/⌘+Enter kaydet · 1–9 kategori seçimi · Esc atla
            </p>
          </form>
        </>
      )}
    </>
  );
}
