import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';

/**
 * `/isletme` yüzeylerinin ortak düzeni (M4c): telefonda alt gezinme,
 * masaüstünde yan menü (SPEC 14.4, PROJECT_LOG 3.4). İçerik sayfalara aittir;
 * oturum düşerse sayfa `/isletme/giris?next=…`'e yönlendirir.
 */

const NAV_ITEMS = [
  { to: '/isletme', label: 'Ana sayfa', end: true },
  { to: '/isletme/durumlar', label: 'Durumlarım', end: false },
  { to: '/isletme/gecmis', label: 'Geçmiş', end: false },
  { to: '/isletme/hesap', label: 'Hesap', end: false },
];

export function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Masaüstü yan menüsü. */}
      <aside
        aria-label="Panel menü"
        className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:gap-1 lg:border-r lg:border-line lg:bg-surface lg:px-3 lg:py-6"
      >
        <p className="mb-4 px-3 text-xs font-bold uppercase tracking-wider text-muted">
          İşletme paneli
        </p>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center rounded-md px-3 text-sm font-bold transition-colors hover:text-accent',
                isActive ? 'bg-surface-raised text-accent' : 'text-foreground',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </aside>

      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-4 px-4 pb-24 pt-4 lg:max-w-3xl lg:pb-10">
        {children}
      </main>

      {/* Telefon alt gezinmesi. */}
      <nav
        aria-label="Panel menü"
        className="sticky bottom-0 z-30 border-t border-line bg-background/95 lg:hidden"
      >
        <div className="mx-auto flex max-w-[430px]">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 min-w-0 flex-1 items-center justify-center break-words px-1 text-center text-xs font-bold leading-tight transition-colors',
                  isActive ? 'text-accent' : 'text-muted',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
