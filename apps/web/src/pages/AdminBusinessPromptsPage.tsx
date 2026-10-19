import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { AdminBusiness } from '@mol/shared';
import {
  blockAdminBusinessPrompt,
  listAdminBusinessPrompts,
  listAdminBusinesses,
  type AdminPrompt,
  type AdminPromptBlockFilter,
} from '@/net/admin';
import { Card, GhostButton, Note, TopBar } from '@/components/ui';
import { SearchForm } from '@/components/SearchForm';
import { Badge, Segmented } from '@/console/bits';
import { formatDateTime } from '@/lib/format';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin/icerik/isletme-durumlari` (SPEC 6.2, madde 4): işletme durumlarının
 * platform denetimi — işletme seçimi, metin araması, engelli filtresi;
 * engelle / engeli kaldır. Metin burada düzenlenemez; işletmeye aittir.
 */

const PAGE_SIZE = 50;
const NEXT_PATH = '/admin/icerik/isletme-durumlari';

type PromptListState =
  | { state: 'loading' }
  | { state: 'ready'; prompts: AdminPrompt[]; nextCursor: string | null }
  | { state: 'error' };

type BusinessesState = { state: 'loading' } | { state: 'ready'; names: Map<string, string> } | { state: 'error' };

export default function AdminBusinessPromptsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // İşletme detayından "Durumlarını denetle" ile ?businessId= gelirse seçili başlar.
  const [businessId, setBusinessId] = useState(searchParams.get('businessId') ?? '');
  const [blocked, setBlocked] = useState<AdminPromptBlockFilter>('all');
  const [query, setQuery] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [businesses, setBusinesses] = useState<BusinessesState>({ state: 'loading' });
  const [list, setList] = useState<PromptListState>({ state: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listAdminBusinesses()
      .then((d) => {
        if (alive)
          setBusinesses({
            state: 'ready',
            names: new Map(d.businesses.map((b: AdminBusiness) => [b.id, b.name])),
          });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
        else setBusinesses({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [navigate]);

  useEffect(() => {
    let alive = true;
    listAdminBusinessPrompts({
      businessId: businessId || undefined,
      q: query,
      blocked,
      limit: PAGE_SIZE,
    })
      .then((d) => {
        if (alive) setList({ state: 'ready', prompts: d.prompts, nextCursor: d.nextCursor });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
        else setList({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [businessId, blocked, query, reloadToken, navigate]);

  const reload = () => setReloadToken((t) => t + 1);
  const resetList = () => setList({ state: 'loading' });

  async function handleBlock(id: string, adminBlocked: boolean) {
    setRowBusyId(id);
    setActionError(null);
    try {
      await blockAdminBusinessPrompt(id, adminBlocked);
      reload();
    } catch (error) {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath(NEXT_PATH), { replace: true });
        return;
      }
      setActionError('Engelleme kaydedilemedi; biraz sonra tekrar dene.');
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
      const d = await listAdminBusinessPrompts({
        businessId: businessId || undefined,
        q: query,
        blocked,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setList({ state: 'ready', prompts: [...prompts, ...d.prompts], nextCursor: d.nextCursor });
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

  function businessName(id: string): string {
    return businesses.state === 'ready' ? (businesses.names.get(id) ?? 'İşletme') : 'İşletme';
  }

  function emptyNote(): string {
    if (query) return 'Aramayla eşleşen durum yok.';
    if (blocked === 'true') return 'Engelli durum yok.';
    if (blocked === 'false') return 'Engelsiz durum yok.';
    return 'Bu işletmenin durumu yok ya da seçili işletme yok.';
  }

  return (
    <>
      <TopBar kicker="İçerik" title="İşletme durumu denetimi" />

      <Card className="flex flex-col gap-3">
        <div>
          <label htmlFor="business-prompt-filter" className="mb-1 block text-sm font-bold">
            İşletme
          </label>
          <select
            id="business-prompt-filter"
            value={businessId}
            onChange={(e) => {
              setBusinessId(e.target.value);
              resetList();
            }}
            className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
          >
            <option value="">Tüm işletmeler</option>
            {businesses.state === 'ready'
              ? [...businesses.names.entries()].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))
              : null}
          </select>
        </div>
        <Segmented
          ariaLabel="Engelli filtresi"
          value={blocked}
          options={[
            { value: 'all', label: 'Tümü' },
            { value: 'true', label: 'Engelli' },
            { value: 'false', label: 'Engelsiz' },
          ]}
          onChange={(next) => {
            setBlocked(next as AdminPromptBlockFilter);
            resetList();
          }}
        />
        <SearchForm
          id="business-prompt-search"
          ariaLabel="İşletme durumu ara"
          placeholder="Durum metninde ara"
          onSubmit={(next) => {
            setQuery(next);
            resetList();
          }}
        />
      </Card>

      <section
        aria-label="İşletme durum listesi"
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
            {list.prompts.map((prompt) => (
              <li
                key={prompt.id}
                className="flex flex-col gap-2 rounded-md border border-line bg-background p-3"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-bold">
                    {businessName(prompt.businessId ?? '')}
                  </span>
                  {prompt.adminBlocked ? <Badge tone="danger">Engellendi</Badge> : null}
                </span>
                <p className="whitespace-pre-line break-words text-sm leading-relaxed">
                  {prompt.text}
                </p>
                <span className="text-xs text-muted">
                  {prompt.status === 'archived' ? 'Arşivli · ' : ''}
                  {formatDateTime(prompt.createdAt)}
                </span>
                {prompt.adminBlocked ? (
                  <GhostButton
                    onClick={() => void handleBlock(prompt.id, false)}
                    disabled={rowBusyId === prompt.id}
                    className="min-h-11 flex-1 px-3 text-sm"
                  >
                    {rowBusyId === prompt.id ? 'Kaldırılıyor…' : 'Engeli kaldır'}
                  </GhostButton>
                ) : (
                  <GhostButton
                    onClick={() => void handleBlock(prompt.id, true)}
                    disabled={rowBusyId === prompt.id}
                    className="min-h-11 flex-1 px-3 text-sm"
                  >
                    {rowBusyId === prompt.id ? 'Engelleniyor…' : 'Engelle'}
                  </GhostButton>
                )}
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
