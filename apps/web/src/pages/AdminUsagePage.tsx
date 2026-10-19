import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { getAdminUsage, type AdminUsageRow } from '@/net/admin';
import { Badge } from '@/console/bits';
import { Note, TopBar } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin/oturumlar/kullanim` (M5c-3, SPEC 15.4): işletme bazında kullanım —
 * oturum sayıları, harcanan ve iade edilen haklar, son oyun. Satırlar işletme
 * detayına gider.
 */

const NEXT_PATH = '/admin/oturumlar/kullanim';

type UsageState =
  { state: 'loading' } | { state: 'ready'; rows: AdminUsageRow[] } | { state: 'error' };

export default function AdminUsagePage() {
  const navigate = useNavigate();
  const [state, setState] = useState<UsageState>({ state: 'loading' });

  useEffect(() => {
    let alive = true;
    getAdminUsage()
      .then((data) => {
        if (alive) setState({ state: 'ready', rows: data.businesses });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
        else setState({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [navigate]);

  const totals =
    state.state === 'ready'
      ? state.rows.reduce(
          (sum, row) => ({
            sessions: sum.sessions + row.usage.sessionCount,
            consumed: sum.consumed + row.usage.consumedCredits,
            refunded: sum.refunded + row.usage.refundedCredits,
          }),
          { sessions: 0, consumed: 0, refunded: 0 },
        )
      : null;

  return (
    <>
      <Link to="/admin/oturumlar" className="text-sm underline underline-offset-4">
        ← Oturumlar
      </Link>
      <TopBar kicker="Oturumlar" title="İşletme kullanımı" />

      <section
        aria-label="Kullanım açıklaması"
        className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm leading-relaxed"
      >
        <p>
          <span className="font-bold">Harcanan hak</span> oyunu başlatılan oturumları sayar; lobi
          açmak hak tüketmez.
        </p>
        <p className="text-muted">
          <span className="font-bold">İade edilen hak</span> admin tarafından geri verilen oturumları
          gösterir. Sınırsız haklı işletmelerde harcanan hak oluşmaz.
        </p>
      </section>

      {totals ? (
        <section
          aria-label="Kullanım toplamı"
          className="grid grid-cols-1 gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:grid-cols-3"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Oturum</p>
            <p className="font-display text-2xl tabular-nums">{totals.sessions}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Harcanan hak</p>
            <p className="font-display text-2xl tabular-nums">{totals.consumed}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">İade edilen hak</p>
            <p className="font-display text-2xl tabular-nums">{totals.refunded}</p>
          </div>
        </section>
      ) : null}

      <section
        aria-label="İşletme kullanım listesi"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">İşletmeler</p>
        {state.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : state.state === 'error' ? (
          <Note>Kullanım özeti alınamadı; sayfayı yenile.</Note>
        ) : state.rows.length === 0 ? (
          <Note>Henüz işletme yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {state.rows.map(({ business, usage }) => (
              <li key={business.id}>
                <Link
                  to={`/admin/isletmeler/${business.id}`}
                  className="block rounded-md border border-line bg-background px-3 py-2 transition-colors hover:border-accent"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-bold">{business.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Badge tone={business.active ? 'success' : 'danger'}>
                        {business.active ? 'Aktif' : 'Pasif'}
                      </Badge>
                      {business.unlimitedCredits ? <Badge tone="line">Sınırsız</Badge> : null}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {usage.sessionCount} oturum · {usage.activeSessionCount} aktif · Harcanan{' '}
                    {usage.consumedCredits} · İade {usage.refundedCredits}
                  </span>
                  <span className="block text-xs text-muted">
                    Son oyun: {usage.lastGameAt === null ? '—' : formatDateTime(usage.lastGameAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
