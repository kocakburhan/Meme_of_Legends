import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { promptTextSchema } from '@mol/shared';
import { cn } from '@/lib/cn';
import {
  HttpError,
  createBusinessPrompt,
  listBusinessPrompts,
  updateBusinessPrompt,
  type BusinessPrompt,
  type PromptStatusFilter,
} from '@/net/http';
import { Card, GhostButton, Note, PrimaryButton, TopBar } from '@/components/ui';
import { Badge, Segmented } from '@/console/bits';
import { PanelLayout } from '@/panel/PanelLayout';
import { useBusinessAccount } from '@/panel/useBusinessAccount';

/**
 * `/isletme/durumlar` (SPEC 6.2, M4c-2): işletmenin durum kütüphanesi —
 * arama, durum filtresi, "daha fazla" sayfalama; ekle (canlı sayaç), düzenle,
 * arşivle, yeniden etkinleştir. Hatalar Türkçe; tekrarda `existingId` ile
 * arşivli kayıt için "Yeniden etkinleştir" önerilir.
 */

/** promptTextSchema sınırı (SPEC 6.2): 3–160 karakter. */
const PROMPT_MAX = 160;
const PAGE_SIZE = 50;

const NEXT_PATH = '/isletme/durumlar';

type PromptError =
  | { kind: 'invalid' }
  | { kind: 'duplicate'; existingId: string; archived: boolean }
  | { kind: 'generic' };

type PromptListState =
  | { state: 'loading' }
  | { state: 'ready'; prompts: BusinessPrompt[]; nextCursor: string | null }
  | { state: 'error' };

/** Canlı karakter sayacı (kod noktası sayar; sunucu şemasıyla aynı ölçü). */
function TextCounter({ text }: { text: string }) {
  const count = [...text].length;
  return (
    <p
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
}: {
  error: PromptError;
  onReactivate: (id: string) => void;
}) {
  if (error.kind === 'invalid')
    return (
      <div className="flex flex-col gap-1">
        <p role="alert" className="text-sm text-danger">
          Durum 3–160 karakter olmalı; link ve HTML kabul edilmez.
        </p>
        <p className="text-xs text-muted">İpucu: Nokta sonrası boşluk bırak.</p>
      </div>
    );
  if (error.kind === 'generic')
    return (
      <p role="alert" className="text-sm text-danger">
        Durum kaydedilemedi; biraz sonra tekrar dene.
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <p role="alert" className="text-sm text-danger">
        Bu durum zaten var.
      </p>
      {error.archived ? (
        <GhostButton
          onClick={() => onReactivate(error.existingId)}
          className="min-h-11 px-3 text-sm"
        >
          Yeniden etkinleştir
        </GhostButton>
      ) : null}
    </div>
  );
}

export default function BusinessPromptsPage() {
  const navigate = useNavigate();
  const { status } = useBusinessAccount();
  const [filter, setFilter] = useState<PromptStatusFilter>('active');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [list, setList] = useState<PromptListState>({ state: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [text, setText] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<PromptError | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<PromptError | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listBusinessPrompts({ q: query, status: filter, limit: PAGE_SIZE })
      .then((d) => {
        if (alive) setList({ state: 'ready', prompts: d.prompts, nextCursor: d.nextCursor });
      })
      .catch(() => {
        if (alive) setList({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [filter, query, reloadToken]);

  if (status === 'unauth')
    return <Navigate to={`/isletme/giris?next=${encodeURIComponent(NEXT_PATH)}`} replace />;

  function redirectToLogin() {
    navigate(`/isletme/giris?next=${encodeURIComponent(NEXT_PATH)}`, { replace: true });
  }

  const reload = () => setReloadToken((t) => t + 1);

  /** Liste durumunu olay ele alınca sıfırlar; etki içinde setState çağrılmaz. */
  const resetList = () => setList({ state: 'loading' });

  /** 409 gövdesindeki `existingId`yi arşivli kayda çevirir (buton kararı). */
  async function toPromptError(err: unknown, text: string): Promise<PromptError> {
    if (err instanceof HttpError && err.code === 'PROMPT_INVALID') return { kind: 'invalid' };
    if (err instanceof HttpError && err.code === 'PROMPT_DUPLICATE' && err.existingId) {
      let archived = false;
      try {
        const { prompts } = await listBusinessPrompts({ q: text, status: 'all', limit: PAGE_SIZE });
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
      await createBusinessPrompt(text);
      setText('');
      reload();
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
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
      await updateBusinessPrompt(editing.id, { text: editing.text });
      setEditing(null);
      reload();
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
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
      await updateBusinessPrompt(id, { status: next });
      setEditing(null);
      setAddError(null);
      setEditError(null);
      reload();
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
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
      const d = await listBusinessPrompts({
        q: query,
        status: filter,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setList({ state: 'ready', prompts: [...prompts, ...d.prompts], nextCursor: d.nextCursor });
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
        redirectToLogin();
        return;
      }
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim());
    resetList();
  }

  function emptyNote(): string {
    if (query) return 'Aramanla eşleşen durum yok.';
    if (filter === 'archived') return 'Arşivde durum yok.';
    return 'Henüz durum yok; yukarıdan ekle.';
  }

  return (
    <PanelLayout>
      <TopBar kicker="İşletme paneli" title="Durumlarım" />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleAdd();
        }}
        aria-label="Durum ekle"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
        noValidate
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Durum ekle</p>
        <div>
          <label htmlFor="prompt-new" className="mb-1 block text-sm font-bold">
            Yeni durum
          </label>
          <textarea
            id="prompt-new"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Örn: Kahve soğuduktan sonraki hayat"
            className="w-full rounded-md border border-line bg-background p-3 text-base"
          />
          <TextCounter text={text} />
        </div>
        {addError ? (
          <PromptErrorAlert
            error={addError}
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
            { value: 'active', label: 'Aktif' },
            { value: 'archived', label: 'Arşiv' },
            { value: 'all', label: 'Tümü' },
          ]}
          onChange={(next) => {
            setFilter(next as PromptStatusFilter);
            resetList();
          }}
        />
        <form
          onSubmit={handleSearch}
          role="search"
          aria-label="Durum ara"
          className="flex items-end gap-2"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="prompt-search" className="mb-1 block text-sm font-bold">
              Ara
            </label>
            <input
              id="prompt-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              maxLength={PROMPT_MAX}
              className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
            />
          </div>
          <GhostButton type="submit" className="min-h-12 w-auto px-4 text-sm">
            Ara
          </GhostButton>
          {query ? (
            <GhostButton
              onClick={() => {
                setSearchInput('');
                setQuery('');
                resetList();
              }}
              className="min-h-12 w-auto px-4 text-sm"
            >
              Temizle
            </GhostButton>
          ) : null}
        </form>
      </Card>

      <section
        aria-label="Durum listesi"
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
                        htmlFor={`prompt-edit-${prompt.id}`}
                        className="block text-sm font-bold"
                      >
                        Durumu düzenle
                      </label>
                      <textarea
                        id={`prompt-edit-${prompt.id}`}
                        rows={2}
                        value={draft.text}
                        onChange={(e) => setEditing({ id: prompt.id, text: e.target.value })}
                        className="w-full rounded-md border border-line bg-surface p-3 text-sm"
                      />
                      <TextCounter text={draft.text} />
                      {editError ? (
                        <PromptErrorAlert
                          error={editError}
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
                      {prompt.adminBlocked ? (
                        <div className="flex flex-col gap-1">
                          <span className="w-fit">
                            <Badge tone="danger">Engellendi</Badge>
                          </span>
                          <Note>Platform tarafından engellendi; oyunlarda çıkmaz.</Note>
                        </div>
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
    </PanelLayout>
  );
}
