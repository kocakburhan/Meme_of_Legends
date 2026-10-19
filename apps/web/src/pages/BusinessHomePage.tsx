import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import type { SessionSummary } from '@mol/shared';
import {
  HttpError,
  createBusinessSession,
  listBusinessSessions,
  type BusinessSessionList,
} from '@/net/http';
import { Card, GhostButton, Note, PrimaryButton, TopBar } from '@/components/ui';
import { PanelLayout } from '@/panel/PanelLayout';
import { passwordHintDismissed, dismissPasswordHint } from '@/panel/passwordHint';
import { useBusinessAccount } from '@/panel/useBusinessAccount';
import { formatDateTime, MODE_LABELS } from '@/lib/format';

/**
 * `/isletme` (SPEC 14.4, M4c-1): işletme adı, kalan hak, ayarsız lobi açan
 * "Yeni oyun", aktif oturumlarda "Oyuna dön" ve son oyunların kısa listesi.
 */

const ACTIVE_STATUS_LABELS: Record<'lobby' | 'running' | 'paused', string> = {
  lobby: 'Lobi',
  running: 'Oyun',
  paused: 'Duraklatıldı',
};
const PAST_STATUS_LABELS: Record<'finished' | 'cancelled' | 'terminated', string> = {
  finished: 'Bitti',
  cancelled: 'İptal edildi',
  terminated: 'Sonlandırıldı',
};

function sessionStatusLabel(session: SessionSummary): string {
  return session.status === 'lobby' || session.status === 'running' || session.status === 'paused'
    ? ACTIVE_STATUS_LABELS[session.status]
    : PAST_STATUS_LABELS[session.status];
}

type ListState =
  | { state: 'loading' }
  | { state: 'ready'; data: BusinessSessionList }
  | { state: 'error' };

export default function BusinessHomePage() {
  const navigate = useNavigate();
  const { account, status } = useBusinessAccount();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [active, setActive] = useState<ListState>({ state: 'loading' });
  const [past, setPast] = useState<ListState>({ state: 'loading' });
  const [hintOpen, setHintOpen] = useState(() => !passwordHintDismissed());

  useEffect(() => {
    let alive = true;
    listBusinessSessions('active')
      .then((data) => alive && setActive({ state: 'ready', data }))
      .catch(() => alive && setActive({ state: 'error' }));
    listBusinessSessions('past', { limit: 5 })
      .then((data) => alive && setPast({ state: 'ready', data }))
      .catch(() => alive && setPast({ state: 'error' }));
    return () => {
      alive = false;
    };
  }, []);

  if (status === 'unauth')
    return <Navigate to={`/isletme/giris?next=${encodeURIComponent('/isletme')}`} replace />;

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      // Ayarsız lobi: sunucu varsayılan ayarlarla açar (SPEC 4.3).
      const session = await createBusinessSession();
      navigate(`/isletme/oyun/${session.roomCode}`);
    } catch (err) {
      setCreating(false);
      if (err instanceof HttpError && err.status === 401) {
        navigate(`/isletme/giris?next=${encodeURIComponent('/isletme')}`, { replace: true });
        return;
      }
      if (err instanceof HttpError && err.code === 'CONCURRENT_SESSION_LIMIT')
        setCreateError('Eşzamanlı oturum sınırın dolu; açık oturumu bitir ya da aşağıdan Oyuna dön.');
      else if (err instanceof HttpError && err.code === 'INSUFFICIENT_CREDITS')
        setCreateError('Oyun hakkın kalmadı; lobi açmak için admin’den hak isteyebilirsin.');
      else setCreateError('Lobi açılamadı; biraz sonra tekrar dene.');
    }
  }

  function handleDismissHint() {
    dismissPasswordHint();
    setHintOpen(false);
  }

  return (
    <PanelLayout>
      <TopBar kicker="İşletme paneli" title={account ? account.name : 'Yükleniyor…'} />

      {status === 'ready' && hintOpen ? (
        <div
          role="note"
          aria-label="Şifre önerisi"
          className="flex items-start justify-between gap-3 rounded-[var(--radius-card)] border border-accent bg-surface p-4"
        >
          <p className="text-sm leading-relaxed">Güvenlik için şifreni değiştirmen önerilir.</p>
          <div className="flex shrink-0 gap-2">
            <a
              href="/isletme/hesap"
              className="flex min-h-11 items-center rounded-md border border-accent px-3 text-sm font-bold text-accent"
            >
              Şifre değiştir
            </a>
            <button
              type="button"
              onClick={handleDismissHint}
              className="flex min-h-11 items-center px-2 text-sm underline underline-offset-4"
            >
              Kapat
            </button>
          </div>
        </div>
      ) : null}

      {account ? (
        <Card className="flex items-center justify-between">
          <span>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Oyun hakkı</p>
            <p className="font-display text-2xl uppercase">
              {account.unlimitedCredits ? 'Sınırsız' : account.credits}
            </p>
          </span>
          {account.unlimitedCredits ? null : (
            <span className="text-xs text-muted">başlatınca 1 düşer</span>
          )}
        </Card>
      ) : status === 'error' ? (
        <Card>
          <Note>Hesap bilgisi alınamadı; sayfayı yenile.</Note>
        </Card>
      ) : null}

      <section
        aria-label="Yeni oyun"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Yeni oyun</p>
        <Note>Lobi varsayılan ayarlarla açılır; lobide her şeyi değiştirebilirsin.</Note>
        <PrimaryButton onClick={() => void handleCreate()} disabled={creating}>
          {creating ? 'Lobi açılıyor…' : 'Yeni oyun'}
        </PrimaryButton>
        {createError ? (
          <p role="alert" className="text-sm text-danger">
            {createError}
          </p>
        ) : null}
      </section>

      <section
        aria-label="Aktif oturumlar"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Aktif oturumlar</p>
        {active.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : active.state === 'error' ? (
          <Note>Aktif oturumlar alınamadı; sayfayı yenile.</Note>
        ) : active.data.sessions.length === 0 ? (
          <Note>Açık oturum yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.data.sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-background px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">Oda {session.roomCode}</span>
                  <span className="text-xs text-muted">
                    {MODE_LABELS[session.mode]} · {sessionStatusLabel(session)}
                  </span>
                </span>
                <GhostButton
                  onClick={() => navigate(`/isletme/oyun/${session.roomCode}`)}
                  className="min-h-11 w-28 px-2 text-sm"
                >
                  Oyuna dön
                </GhostButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="Son oyunlar"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Son oyunlar</p>
        {past.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : past.state === 'error' ? (
          <Note>Son oyunlar alınamadı; sayfayı yenile.</Note>
        ) : past.data.sessions.length === 0 ? (
          <Note>Henüz bitmiş oyun yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {past.data.sessions.map((session) => (
              <li key={session.id} className="rounded-md border border-line bg-background px-3 py-2">
                <span className="block truncate text-sm font-bold">
                  {formatDateTime(session.createdAt)} · {MODE_LABELS[session.mode]}
                </span>
                <span className="text-xs text-muted">
                  {sessionStatusLabel(session)}
                  {session.champion ? ` · Şampiyon: ${session.champion}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <a href="/isletme/gecmis" className="text-sm underline underline-offset-4">
          Tümü: Geçmiş
        </a>
      </section>
    </PanelLayout>
  );
}
