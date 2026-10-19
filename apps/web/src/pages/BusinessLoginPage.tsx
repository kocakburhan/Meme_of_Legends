import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { HttpError, loginBusiness } from '@/net/http';
import { Note, PrimaryButton, Screen, TopBar } from '@/components/ui';

/**
 * `/isletme/giris` (SPEC 2.2, 14.4): kullanıcı adı + şifre → işletme oturumu
 * (HttpOnly çerez). `?next=` ile konsola dönülür.
 */
export default function BusinessLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rawNext = params.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/isletme';

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
      await loginBusiness({ username, password });
      navigate(next, { replace: true });
    } catch (error) {
      setError(
        error instanceof HttpError && error.code === 'INVALID_CREDENTIALS'
          ? 'Kullanıcı adı ya da şifre hatalı.'
          : 'Giriş yapılamadı; biraz sonra tekrar dene.',
      );
      setBusy(false);
    }
  }

  return (
    <Screen className="items-center justify-center">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
        <TopBar kicker="İşletme" title="Yönetici girişi" />
        <Note>Yönetimi telefondan sürdürmek için giriş yap. Giriş bilgilerini admin verir.</Note>
        <div>
          <label htmlFor="business-username" className="mb-1 block text-sm font-bold">
            Kullanıcı adı
          </label>
          <input
            id="business-username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            className="h-12 w-full rounded-md border border-line bg-surface px-3 text-base"
          />
        </div>
        <div>
          <label htmlFor="business-password" className="mb-1 block text-sm font-bold">
            Şifre
          </label>
          <input
            id="business-password"
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
        <Note className="text-center">Katılımcı mısın? Oda kodu ya da QR ile ana sayfadan gir.</Note>
        <a href="/" className="text-center text-sm underline underline-offset-4">
          Ana sayfaya dön
        </a>
      </form>
    </Screen>
  );
}
