import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AdminMeme } from '@mol/shared';
import {
  listAdminCategories,
  listAdminMemes,
  updateAdminMeme,
  type AdminCategory,
  type AdminMemeStatusFilter,
} from '@/net/admin';
import { MemeFrame } from '@/components/MemeFrame';
import { Card, GhostButton, Note, TopBar } from '@/components/ui';
import { SearchForm } from '@/components/SearchForm';
import { Badge, Segmented } from '@/console/bits';
import { formatDateTime } from '@/lib/format';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin/icerik/kutuphane` (SPEC 12, madde 4): sistem meme kütüphanesi —
 * ızgara/liste (arama, kategori, durum), gerçek önizleme (MemeFrame: resim/
 * GIF `<img>`, video `<video>` kapaklı; yüklenemezse SPEC 12.3 yer tutucusu),
 * kategori/açıklama düzenleme, arşivle/geri al. Panelde ekleme yoktur; meme
 * yerel araçla eklenir.
 */

const PAGE_SIZE = 24;
const NEXT_PATH = '/admin/icerik/kutuphane';

const STATUS_LABELS: Record<AdminMeme['status'], string> = {
  untagged: 'Etiketlenmemiş',
  active: 'Aktif',
  archived: 'Arşivli',
};

type MemeListState =
  | { state: 'loading' }
  | { state: 'ready'; memes: AdminMeme[]; nextCursor: string | null }
  | { state: 'error' };

export default function AdminMemesPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AdminMemeStatusFilter>('all');
  const [categoryId, setCategoryId] = useState('');
  const [query, setQuery] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [list, setList] = useState<MemeListState>({ state: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [editing, setEditing] = useState<{ id: string; categoryId: string; description: string } | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listAdminCategories()
      .then((d) => {
        if (alive) setCategories(d.categories);
      })
      .catch(() => {
        /* Kategori seçenekleri yüklenemezse liste yine de çalışır. */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    listAdminMemes({
      q: query,
      categoryId: categoryId || undefined,
      status,
      limit: PAGE_SIZE,
    })
      .then((d) => {
        if (alive) setList({ state: 'ready', memes: d.memes, nextCursor: d.nextCursor });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
        else setList({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [status, categoryId, query, reloadToken, navigate]);

  const reload = () => setReloadToken((t) => t + 1);
  const resetList = () => setList({ state: 'loading' });

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  function categoryOf(meme: AdminMeme): string | null {
    return meme.categoryId ? (categoryNames.get(meme.categoryId) ?? null) : null;
  }

  async function handleEditSave() {
    if (!editing) return;
    const description = editing.description.trim();
    setEditBusy(true);
    setEditError(null);
    try {
      await updateAdminMeme(editing.id, {
        categoryId: editing.categoryId || null,
        description,
      });
      setEditing(null);
      reload();
    } catch (error) {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath(NEXT_PATH), { replace: true });
        return;
      }
      setEditError('Etiket kaydedilemedi; biraz sonra tekrar dene.');
    } finally {
      setEditBusy(false);
    }
  }

  async function handleArchive(meme: AdminMeme, archived: boolean) {
    setRowBusyId(meme.id);
    setActionError(null);
    try {
      await updateAdminMeme(meme.id, { status: archived ? 'archived' : 'active' });
      setEditing(null);
      reload();
    } catch (error) {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath(NEXT_PATH), { replace: true });
        return;
      }
      setActionError(
        // Aktif etmek için etiket eksikse sunucu 422 döner (MEME_TAGS_REQUIRED).
        archived ? 'Arşivlenemedi; biraz sonra tekrar dene.' : 'Geri alınamadı; önce kategori ve açıklama ver.',
      );
    } finally {
      setRowBusyId(null);
    }
  }

  async function loadMore() {
    if (list.state !== 'ready' || !list.nextCursor || loadingMore) return;
    const { memes, nextCursor } = list;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const d = await listAdminMemes({
        q: query,
        categoryId: categoryId || undefined,
        status,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setList({ state: 'ready', memes: [...memes, ...d.memes], nextCursor: d.nextCursor });
    } catch (error) {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath(NEXT_PATH), { replace: true });
        return;
      }
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function emptyNote(): string {
    if (query) return 'Aramayla eşleşen meme yok.';
    if (status === 'untagged') return 'Etiketlenmemiş meme yok.';
    if (status === 'archived') return 'Arşivde meme yok.';
    if (status === 'active') return 'Aktif meme yok.';
    return 'Kütüphanede meme yok; yerel araçla eklenir.';
  }

  return (
    <>
      <TopBar kicker="İçerik" title="Meme kütüphanesi" />

      <Card>
        <Note>
          Panelde ekleme yoktur: Meme eklemek için yerel aracı kullanın:{' '}
          <code className="break-all bg-surface-raised px-1 py-0.5 text-xs">pnpm media add &lt;link&gt;</code>
        </Note>
      </Card>

      <Card className="flex flex-col gap-3">
        <Segmented
          ariaLabel="Durum filtresi"
          value={status}
          options={[
            { value: 'all', label: 'Tümü' },
            { value: 'untagged', label: 'Etiketsiz' },
            { value: 'active', label: 'Aktif' },
            { value: 'archived', label: 'Arşiv' },
          ]}
          onChange={(next) => {
            setStatus(next as AdminMemeStatusFilter);
            resetList();
          }}
        />
        <div>
          <label htmlFor="meme-category-filter" className="mb-1 block text-sm font-bold">
            Kategori
          </label>
          <select
            id="meme-category-filter"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              resetList();
            }}
            className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
          >
            <option value="">Tüm kategoriler</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.archived ? `${category.name} (arşiv)` : category.name}
              </option>
            ))}
          </select>
        </div>
        <SearchForm
          id="meme-search"
          ariaLabel="Meme ara"
          placeholder="Açıklamada ara"
          onSubmit={(next) => {
            setQuery(next);
            resetList();
          }}
        />
      </Card>

      <section
        aria-label="Meme listesi"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Meme'ler</p>
        {actionError ? (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        ) : null}
        {list.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : list.state === 'error' ? (
          <Note>Kütüphane alınamadı; sayfayı yenile.</Note>
        ) : list.memes.length === 0 ? (
          <Note>{emptyNote()}</Note>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.memes.map((meme) => {
              const draft = editing?.id === meme.id ? editing : null;
              const category = categoryOf(meme);
              return (
                <li
                  key={meme.id}
                  className="flex flex-col gap-2 rounded-md border border-line bg-background p-3"
                >
                  <div className="h-44 shrink-0">
                    <MemeFrame
                      media={{
                        source: 'system',
                        memeId: meme.id,
                        mediaType: meme.mediaType,
                        ...(meme.durationMs !== null ? { durationMs: meme.durationMs } : {}),
                      }}
                      src={meme.mediaUrl}
                      title={meme.description || 'Açıklamasız meme'}
                      className="h-full"
                    />
                  </div>
                  {draft ? (
                    <div className="flex flex-col gap-2">
                      <div>
                        <label htmlFor={`meme-category-${meme.id}`} className="mb-1 block text-sm font-bold">
                          Kategori
                        </label>
                        <select
                          id={`meme-category-${meme.id}`}
                          value={draft.categoryId}
                          onChange={(e) => setEditing({ ...draft, categoryId: e.target.value })}
                          aria-invalid={editError ? true : undefined}
                          aria-describedby={editError ? `meme-edit-${meme.id}-error` : undefined}
                          className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm"
                        >
                          <option value="">Kategori yok</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.archived ? `${c.name} (arşiv)` : c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`meme-description-${meme.id}`}
                          className="mb-1 block text-sm font-bold"
                        >
                          Açıklama
                        </label>
                        <textarea
                          id={`meme-description-${meme.id}`}
                          rows={2}
                          value={draft.description}
                          onChange={(e) => setEditing({ ...draft, description: e.target.value })}
                          maxLength={1000}
                          aria-invalid={editError ? true : undefined}
                          aria-describedby={editError ? `meme-edit-${meme.id}-error` : undefined}
                          className="w-full rounded-md border border-line bg-surface p-2 text-sm"
                        />
                      </div>
                      {editError ? (
                        <p
                          id={`meme-edit-${meme.id}-error`}
                          role="alert"
                          className="text-sm text-danger"
                        >
                          {editError}
                        </p>
                      ) : null}
                      <div className="flex gap-2">
                        <GhostButton
                          onClick={() => void handleEditSave()}
                          disabled={editBusy}
                          className="min-h-11 flex-1 px-3 text-sm"
                        >
                          {editBusy ? 'Kaydediliyor…' : 'Kaydet'}
                        </GhostButton>
                        <GhostButton
                          onClick={() => {
                            setEditing(null);
                            setEditError(null);
                          }}
                          className="min-h-11 flex-1 px-3 text-sm"
                        >
                          Vazgeç
                        </GhostButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="break-words text-sm font-bold leading-snug">
                        {meme.description || <span className="text-muted">Açıklama yok</span>}
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <Badge
                          tone={
                            meme.status === 'active'
                              ? 'success'
                              : meme.status === 'untagged'
                                ? 'accent'
                                : 'line'
                          }
                        >
                          {STATUS_LABELS[meme.status]}
                        </Badge>
                        {category ? <span>{category}</span> : null}
                        <span>· {formatDateTime(meme.createdAt)}</span>
                      </p>
                      {meme.status === 'untagged' ? (
                        <Link
                          to="/admin/icerik/etiketle"
                          className="text-xs underline underline-offset-4"
                        >
                          Etiketlemeye git
                        </Link>
                      ) : null}
                      <div className="flex gap-2">
                        <GhostButton
                          onClick={() =>
                            setEditing({
                              id: meme.id,
                              categoryId: meme.categoryId ?? '',
                              description: meme.description,
                            })
                          }
                          disabled={rowBusyId === meme.id}
                          className="min-h-11 flex-1 px-3 text-sm"
                        >
                          Düzenle
                        </GhostButton>
                        <GhostButton
                          onClick={() => void handleArchive(meme, meme.status !== 'archived')}
                          disabled={rowBusyId === meme.id}
                          className="min-h-11 flex-1 px-3 text-sm"
                        >
                          {meme.status === 'archived' ? 'Geri al' : 'Arşivle'}
                        </GhostButton>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {list.state === 'ready' && list.nextCursor ? (
          <>
            {moreError ? (
              <p role="alert" className="text-sm text-danger">
                Daha fazlası yüklenemedi; tekrar dene.
              </p>
            ) : null}
            <GhostButton onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? 'Yükleniyor…' : 'Daha fazla'}
            </GhostButton>
          </>
        ) : null}
      </section>
    </>
  );
}
