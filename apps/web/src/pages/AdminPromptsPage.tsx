import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { promptTextSchema } from '@mol/shared';
import { cn } from '@/lib/cn';
import {
  createAdminPrompt,
  getPromptHealth,
  listAdminPrompts,
  updateAdminPrompt,
  type AdminPrompt,
  type AdminPromptStatusFilter,
} from '@/net/admin';
import { HttpError } from '@/net/http';
import { Card, GhostButton, Note, PrimaryButton, TopBar } from '@/components/ui';
import { SearchForm } from '@/components/SearchForm';
import { Badge, Segmented } from '@/console/bits';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin/icerik/durumlar` (SPEC 6.2, madde 4): platform durumları — arama,
 * durum filtresi, imleçli liste; metin olarak ekleme (3–160 karakter, canlı
 * sayaç), düzenleme, arşivle/geri al. Tekrarda "zaten var"; arşivdeki
 * çakışmada "Yeniden etkinleştir" önerilir. Az durum uyarısı görünür.
 */

const PROMPT_MAX = 160;
const PAGE_SIZE = 50;
const NEXT_PATH = '/admin/icerik/durumlar';

type PromptError =
  | { kind: 'invalid' }
  | { kind: 'duplicate'; existingId: string; archived: boolean }
  | { kind: 'generic' };

type PromptListState =
  | { state: 'loading' }
  | { state: 'ready'; prompts: AdminPrompt[]; nextCursor: string | null }
  | { state: 'error' };

type HealthState =
  | { state: 'loading' }
  | { state: 'ready'; activeCount: number; lowThreshold: number; low: boolean }
  | { state: 'error' };

/** Canlı karakter sayacı (kod noktası sayar; sunucu şemasıyla aynı ölçü). */
function TextCounter({ text, id }: { text: string; id?: string }) {
  const count = [...text].length;
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn('mt-1 text-xs', count > PROMPT_MAX ? 'text-danger' : 'text-muted')}
    >
      {count}/160
    </p>
  );
}

/** Form hatası: geçersiz metin (+ipucu), tekrar (+yeniden etkinleştir), genel. */
function PromptErrorAlert({
  error,
  onReactivate,
  id,
}: {
  error: PromptError;
  onReactivate: (id: string) => void;
  id?: string;
}) {
  if (error.kind === 'invalid')
    return (
      <div className="flex flex-col gap-1">
        <p id={id} role="alert" className="text-sm text-danger">
          Durum 3–160 karakter olmalı; link ve HTML kabul edilmez.
        </p>
        <p className="text-xs text-muted">İpucu: Nokta sonrası boşluk bırak.</p>
      </div>
    );
  if (error.kind === 'generic')
    return (
      <p id={id} role="alert" className="text-sm text-danger">
        Durum kaydedilemedi; biraz sonra tekrar dene.
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <p id={id} role="alert" className="text-sm text-danger">
        Bu durum zaten var.
      </p>
      {error.archived ? (
        <GhostButton onClick={() => onReactivate(error.existingId)} className="min-h-11 px-3 text-sm">
          Yeniden etkinleştir
        </GhostButton>
      ) : null}
    </div>
  );
}

export default function AdminPromptsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AdminPromptStatusFilter>('all');
  const [query, setQuery] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [list, setList] = useState<PromptListState>({ state: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [health, setHealth] = useState<HealthState>({ state: 'loading' });
  const [text, setText] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<PromptError | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<PromptError | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const addErrorId = useId();

  useEffect(() => {
    let alive = true;
    listAdminPrompts({ q: query, status: filter, limit: PAGE_SIZE })
      .then((d) => {
        if (alive) setList({ state: 'ready', prompts: d.prompts, nextCursor: d.nextCursor });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
        else setList({ state: 'error' });
      });
    getPromptHealth()
      .then((d) => {
        if (alive) setHealth({ state: 'ready', ...d });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
        else setHealth({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [filter, query, reloadToken, navigate]);

  const reload = () => setReloadToken((t) => t + 1);

  const resetList = () => setList({ state: 'loading' });

  function redirectToLogin() {
    navigate(adminLoginPath(NEXT_PATH), { replace: true });
  }

  /** 409 gövdesindeki `existingId`yi arşivli kayda çevirir (buton kararı). */
  async function toPromptError(err: unknown, text: string): Promise<PromptError> {
    if (err instanceof HttpError && err.code === 'PROMPT_INVALID') return { kind: 'invalid' };
    if (err instanceof HttpError && err.code === 'PROMPT_DUPLICATE' && err.existingId) {
      let archived = false;
      try {
        const { prompts } = await listAdminPrompts({ q: text, status: 'all', limit: PAGE_SIZE });
        archived = prompts.find((p) => p.id === err.existingId)?.status === 'archived';
      } catch {
        /* Arama başarısızsa yalnız mesaj gösterilir. */
      }
      return { kind: 'duplicate', existingId: err.existingId, archived };
    }
    return { kind: 'generic' };
  }

  async function handleAdd() {
    if (!promptTextSchema.safeParse(text).success) {
      setAddError({ kind: 'invalid' });
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      await createAdminPrompt(text);
      setText('');
      reload();
    } catch (err) {
      if (isAdminAuthError(err)) {
        redirectToLogin();
        return;
      }
      setAddError(await toPromptError(err, text));
    } finally {
      setAddBusy(false);
    }
  }

  async function handleEditSave() {
    if (!editing) return;
    if (!promptTextSchema.safeParse(editing.text).success) {
      setEditError({ kind: 'invalid' });
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      await updateAdminPrompt(editing.id, { text: editing.text });
      setEditing(null);
      reload();
    } catch (err) {
      if (isAdminAuthError(err)) {
        redirectToLogin();
        return;
      }
      setEditError(await toPromptError(err, editing.text));
    } finally {
      setEditBusy(false);
    }
  }

  async function changeStatus(id: string, next: 'active' | 'archived') {
    setRowBusyId(id);
    setActionError(null);
    try {
      await updateAdminPrompt(id, { status: next });
      setEditing(null);
      setAddError(null);
      setEditError(null);
      reload();
    } catch (err) {
      if (isAdminAuthError(err)) {
        redirectToLogin();
        return;
      }
      setActionError('İşlem tamamlanamadı; biraz sonra tekrar dene.');
    } finally {
      setRowBusyId(null);
    }
  }

  async function loadMore() {
    if (list.state !== 'ready' || !list.nextCursor || loadingMore) return;
    const { prompts, nextCursor } = list;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const d = await listAdminPrompts({
        q: query,
        status: filter,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setList({ state: 'ready', prompts: [...prompts, ...d.prompts], nextCursor: d.nextCursor });
    } catch (err) {
      if (isAdminAuthError(err)) {
        redirectToLogin();
        return;
      }
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function emptyNote(): string {
    if (query) return 'Aramayla eşleşen durum yok.';
    if (filter === 'archived') return 'Arşivde durum yok.';
    if (filter === 'active') return 'Aktif platform durumu yok.';
    return 'Henüz platform durumu yok; yukarıdan ekle.';
  }

  return (
    <>
      <TopBar kicker="İçerik" title="Platform durumları" />

      {health.state === 'loading' ? null : health.state === 'error' ? (
        <Card>
          <Note>Platform durumu sayısı alınamadı; sayfayı yenile.</Note>
        </Card>
      ) : (
        <div
          role="note"
          aria-label="Platform durumu sayısı"
          className={`rounded-[var(--radius-card)] border bg-surface p-4 text-sm leading-relaxed ${
            health.low ? 'border-accent' : 'border-line'
          }`}
        >
          {health.low
            ? `Platform durumları az: ${health.activeCount} adet (eşik ${health.lowThreshold}).`
            : `Platform durumları: ${health.activeCount} aktif (eşik ${health.lowThreshold}).`}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleAdd();
        }}
        aria-label="Platform durumu ekle"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
        noValidate
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Durum ekle</p>
        <div>
          <label htmlFor="admin-prompt-new" className="mb-1 block text-sm font-bold">
            Yeni durum
          </label>
          <textarea
            id="admin-prompt-new"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Örn: Toplantı bitince kendine gelen çocuk"
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? addErrorId : 'admin-prompt-new-counter'}
            className="w-full rounded-md border border-line bg-background p-3 text-base"
          />
          <TextCounter text={text} id="admin-prompt-new-counter" />
        </div>
        {addError ? (
          <PromptErrorAlert
            error={addError}
            id={addErrorId}
            onReactivate={(id) => void changeStatus(id, 'active')}
          />
        ) : null}
        <PrimaryButton type="submit" disabled={addBusy || text.trim().length === 0}>
          {addBusy ? 'Ekleniyor…' : 'Ekle'}
        </PrimaryButton>
      </form>

      <Card className="flex flex-col gap-3">
        <Segmented
          ariaLabel="Durum filtresi"
          value={filter}
          options={[
            { value: 'all', label: 'Tümü' },
            { value: 'active', label: 'Aktif' },
            { value: 'archived', label: 'Arşiv' },
          ]}
          onChange={(next) => {
            setFilter(next as AdminPromptStatusFilter);
            resetList();
          }}
        />
        <SearchForm
          id="admin-prompt-search"
          ariaLabel="Platform durumu ara"
          placeholder="Durum metninde ara"
          onSubmit={(next) => {
            setQuery(next);
            resetList();
          }}
        />
      </Card>

      <section
        aria-label="Platform durum listesi"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Durumlar</p>
        {actionError ? (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        ) : null}
        {list.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : list.state === 'error' ? (
          <Note>Durumlar alınamadı; sayfayı yenile.</Note>
        ) : list.prompts.length === 0 ? (
          <Note>{emptyNote()}</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.prompts.map((prompt) => {
              const draft = editing?.id === prompt.id ? editing : null;
              return (
                <li
                  key={prompt.id}
                  className="flex flex-col gap-2 rounded-md border border-line bg-background p-3"
                >
                  {draft ? (
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor={`admin-prompt-edit-${prompt.id}`}
                        className="block text-sm font-bold"
                      >
                        Durumu düzenle
                      </label>
                      <textarea
                        id={`admin-prompt-edit-${prompt.id}`}
                        rows={2}
                        value={draft.text}
                        onChange={(e) => setEditing({ id: prompt.id, text: e.target.value })}
                        aria-invalid={editError ? true : undefined}
                        aria-describedby={
                          editError
                            ? `admin-prompt-edit-${prompt.id}-error`
                            : `admin-prompt-edit-${prompt.id}-counter`
                        }
                        className="w-full rounded-md border border-line bg-surface p-3 text-sm"
                      />
                      <TextCounter
                        text={draft.text}
                        id={`admin-prompt-edit-${prompt.id}-counter`}
                      />
                      {editError ? (
                        <PromptErrorAlert
                          error={editError}
                          id={`admin-prompt-edit-${prompt.id}-error`}
                          onReactivate={(id) => void changeStatus(id, 'active')}
                        />
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
                      <p className="whitespace-pre-line break-words text-sm leading-relaxed">
                        {prompt.text}
                      </p>
                      {prompt.status === 'archived' ? (
                        <span className="w-fit">
                          <Badge tone="line">Arşivli</Badge>
                        </span>
                      ) : null}
                      <div className="flex gap-2">
                        {prompt.status === 'archived' ? (
                          <GhostButton
                            onClick={() => void changeStatus(prompt.id, 'active')}
                            disabled={rowBusyId === prompt.id}
                            className="min-h-11 flex-1 px-3 text-sm"
                          >
                            Yeniden etkinleştir
                          </GhostButton>
                        ) : (
                          <>
                            <GhostButton
                              onClick={() => {
                                setEditing({ id: prompt.id, text: prompt.text });
                                setEditError(null);
                              }}
                              disabled={rowBusyId === prompt.id}
                              className="min-h-11 flex-1 px-3 text-sm"
                            >
                              Düzenle
                            </GhostButton>
                            <GhostButton
                              onClick={() => void changeStatus(prompt.id, 'archived')}
                              disabled={rowBusyId === prompt.id}
                              className="min-h-11 flex-1 px-3 text-sm"
                            >
                              Arşivle
                            </GhostButton>
                          </>
                        )}
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
