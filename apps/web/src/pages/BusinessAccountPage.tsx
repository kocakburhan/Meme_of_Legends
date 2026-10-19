import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { HttpError, changeBusinessPassword, logoutBusiness } from '@/net/http';
import { Card, GhostButton, Note, PrimaryButton, TopBar } from '@/components/ui';
import { PanelLayout } from '@/panel/PanelLayout';
import { dismissPasswordHint } from '@/panel/passwordHint';
import { useBusinessAccount } from '@/panel/useBusinessAccount';

/**
 * `/isletme/hesap` (SPEC 14.4, M4c-1): şifre değiştirme (mevcut + yeni ×2,
 * en az 12 karakter) ve çıkış. Başarıda bu cihaz açık kalır; diğer cihazlardaki
 * girişler kapanır (SPEC 3.1).
 */
export default function BusinessAccountPage() {
  const navigate = useNavigate();
  const { account, status } = useBusinessAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  if (status === 'unauth')
    return <Navigate to={`/isletme/giris?next=${encodeURIComponent('/isletme/hesap')}`} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const currentPassword = String(input.get('currentPassword') ?? '');
    const newPassword = String(input.get('newPassword') ?? '');
    const confirm = String(input.get('confirm') ?? '');
    if (!currentPassword || !newPassword || !confirm) {
      setError('Tüm alanları doldur.');
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError('Yeni şifre en az 12, en fazla 128 karakter olmalı.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Yeni şifreler birbiriyle uyuşmuyor.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changeBusinessPassword({ currentPassword, newPassword });
      dismissPasswordHint();
      setChanged(true);
    } catch (err) {
      setBusy(false);
      // Hatalı mevcut şifre de 401 döner; önce kod ayrımı, oturum düşmesi sonra.
      if (err instanceof HttpError && err.code === 'INVALID_CREDENTIALS')
        setError('Mevcut şifren hatalı.');
      else if (err instanceof HttpError && err.status === 401) {
        navigate(`/isletme/giris?next=${encodeURIComponent('/isletme/hesap')}`, { replace: true });
        return;
      } else setError('Şifre değiştirilemedi; biraz sonra tekrar dene.');
    }
  }

  async function handleLogout() {
    try {
      await logoutBusiness();
    } catch {
      /* Çerez zaten temizlenmiş olabilir. */
    }
    navigate('/isletme/giris', { replace: true });
  }

  return (
    <PanelLayout>
      <TopBar kicker="İşletme paneli" title="Hesap" />

      {account ? (
        <Card>
          <p className="text-sm font-bold">{account.name}</p>
          <Note>@{account.username}</Note>
        </Card>
      ) : null}

      {changed ? (
        <Card className="border-accent">
          <p className="text-sm font-bold text-success">Şifren değişti.</p>
          <Note>Diğer cihazlardaki girişler kapatıldı; bu cihaz açık kaldı.</Note>
        </Card>
      ) : (
        <form
          onSubmit={handleSubmit}
          aria-label="Şifre değiştir"
          className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
          noValidate
        >
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Şifre değiştir</p>
          <div>
            <label htmlFor="account-current" className="mb-1 block text-sm font-bold">
              Mevcut şifre
            </label>
            <input
              id="account-current"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
            />
          </div>
          <div>
            <label htmlFor="account-new" className="mb-1 block text-sm font-bold">
              Yeni şifre
            </label>
            <input
              id="account-new"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
            />
            <p className="mt-1 text-xs text-muted">En az 12 karakter.</p>
          </div>
          <div>
            <label htmlFor="account-confirm" className="mb-1 block text-sm font-bold">
              Yeni şifre (tekrar)
            </label>
            <input
              id="account-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              className="h-12 w-full rounded-md border border-line bg-background px-3 text-base"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
          </PrimaryButton>
        </form>
      )}

      <GhostButton onClick={() => void handleLogout()}>Çıkış yap</GhostButton>
    </PanelLayout>
  );
}
