import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { getPromptHealth, logoutAdmin } from '@/net/admin';
import { cn } from '@/lib/cn';
import { adminLoginPath, isAdminAuthError } from './auth';

/**
 * Admin paneli düzeni (M5c-1, SPEC 16A.1 — nötr ve sade): masaüstünde yan
 * menü, telefonda üst çubuğun açtığı menü. Oturum denetimi tek noktada
 * yapılır; düşerse sayfa `/admin/giris?next=…`'e yönlendirilir.
 */

const NAV_ITEMS = [
  { to: '/admin', label: 'Genel bakış', end: true },
  { to: '/admin/isletmeler', label: 'İşletmeler', end: false },
  { to: '/admin/oturumlar', label: 'Oturumlar', end: false },
  { to: '/admin/icerik', label: 'İçerik', end: false },
  { to: '/admin/sistem', label: 'Sistem', end: false },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState<'loading' | 'ready' | 'unauth'>('loading');
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let alive = true;
    getPromptHealth()
      .then(() => {
        if (alive) setChecked('ready');
      })
      .catch((error) => {
        if (!alive) return;
        // Diğer hatalar sayfalara bırakılır; oturum düşmüşse girişe dönülür.
        setChecked(isAdminAuthError(error) ? 'unauth' : 'ready');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (checked === 'loading')
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p role="status" className="text-sm text-muted">
          Yükleniyor…
        </p>
      </div>
    );
  if (checked === 'unauth')
    return <Navigate to={adminLoginPath(location.pathname + location.search)} replace />;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logoutAdmin();
    } catch {
      /* Oturum zaten düşmüş olabilir; yine de girişe dönülür. */
    }
    navigate('/admin/giris', { replace: true });
  }

  const links = (onClick?: () => void): ReactNode =>
    NAV_ITEMS.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onClick}
        className={({ isActive }) =>
          cn(
            'flex min-h-11 items-center rounded-md px-3 text-sm font-bold transition-colors hover:text-accent',
            isActive ? 'bg-surface-raised text-accent' : 'text-foreground',
          )
        }
      >
        {item.label}
      </NavLink>
    ));

  const logoutButton = (className: string) => (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={loggingOut}
      className={cn(
        'flex min-h-11 items-center rounded-md px-3 text-sm font-bold text-muted transition-colors hover:text-accent disabled:opacity-50',
        className,
      )}
    >
      {loggingOut ? 'Çıkış yapılıyor…' : 'Çıkış yap'}
    </button>
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Telefon: üst çubuk + açılır menü. */}
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Admin paneli</p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="admin-menu-phone"
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 rounded-md border border-line px-4 text-sm font-bold"
        >
          Menü
        </button>
      </header>
      {open ? (
        <nav
          id="admin-menu-phone"
          aria-label="Admin menü"
          className="flex flex-col gap-1 border-b border-line bg-surface px-3 py-3 lg:hidden"
        >
          {links(() => setOpen(false))}
          {logoutButton('mt-2')}
        </nav>
      ) : null}

      {/* Masaüstü yan menü. */}
      <aside
        aria-label="Admin menü"
        className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:gap-1 lg:border-r lg:border-line lg:bg-surface lg:px-3 lg:py-6"
      >
        <p className="mb-4 px-3 text-xs font-bold uppercase tracking-wider text-muted">
          Admin paneli
        </p>
        {links()}
        {logoutButton('mt-auto')}
      </aside>

      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-4 px-4 pb-24 pt-4 lg:max-w-4xl lg:pb-10">
        <Outlet />
      </main>
    </div>
  );
}
