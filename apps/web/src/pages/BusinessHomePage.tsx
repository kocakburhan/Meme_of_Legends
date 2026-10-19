import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import {
  HttpError,
  createBusinessSession,
  getBusinessMe,
  logoutBusiness,
  type BusinessAccount,
} from '@/net/http';
import { Card, GhostButton, Note, PrimaryButton, Screen, TopBar } from '@/components/ui';
import { Badge, Segmented } from '@/console/bits';
import { rememberSession } from '@/console/session';
import { validateRoomCode, normalizeRoomCode } from '@/lib/contracts';
import { MODE_LABELS } from '@/lib/format';

/**
 * `/isletme` — işletme panelinin yer tutucusu (M4c'te gerçek sayfalar).
 * Şimdilik: işletme özeti, hızlı lobi açma (konsolun yönettiği oturum) ve
 * aktif oturum koduyla konsola gitme kutusu.
 */
export default function BusinessHomePage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<BusinessAccount | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'ready' | 'unauth'>('loading');
  const [mode, setMode] = useState<'elimination' | 'league' | 'hybrid'>('hybrid');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getBusinessMe()
      .then((d) => {
        if (!alive) return;
        setAccount(d.business);
        setAuthState('ready');
      })
      .catch((error) => {
        if (!alive) return;
        setAuthState(error instanceof HttpError && error.status === 401 ? 'unauth' : 'ready');
        if (!(error instanceof HttpError && error.status === 401))
          setError('Hesap bilgisi alınamadı; sayfayı yenile.');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (authState === 'unauth')
    return <Navigate to={`/isletme/giris?next=${encodeURIComponent('/isletme')}`} replace />;

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const res = await createBusinessSession({ mode });
      rememberSession(res.id, res.roomCode);
      navigate(`/isletme/oyun/${res.roomCode}`);
    } catch (err) {
      setBusy(false);
      if (err instanceof HttpError && err.code === 'CONCURRENT_SESSION_LIMIT')
        setError('Zaten açık bir oturumun var; kodunu girip konsola dön.');
      else if (err instanceof HttpError && err.code === 'INSUFFICIENT_CREDITS')
        setError('Lobi açmak için hak gerekmiyor ama hesapta hak görünmüyor; sayfayı yenile.');
      else setError('Lobi açılamadı; biraz sonra tekrar dene.');
    }
  }

  function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateRoomCode(code);
    if (error) {
      setCodeError(error);
      return;
    }
    setCodeError(null);
    navigate(`/isletme/oyun/${normalizeRoomCode(code)}`);
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
    <Screen>
      <TopBar kicker="İşletme paneli" title={account ? account.name : 'Yükleniyor…'} />
      {account ? (
        <Card className="flex items-center justify-between">
          <span>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Oyun hakkı</p>
            <p className="font-display text-2xl uppercase">
              {account.unlimitedCredits ? 'Sınırsız' : account.credits}
            </p>
          </span>
          <Badge>{MODE_LABELS[mode]} varsayılan</Badge>
        </Card>
      ) : (
        <Card>
          <Note>{error ?? 'Hesap bilgisi yükleniyor…'}</Note>
        </Card>
      )}

      <Card>
        <Note>
          Panel sayfaları (Durumlarım, Geçmiş, Hesap) M4c'te gelecek. Oyun yönetimi için aşağıdaki
          kutular hazır.
        </Note>
      </Card>

      <section aria-label="Yeni oyun" className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Yeni oyun aç</p>
        <Segmented
          ariaLabel="Yeni oyunun modu"
          value={mode}
          disabled={busy}
          onChange={(next) => setMode(next as 'elimination' | 'league' | 'hybrid')}
          options={[
            { value: 'elimination', label: 'Eleme' },
            { value: 'league', label: 'Lig' },
            { value: 'hybrid', label: 'Hibrit' },
          ]}
        />
        <PrimaryButton onClick={() => void handleCreate()} disabled={busy}>
          {busy ? 'Lobi açılıyor…' : 'Lobiyi oluştur'}
        </PrimaryButton>
        {error && account ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </section>

      <form
        onSubmit={handleCodeSubmit}
        aria-label="Aktif oturuma dön"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
        noValidate
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Aktif oturuma dön</p>
        <div>
          <label htmlFor="console-code" className="mb-1 block text-sm font-bold">
            Oda kodu
          </label>
          <input
            id="console-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="KA7FT2"
            className="h-14 w-full rounded-md border border-line bg-background px-3 text-center font-display text-3xl tracking-widest placeholder:text-muted"
          />
          {codeError ? (
            <p role="alert" className="mt-1 text-sm text-danger">
              {codeError}
            </p>
          ) : null}
        </div>
        <GhostButton type="submit" className="w-full">
          Konsola git
        </GhostButton>
      </form>

      <div className="mt-auto flex flex-col gap-2">
        <GhostButton onClick={() => void handleLogout()}>Çıkış yap</GhostButton>
      </div>
    </Screen>
  );
}
