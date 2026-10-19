import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AdminBusiness, AdminSession } from '@mol/shared';
import {
  listAdminBusinesses,
  listAdminSessions,
  type AdminSessionStatusFilter,
} from '@/net/admin';
import { Badge } from '@/console/bits';
import { GhostButton, Note, TopBar } from '@/components/ui';
import { SessionStatusBadge } from '@/panel/SessionStatusBadge';
import { MODE_LABELS, formatDateTime } from '@/lib/format';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin/oturumlar` (M5c-3, SPEC 15.4): canlı ve geçmiş oturumlar — işletme,
 * durum ve tarih filtresi, imleçli liste. Satırlar oturum detayına gider.
 * İşletme bazında kullanım özeti ayrı sayfadadır.
 */

const PAGE_SIZE = 50;
const NEXT_PATH = '/admin/oturumlar';

const STATUS_OPTIONS: { value: AdminSessionStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'active', label: 'Aktif' },
  { value: 'past', label: 'Geçmiş' },
  { value: 'lobby', label: 'Lobi' },
  { value: 'running', label: 'Oyun' },
  { value: 'paused', label: 'Duraklatıldı' },
  { value: 'finished', label: 'Bitti' },
  { value: 'cancelled', label: 'İptal edildi' },
  { value: 'terminated', label: 'Sonlandırıldı' },
];

type ListState =
  | { state: 'loading' }
  | { state: 'ready'; sessions: AdminSession[]; nextCursor: string | null }
  | { state: 'error'; message: string };

type BusinessesState =
  | { state: 'loading' }
  | { state: 'ready'; businesses: AdminBusiness[] }
  | { state: 'error' };

/** YYYY-MM-DD yerel günün başlangıcı (dahil). */
function dayStart(value: string): number | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

/** YYYY-MM-DD yerel günün sonu (dahil). */
function dayEnd(value: string): number | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

export default function AdminSessionsPage() {
  const navigate = useNavigate();
  const [businessId, setBusinessId] = useState('');
  const [status, setStatus] = useState<AdminSessionStatusFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [businesses, setBusinesses] = useState<BusinessesState>({ state: 'loading' });
  const [list, setList] = useState<ListState>({ state: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  useEffect(() => {
    let alive = true;
    listAdminBusinesses()
      .then((data) => {
        if (alive) setBusinesses({ state: 'ready', businesses: data.businesses });
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
    const fromTime = dayStart(from);
    const toTime = dayEnd(to);
    if (fromTime !== undefined && toTime !== undefined && fromTime > toTime) {
      return () => {
        alive = false;
      };
    }
    listAdminSessions({
      businessId: businessId || undefined,
      status,
      from: fromTime,
      to: toTime,
      limit: PAGE_SIZE,
    })
      .then((data) => {
        if (alive)
          setList({ state: 'ready', sessions: data.sessions, nextCursor: data.nextCursor });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
        else setList({ state: 'error', message: 'Oturumlar alınamadı; sayfayı yenile.' });
      });
    return () => {
      alive = false;
    };
  }, [businessId, status, from, to, navigate]);

  const resetList = () => setList({ state: 'loading' });

  function businessName(id: string): string {
    return businesses.state === 'ready'
      ? (businesses.businesses.find((business) => business.id === id)?.name ?? 'İşletme')
      : 'İşletme';
  }

  async function loadMore() {
    if (list.state !== 'ready' || !list.nextCursor || loadingMore) return;
    const { sessions, nextCursor } = list;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const data = await listAdminSessions({
        businessId: businessId || undefined,
        status,
        from: dayStart(from),
        to: dayEnd(to),
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setList({ state: 'ready', sessions: [...sessions, ...data.sessions], nextCursor: data.nextCursor });
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

  const hasFilter = businessId !== '' || status !== 'all' || from !== '' || to !== '';
  const fromTime = dayStart(from);
  const toTime = dayEnd(to);
  const rangeInvalid =
    fromTime !== undefined && toTime !== undefined && fromTime > toTime;

  function emptyNote(): string {
    if (hasFilter) return 'Filtreyle eşleşen oturum yok.';
    return 'Henüz oturum yok. İşletme panelinden bir lobi açıldığında burada görünür.';
  }

  return (
    <>
      <TopBar
        kicker="Platform"
        title="Oturumlar"
        right={
          <Link
            to="/admin/oturumlar/kullanim"
            className="flex min-h-11 items-center rounded-md border border-line px-3 text-sm font-bold transition-colors hover:border-accent"
          >
            Kullanım
          </Link>
        }
      />

      <section
        aria-label="Oturum filtreleri"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Filtreler</p>
          {hasFilter ? (
            <GhostButton
              wide={false}
              className="min-h-11 px-3 text-sm"
              onClick={() => {
                setBusinessId('');
                setStatus('all');
                setFrom('');
                setTo('');
                resetList();
              }}
            >
              Temizle
            </GhostButton>
          ) : null}
        </div>

        <div>
          <label htmlFor="session-business" className="mb-1 block text-sm font-bold">
            İşletme
          </label>
          <select
            id="session-business"
            value={businessId}
            onChange={(event) => {
              setBusinessId(event.target.value);
              resetList();
            }}
            className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
          >
            <option value="">Tüm işletmeler</option>
            {businesses.state === 'ready'
              ? businesses.businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))
              : null}
          </select>
          {businesses.state === 'error' ? (
            <Note className="mt-1">İşletme listesi alınamadı; sayfayı yenile.</Note>
          ) : null}
        </div>

        <div>
          <label htmlFor="session-status" className="mb-1 block text-sm font-bold">
            Durum
          </label>
          <select
            id="session-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AdminSessionStatusFilter);
              resetList();
            }}
            className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="session-from" className="mb-1 block text-sm font-bold">
              Başlangıç tarihi
            </label>
            <input
              id="session-from"
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                resetList();
              }}
              className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
            />
          </div>
          <div>
            <label htmlFor="session-to" className="mb-1 block text-sm font-bold">
              Bitiş tarihi
            </label>
            <input
              id="session-to"
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                resetList();
              }}
              className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
            />
          </div>
        </div>
        <Note>Tarihler oturumun oluşturulma gününe göre süzülür; iki sınır da dahildir.</Note>
      </section>

      <section
        aria-label="Oturum listesi"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Oturumlar</p>
        {rangeInvalid ? (
          <Note>Başlangıç tarihi bitiş tarihinden sonra olamaz.</Note>
        ) : list.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : list.state === 'error' ? (
          <Note>{list.message}</Note>
        ) : list.sessions.length === 0 ? (
          <Note>{emptyNote()}</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.sessions.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/admin/oturumlar/${session.id}`}
                  className="block rounded-md border border-line bg-background px-3 py-2 transition-colors hover:border-accent"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-bold">
                      {businessName(session.businessId)} · Oda {session.roomCode}
                    </span>
                    <SessionStatusBadge status={session.status} />
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span>{formatDateTime(session.createdAt)}</span>
                    <span>· {MODE_LABELS[session.mode]}</span>
                    <span>
                      · {session.creditRefunded
                        ? 'Hak iade edildi'
                        : (session.creditCharged ?? session.creditConsumed)
                          ? 'Hak harcandı'
                          : 'Hak harcanmadı'}
                    </span>
                    {session.adminIntervention ? <Badge tone="danger">Müdahale</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!rangeInvalid && list.state === 'ready' && list.nextCursor ? (
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

      <Link to="/admin/oturumlar/kullanim" className="text-sm underline underline-offset-4">
        İşletme bazında kullanım özeti
      </Link>
    </>
  );
}
