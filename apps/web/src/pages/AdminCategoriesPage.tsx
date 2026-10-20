import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  createAdminCategory,
  listAdminCategories,
  updateAdminCategory,
  type AdminCategory,
} from '@/net/admin';
import { Badge } from '@/console/bits';
import { GhostButton, Note, PrimaryButton, TopBar } from '@/components/ui';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';
/**
 * `/admin/icerik/kategoriler` (SPEC 6.1, madde 4): kategori ekle, yeniden
 * adlandır, sırala (yukarı/aşağı yeterli), arşivle/geri al. Liste arşivliler
 * dahil `sortOrder,id` artan gelir; taşınanca sıra numaraları baştan yazılır.
 */

const NEXT_PATH = '/admin/icerik/kategoriler';

type ListState =
  { state: 'loading' } | { state: 'ready'; categories: AdminCategory[] } | { state: 'error' };

export default function AdminCategoriesPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<ListState>({ state: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [name, setName] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const addErrorId = useId();

  useEffect(() => {
    let alive = true;
    listAdminCategories()
      .then((d) => {
        if (alive) setList({ state: 'ready', categories: d.categories });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
        else setList({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [reloadToken, navigate]);

  const reload = () => setReloadToken((t) => t + 1);
  const categories = list.state === 'ready' ? list.categories : [];

  /** Taşınan kategoriyle birlikte tüm sıra numaraları yeniden yazılır. */
  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (list.state !== 'ready' || target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved!);
    setBusyId(moved!.id);
    setActionError(null);
    try {
      for (const [order, category] of reordered.entries()) {
        if (category.sortOrder !== order)
          await updateAdminCategory(category.id, { sortOrder: order });
      }
      reload();
    } catch (error) {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath(NEXT_PATH), { replace: true });
        return;
      }
      setActionError('Sıralama kaydedilemedi; biraz sonra tekrar dene.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) {
      setAddError('Kategori adı boş olamaz.');
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const last = categories.at(-1);
      await createAdminCategory({ name: trimmed, sortOrder: (last ? last.sortOrder : 0) + 1 });
      setName('');
      reload();
    } catch (error) {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath(NEXT_PATH), { replace: true });
        return;
      }
      setAddError('Kategori eklenemedi; biraz sonra tekrar dene.');
    } finally {
      setAddBusy(false);
    }
  }

  async function handleRename() {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (!trimmed) {
      setEditError('Kategori adı boş olamaz.');
      return;
    }
    setBusyId(editing.id);
    setEditError(null);
    try {
      await updateAdminCategory(editing.id, { name: trimmed });
      setEditing(null);
      reload();
    } catch (error) {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath(NEXT_PATH), { replace: true });
        return;
      }
      setEditError('Kategori kaydedilemedi; biraz sonra tekrar dene.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(category: AdminCategory, archived: boolean) {
    setBusyId(category.id);
    setActionError(null);
    try {
      await updateAdminCategory(category.id, { archived });
      setEditing(null);
      reload();
    } catch (error) {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath(NEXT_PATH), { replace: true });
        return;
      }
      setActionError('İşlem tamamlanamadı; biraz sonra tekrar dene.');
    } finally {
      setBusyId(null);
    }
  }

  const moving = busyId !== null;

  return (
    <>
      <TopBar kicker="İçerik" title="Kategoriler" />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleAdd();
        }}
        aria-label="Kategori ekle"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
        noValidate
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Kategori ekle</p>
        <div>
          <label htmlFor="category-new" className="mb-1 block text-sm font-bold">
            Kategori adı
          </label>
          <input
            id="category-new"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Örn: İş yerine koy"
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? addErrorId : undefined}
            className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
          />
        </div>
        {addError ? (
          <p id={addErrorId} role="alert" className="text-sm text-danger">
            {addError}
          </p>
        ) : null}
        <PrimaryButton type="submit" disabled={addBusy || name.trim().length === 0}>
          {addBusy ? 'Ekleniyor…' : 'Ekle'}
        </PrimaryButton>
      </form>

      <section
        aria-label="Kategori listesi"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Kategoriler</p>
        {actionError ? (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        ) : null}
        {list.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : list.state === 'error' ? (
          <Note>Kategoriler alınamadı; sayfayı yenile.</Note>
        ) : categories.length === 0 ? (
          <Note>Henüz kategori yok; yukarıdan ekle.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {categories.map((category, index) => {
              const draft = editing?.id === category.id ? editing : null;
              if (draft)
                return (
                  <li
                    key={category.id}
                    className="flex flex-col gap-2 rounded-md border border-line bg-background p-3"
                  >
                    <label
                      htmlFor={`category-edit-${category.id}`}
                      className="block text-sm font-bold"
                    >
                      Kategori adını düzenle
                    </label>
                    <input
                      id={`category-edit-${category.id}`}
                      value={draft.name}
                      onChange={(e) => setEditing({ id: category.id, name: e.target.value })}
                      maxLength={200}
                      aria-invalid={editError ? true : undefined}
                      aria-describedby={
                        editError ? `category-edit-${category.id}-error` : undefined
                      }
                      className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm"
                    />
                    {editError ? (
                      <p
                        id={`category-edit-${category.id}-error`}
                        role="alert"
                        className="text-sm text-danger"
                      >
                        {editError}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <GhostButton
                        onClick={() => void handleRename()}
                        disabled={busyId === category.id}
                        className="min-h-11 flex-1 px-3 text-sm"
                      >
                        {busyId === category.id ? 'Kaydediliyor…' : 'Kaydet'}
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
                  </li>
                );
              return (
                <li
                  key={category.id}
                  className="flex flex-col gap-2 rounded-md border border-line bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-bold">{category.name}</span>
                    {category.archived ? <Badge tone="line">Arşivli</Badge> : null}
                  </div>
                  <div className="flex gap-2">
                    <GhostButton
                      onClick={() => void handleMove(index, -1)}
                      disabled={moving || index === 0}
                      ariaLabel={`${category.name}: yukarı taşı`}
                      className="min-h-11 w-12 px-0 text-base"
                    >
                      ↑
                    </GhostButton>
                    <GhostButton
                      onClick={() => void handleMove(index, 1)}
                      disabled={moving || index === categories.length - 1}
                      ariaLabel={`${category.name}: aşağı taşı`}
                      className="min-h-11 w-12 px-0 text-base"
                    >
                      ↓
                    </GhostButton>
                    <GhostButton
                      onClick={() => {
                        setEditing({ id: category.id, name: category.name });
                        setEditError(null);
                      }}
                      disabled={moving}
                      className="min-h-11 flex-1 px-3 text-sm"
                    >
                      Düzenle
                    </GhostButton>
                    <GhostButton
                      onClick={() => void handleArchive(category, !category.archived)}
                      disabled={moving || busyId === category.id}
                      className="min-h-11 flex-1 px-3 text-sm"
                    >
                      {category.archived ? 'Geri al' : 'Arşivle'}
                    </GhostButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
