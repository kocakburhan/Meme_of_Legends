import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AdminBusiness } from '@mol/shared';
import { createAdminBusiness, listAdminBusinesses } from '@/net/admin';
import type { AdminActiveFilter } from '@/net/admin';
import { HttpError } from '@/net/http';
import { Badge, Segmented } from '@/console/bits';
import { Card, GhostButton, Note, PrimaryButton, TopBar } from '@/components/ui';
import { CopyButton } from '@/admin/CopyButton';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin/isletmeler` (M5c-1, SPEC 15.1, 3.1): arama + aktif/pasif filtresiyle
 * liste; kısa formla işletme açma (ad, kullanıcı adı, başlangıç hakkı,
 * önerilen şifre değiştirilebilir) → giriş bilgisi özeti + "Kopyala".
 * Satırlar detay sayfasına gider.
 */

const FALLBACK_PASSWORD_LENGTH = 16;

type ListState =
  { state: 'loading' } | { state: 'ready'; businesses: AdminBusiness[] } | { state: 'error' };

type CreatedCredentials = {
  businessId: string;
  loginUrl: string;
  username: string;
  temporaryPassword: string;
  summary: string;
};

/** Sistem önerisi: sunucu şeması en az 12 karakter ister (admin-api.md). */
function suggestedPassword(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, FALLBACK_PASSWORD_LENGTH);
}

export default function AdminBusinessesPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AdminActiveFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [list, setList] = useState<ListState>({ state: 'loading' });
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedCredentials | null>(null);

  useEffect(() => {
    let alive = true;
    listAdminBusinesses({ q: query, active: filter })
      .then((d) => {
        if (alive) setList({ state: 'ready', businesses: d.businesses });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error))
          navigate(adminLoginPath('/admin/isletmeler'), { replace: true });
        else setList({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [filter, query, reloadToken, navigate]);

  const reload = () => setReloadToken((t) => t + 1);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim());
    setList({ state: 'loading' });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const name = String(input.get('name') ?? '').trim();
    const username = String(input.get('username') ?? '').trim();
    const credits = Number(input.get('credits'));
    const password = String(input.get('password') ?? '');
    if (!name || !username || !Number.isInteger(credits) || credits < 0) {
      setCreateError(
        'İşletme adı, kullanıcı adı ve sıfır ya da daha büyük bir hak sayısı gerekli.',
      );
      return;
    }
    if (password.length < 12) {
      setCreateError('Şifre en az 12 karakter olmalı.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const data = await createAdminBusiness({ name, username, credits, password });
      setCreated({ businessId: data.business.id, ...data.credentials });
      setFormOpen(false);
      reload();
    } catch (error) {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath('/admin/isletmeler'), { replace: true });
        return;
      }
      setCreateError(
        error instanceof HttpError && error.code === 'USERNAME_TAKEN'
          ? 'Bu kullanıcı adı alınmış.'
          : 'İşletme oluşturulamadı; biraz sonra tekrar dene.',
      );
    } finally {
      setCreating(false);
    }
  }

  function emptyNote(): string {
    if (query) return 'Aramayla eşleşen işletme yok.';
    if (filter === 'false') return 'Pasif işletme yok.';
    if (filter === 'true') return 'Aktif işletme yok.';
    return 'Henüz işletme yok; yukarıdan oluştur.';
  }

  return (
    <>
      <TopBar kicker="Platform" title="İşletmeler" />

      <section
        aria-label="İşletme oluştur"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">İşletme oluştur</p>
          <GhostButton
            onClick={() => {
              setFormOpen((o) => !o);
              setCreateError(null);
            }}
            className="min-h-11 w-auto px-3 text-sm"
          >
            {formOpen ? 'Formu kapat' : 'İşletme Oluştur'}
          </GhostButton>
        </div>

        {created ? (
          <div
            role="note"
            aria-label="Giriş bilgileri"
            className="flex flex-col gap-3 rounded-md border border-accent bg-background p-3"
          >
            <p className="text-sm font-bold leading-snug">
              İşletme oluşturuldu. Giriş bilgilerini işletmeyle paylaşın.
            </p>
            <pre
              data-testid="credentials-summary"
              className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed"
            >
              {created.summary}
            </pre>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={created.summary} className="min-h-11 flex-1 px-3 text-sm" />
              <Link
                to={`/admin/isletmeler/${created.businessId}`}
                className="flex min-h-11 items-center rounded-md bg-accent px-3 text-sm font-bold text-accent-ink"
              >
                İşletmeye git
              </Link>
            </div>
          </div>
        ) : null}

        {formOpen ? (
          <form onSubmit={handleCreate} className="flex flex-col gap-3" noValidate>
            <div>
              <label htmlFor="business-name" className="mb-1 block text-sm font-bold">
                İşletme adı
              </label>
              <input
                id="business-name"
                name="name"
                maxLength={200}
                className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
              />
            </div>
            <div>
              <label htmlFor="business-username" className="mb-1 block text-sm font-bold">
                Kullanıcı adı
              </label>
              <input
                id="business-username"
                name="username"
                autoCapitalize="none"
                maxLength={100}
                className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
              />
            </div>
            <div>
              <label htmlFor="business-credits" className="mb-1 block text-sm font-bold">
                Başlangıç hakkı
              </label>
              <input
                id="business-credits"
                name="credits"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={5}
                className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
              />
            </div>
            <div>
              <label htmlFor="business-password" className="mb-1 block text-sm font-bold">
                Önerilen şifre
              </label>
              <input
                id="business-password"
                name="password"
                defaultValue={suggestedPassword()}
                autoCapitalize="none"
                maxLength={128}
                className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
              />
              <p className="mt-1 text-xs text-muted">
                Geçici şifre önerilir; işletme ilk girişte değiştirmesi için yönlendirilir.
              </p>
            </div>
            {createError ? (
              <p role="alert" className="text-sm text-danger">
                {createError}
              </p>
            ) : null}
            <PrimaryButton type="submit" disabled={creating}>
              {creating ? 'Oluşturuluyor…' : 'Oluştur'}
            </PrimaryButton>
          </form>
        ) : null}
      </section>

      <Card className="flex flex-col gap-3">
        <Segmented
          ariaLabel="Durum filtresi"
          value={filter}
          options={[
            { value: 'all', label: 'Tümü' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' },
          ]}
          onChange={(next) => {
            setFilter(next as AdminActiveFilter);
            setList({ state: 'loading' });
          }}
        />
        <form
          onSubmit={handleSearch}
          role="search"
          aria-label="İşletme ara"
          className="flex items-end gap-2"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="business-search" className="mb-1 block text-sm font-bold">
              Ara
            </label>
            <input
              id="business-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              maxLength={200}
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
                setList({ state: 'loading' });
              }}
              className="min-h-12 w-auto px-4 text-sm"
            >
              Temizle
            </GhostButton>
          ) : null}
        </form>
      </Card>

      <section
        aria-label="İşletme listesi"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">İşletmeler</p>
        {list.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : list.state === 'error' ? (
          <Note>İşletmeler alınamadı; sayfayı yenile.</Note>
        ) : list.businesses.length === 0 ? (
          <Note>{emptyNote()}</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.businesses.map((business) => (
              <li key={business.id}>
                <Link
                  to={`/admin/isletmeler/${business.id}`}
                  className="block rounded-md border border-line bg-background px-3 py-2 transition-colors hover:border-accent"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{business.name}</span>
                    <Badge tone={business.active ? 'success' : 'danger'}>
                      {business.active ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </span>
                  <span className="text-xs text-muted">
                    {business.username} ·{' '}
                    {business.unlimitedCredits ? 'Sınırsız hak' : `${business.credits} hak`}
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
