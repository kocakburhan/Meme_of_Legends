import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  listAdminActions,
  listAdminErrors,
  type AdminAction,
  type AdminError,
} from '@/net/admin';
import { GhostButton, Note, TopBar } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { ADMIN_ACTION_LABELS } from '@/admin/labels';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin/sistem` (M5c-3, madde 5): sistem hata kayıtları ve admin işlem
 * kaydı — filtre + imleçli listeler. Hata ayrıntıları sunucuda güvenli alanlara
 * indirgenir; admin işlemleri hedef ve işlem adıyla süzülebilir.
 */

const NEXT_PATH = '/admin/sistem';
const PAGE_SIZE = 50;

type ErrorFilters = { sessionId: string; source: string; code: string };
type ActionFilters = { targetId: string; action: string };

const EMPTY_ERROR_FILTERS: ErrorFilters = { sessionId: '', source: '', code: '' };
const EMPTY_ACTION_FILTERS: ActionFilters = { targetId: '', action: '' };

type ErrorListState =
  | { state: 'loading' }
  | { state: 'ready'; errors: AdminError[]; nextCursor: string | null }
  | { state: 'error' };

type ActionListState =
  | { state: 'loading' }
  | { state: 'ready'; actions: AdminAction[]; nextCursor: string | null }
  | { state: 'error' };

function ErrorDetails({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  return (
    <dl className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
      {entries.map(([key, entry]) => (
        <div key={key} className="flex gap-2">
          <dt className="shrink-0 font-bold">{key}:</dt>
          <dd className="min-w-0 break-words">
            {typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
              ? String(entry)
              : JSON.stringify(entry)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ErrorLogSection({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [draft, setDraft] = useState<ErrorFilters>(EMPTY_ERROR_FILTERS);
  const [filters, setFilters] = useState<ErrorFilters>(EMPTY_ERROR_FILTERS);
  const [list, setList] = useState<ErrorListState>({ state: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  useEffect(() => {
    let alive = true;
    listAdminErrors({
      sessionId: filters.sessionId || undefined,
      source: filters.source || undefined,
      code: filters.code || undefined,
      limit: PAGE_SIZE,
    })
      .then((data) => {
        if (alive) setList({ state: 'ready', errors: data.errors, nextCursor: data.nextCursor });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
        else setList({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [filters, navigate]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setList({ state: 'loading' });
    setFilters({
      sessionId: draft.sessionId.trim(),
      source: draft.source.trim(),
      code: draft.code.trim(),
    });
  }

  function clear() {
    setDraft(EMPTY_ERROR_FILTERS);
    setFilters(EMPTY_ERROR_FILTERS);
    setList({ state: 'loading' });
  }

  async function loadMore() {
    if (list.state !== 'ready' || !list.nextCursor || loadingMore) return;
    const { errors, nextCursor } = list;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const data = await listAdminErrors({
        sessionId: filters.sessionId || undefined,
        source: filters.source || undefined,
        code: filters.code || undefined,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setList({ state: 'ready', errors: [...errors, ...data.errors], nextCursor: data.nextCursor });
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

  const active = filters.sessionId !== '' || filters.source !== '' || filters.code !== '';

  return (
    <>
      <form
        onSubmit={apply}
        aria-label="Hata filtresi"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Hata filtresi</p>
          {active ? (
            <GhostButton wide={false} className="min-h-11 px-3 text-sm" onClick={clear}>
              Temizle
            </GhostButton>
          ) : null}
        </div>
        <div>
          <label htmlFor="error-session" className="mb-1 block text-sm font-bold">
            Oturum kimliği
          </label>
          <input
            id="error-session"
            value={draft.sessionId}
            onChange={(event) => setDraft((current) => ({ ...current, sessionId: event.target.value }))}
            maxLength={200}
            className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="error-source" className="mb-1 block text-sm font-bold">
              Kaynak
            </label>
            <input
              id="error-source"
              value={draft.source}
              onChange={(event) =>
                setDraft((current) => ({ ...current, source: event.target.value }))
              }
              maxLength={200}
              placeholder="ör. media"
              className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
            />
          </div>
          <div>
            <label htmlFor="error-code" className="mb-1 block text-sm font-bold">
              Kod
            </label>
            <input
              id="error-code"
              value={draft.code}
              onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
              maxLength={200}
              placeholder="ör. MEDIA_INVALID"
              className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
            />
          </div>
        </div>
        <GhostButton type="submit" className="min-h-11 text-sm">
          Filtrele
        </GhostButton>
      </form>

      <section
        aria-label="Hata kayıtları"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Hata kayıtları</p>
        {list.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : list.state === 'error' ? (
          <Note>Hata kayıtları alınamadı; sayfayı yenile.</Note>
        ) : list.errors.length === 0 ? (
          <Note>Kayıtlı hata yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.errors.map((error) => (
              <li
                key={error.id}
                className="rounded-md border border-line bg-background px-3 py-2 text-sm"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{error.code}</span>
                  <span className="text-xs text-muted">{formatDateTime(error.occurredAt)}</span>
                </span>
                <span className="block text-xs text-muted">
                  Kaynak: {error.source}
                  {error.sessionId ? (
                    <>
                      {' · '}
                      <Link
                        to={`/admin/oturumlar/${error.sessionId}`}
                        className="underline underline-offset-4"
                      >
                        Oturum {error.sessionId}
                      </Link>
                    </>
                  ) : null}
                </span>
                <ErrorDetails value={error.details} />
              </li>
            ))}
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

function ActionLogSection({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [draft, setDraft] = useState<ActionFilters>(EMPTY_ACTION_FILTERS);
  const [filters, setFilters] = useState<ActionFilters>(EMPTY_ACTION_FILTERS);
  const [list, setList] = useState<ActionListState>({ state: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  useEffect(() => {
    let alive = true;
    listAdminActions({
      targetId: filters.targetId || undefined,
      action: filters.action || undefined,
      limit: PAGE_SIZE,
    })
      .then((data) => {
        if (alive) setList({ state: 'ready', actions: data.actions, nextCursor: data.nextCursor });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
        else setList({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [filters, navigate]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setList({ state: 'loading' });
    setFilters({ targetId: draft.targetId.trim(), action: draft.action.trim() });
  }

  function clear() {
    setDraft(EMPTY_ACTION_FILTERS);
    setFilters(EMPTY_ACTION_FILTERS);
    setList({ state: 'loading' });
  }

  async function loadMore() {
    if (list.state !== 'ready' || !list.nextCursor || loadingMore) return;
    const { actions, nextCursor } = list;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const data = await listAdminActions({
        targetId: filters.targetId || undefined,
        action: filters.action || undefined,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setList({
        state: 'ready',
        actions: [...actions, ...data.actions],
        nextCursor: data.nextCursor,
      });
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

  const active = filters.targetId !== '' || filters.action !== '';

  return (
    <>
      <form
        onSubmit={apply}
        aria-label="İşlem filtresi"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">İşlem filtresi</p>
          {active ? (
            <GhostButton wide={false} className="min-h-11 px-3 text-sm" onClick={clear}>
              Temizle
            </GhostButton>
          ) : null}
        </div>
        <div>
          <label htmlFor="action-target" className="mb-1 block text-sm font-bold">
            Hedef kimliği
          </label>
          <input
            id="action-target"
            value={draft.targetId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, targetId: event.target.value }))
            }
            maxLength={200}
            className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
          />
        </div>
        <div>
          <label htmlFor="action-name" className="mb-1 block text-sm font-bold">
            İşlem
          </label>
          <input
            id="action-name"
            value={draft.action}
            onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))}
            maxLength={200}
            placeholder="ör. sessionTerminated"
            className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
          />
        </div>
        <GhostButton type="submit" className="min-h-11 text-sm">
          Filtrele
        </GhostButton>
      </form>

      <section
        aria-label="Admin işlem kaydı"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Admin işlem kaydı</p>
        {list.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : list.state === 'error' ? (
          <Note>İşlem kaydı alınamadı; sayfayı yenile.</Note>
        ) : list.actions.length === 0 ? (
          <Note>Admin işlem kaydı yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.actions.map((action) => (
              <li
                key={action.id}
                className="rounded-md border border-line bg-background px-3 py-2 text-sm"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    {ADMIN_ACTION_LABELS[action.action] ?? action.action}
                  </span>
                  <span className="text-xs text-muted">
                    {formatDateTime(action.occurredAt)}
                  </span>
                </span>
                <span className="block break-all text-xs text-muted">
                  İşlem: {action.action} · Hedef: {action.targetId}
                </span>
                <ErrorDetails value={action.details} />
              </li>
            ))}
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

export default function AdminSystemPage() {
  const navigate = useNavigate();
  return (
    <>
      <TopBar kicker="Platform" title="Sistem" />
      <Note>
        Hata kayıtları kaynak/kod/oturumla, admin işlemleri hedef ve işlem adıyla süzülür.
        Kimlik değerleri teknik kayıt kimlikleridir.
      </Note>
      <ErrorLogSection navigate={navigate} />
      <ActionLogSection navigate={navigate} />
    </>
  );
}
