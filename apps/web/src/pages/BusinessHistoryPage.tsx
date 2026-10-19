import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import type { SessionSummary } from '@mol/shared';
import { HttpError, listBusinessSessions } from '@/net/http';
import { GhostButton, Note, TopBar } from '@/components/ui';
import { PanelLayout } from '@/panel/PanelLayout';
import { SessionStatusBadge } from '@/panel/SessionStatusBadge';
import { useBusinessAccount } from '@/panel/useBusinessAccount';
import { formatDateTime, MODE_LABELS } from '@/lib/format';

/**
 * `/isletme/gecmis` (SPEC 14.4, M4c-3): biten / iptal / sonlandırılan
 * oturumların listesi; imleçle "daha fazla" yeniden eskiye sayfalar.
 * Satırlar detay sayfasına (`/isletme/gecmis/:id`) gider.
 */

const PAGE_SIZE = 20;
const NEXT_PATH = '/isletme/gecmis';

type ListState =
  | { state: 'loading' }
  | { state: 'ready'; sessions: SessionSummary[]; nextCursor: string | null }
  | { state: 'error' };

export default function BusinessHistoryPage() {
  const navigate = useNavigate();
  const { status } = useBusinessAccount();
  const [list, setList] = useState<ListState>({ state: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  useEffect(() => {
    let alive = true;
    listBusinessSessions('past', { limit: PAGE_SIZE })
      .then((data) => {
        if (alive)
          setList({ state: 'ready', sessions: data.sessions, nextCursor: data.nextCursor ?? null });
      })
      .catch(() => {
        if (alive) setList({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (status === 'unauth')
    return <Navigate to={`/isletme/giris?next=${encodeURIComponent(NEXT_PATH)}`} replace />;

  function redirectToLogin() {
    navigate(`/isletme/giris?next=${encodeURIComponent(NEXT_PATH)}`, { replace: true });
  }

  async function loadMore() {
    if (list.state !== 'ready' || !list.nextCursor || loadingMore) return;
    const { sessions, nextCursor } = list;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const data = await listBusinessSessions('past', { cursor: nextCursor, limit: PAGE_SIZE });
      setList({
        state: 'ready',
        sessions: [...sessions, ...data.sessions],
        nextCursor: data.nextCursor ?? null,
      });
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

  return (
    <PanelLayout>
      <TopBar kicker="İşletme paneli" title="Geçmiş" />

      <section
        aria-label="Geçmiş oturumlar"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        {list.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : list.state === 'error' ? (
          <Note>Geçmiş alınamadı; sayfayı yenile.</Note>
        ) : list.sessions.length === 0 ? (
          <Note>Henüz bitmiş oyun yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.sessions.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/isletme/gecmis/${session.id}`}
                  className="block rounded-md border border-line bg-background px-3 py-2 transition-colors hover:border-accent"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">Oda {session.roomCode}</span>
                    <SessionStatusBadge status={session.status} />
                  </span>
                  <span className="text-xs text-muted">
                    {formatDateTime(session.createdAt)} · {MODE_LABELS[session.mode]}
                    {session.champion ? ` · Şampiyon: ${session.champion}` : ''}
                  </span>
                </Link>
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
    </PanelLayout>
  );
}
