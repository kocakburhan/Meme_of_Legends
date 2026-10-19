import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { loginAdmin } from '@/net/admin';
import { HttpError } from '@/net/http';
import { Note, PrimaryButton, Screen, TopBar } from '@/components/ui';

/**
 * `/admin/giris` (SPEC 2.1, 15): tek admin hesabı; kullanıcı adı + şifre →
 * admin oturumu (HttpOnly çerez). `?next=` ile panelde istenen yere dönülür;
 * next yalnız aynı köken içindeki yollara izin verir.
 */

const FALLBACK_NEXT = '/admin';

function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : FALLBACK_NEXT;
}

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get('next'));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const username = String(input.get('username') ?? '').trim();
    const password = String(input.get('password') ?? '');
    if (!username || !password) {
      setError('Kullanıcı adı ve şifre gerekli.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await loginAdmin({ username, password });
      navigate(next, { replace: true });
    } catch (err) {
      setError(
        err instanceof HttpError && err.code === 'INVALID_CREDENTIALS'
          ? 'Kullanıcı adı ya da şifre hatalı.'
          : 'Giriş yapılamadı; biraz sonra tekrar dene.',
      );
      setBusy(false);
    }
  }

  return (
    <Screen className="items-center justify-center">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
        <TopBar kicker="Platform" title="Admin girişi" />
        <Note>Bu giriş yalnız platform admin hesabı içindir.</Note>
        <div>
          <label htmlFor="admin-username" className="mb-1 block text-sm font-bold">
            Kullanıcı adı
          </label>
          <input
            id="admin-username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            className="h-12 w-full rounded-md border border-line bg-surface px-3 text-base"
          />
        </div>
        <div>
          <label htmlFor="admin-password" className="mb-1 block text-sm font-bold">
            Şifre
          </label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="h-12 w-full rounded-md border border-line bg-surface px-3 text-base"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </PrimaryButton>
        <a href="/" className="text-center text-sm underline underline-offset-4">
          Ana sayfaya dön
        </a>
      </form>
    </Screen>
  );
}
