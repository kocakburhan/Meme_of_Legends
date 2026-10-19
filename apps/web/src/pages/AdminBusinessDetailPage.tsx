import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { AdminBusiness, AdminSession, AdminUsage } from '@mol/shared';
import {
  getAdminBusiness,
  impersonateAdminBusiness,
  listAdminSessions,
  resetAdminBusinessPassword,
  updateAdminBusiness,
} from '@/net/admin';
import { HttpError } from '@/net/http';
import { Badge, ConfirmButton, Stepper, ToggleRow } from '@/console/bits';
import { Card, GhostButton, Note, TopBar } from '@/components/ui';
import { SessionStatusBadge } from '@/panel/SessionStatusBadge';
import { formatDateTime } from '@/lib/format';
import { CopyButton } from '@/admin/CopyButton';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin/isletmeler/:id` (M5c-1, SPEC 15.1, 3.3–3.4): kullanım özeti; hak
 * ekle/çıkar, sınırsız hak, eşzamanlı oturum sınırı, lobi ömrü; aktif/pasif,
 * şifre sıfırla (onaylı), adına giriş (yeni sekmede işletme paneli);
 * işletmenin oturumları ve durumları.
 */

const NEXT_PATH = '/admin/isletmeler';
const SESSION_LIMIT = 20;

type DetailState =
  | { state: 'loading' }
  | { state: 'ready'; business: AdminBusiness; usage: AdminUsage | undefined }
  | { state: 'notfound' }
  | { state: 'error' };

type SessionListState =
  { state: 'loading' } | { state: 'ready'; sessions: AdminSession[] } | { state: 'error' };

export default function AdminBusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<DetailState>({ state: 'loading' });
  const [sessions, setSessions] = useState<SessionListState>({ state: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState('1');
  const [reset, setReset] = useState<{ password: string } | null>(null);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  /** Oturum düşmüşse girişe yönlendirir; diğer hatalar sayfa notuna kalır. */
  const fail = useCallback(
    (error: unknown, onOther: () => void) => {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath(NEXT_PATH), { replace: true });
        return;
      }
      onOther();
    },
    [navigate],
  );

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getAdminBusiness(id)
      .then((d) => {
        if (alive) setState({ state: 'ready', business: d.business, usage: d.usage });
      })
      .catch((error) => {
        if (!alive) return;
        if (error instanceof HttpError && error.status === 404) setState({ state: 'notfound' });
        else fail(error, () => setState({ state: 'error' }));
      });
    listAdminSessions({ businessId: id, status: 'all', limit: SESSION_LIMIT })
      .then((d) => {
        if (alive) setSessions({ state: 'ready', sessions: d.sessions });
      })
      .catch((error) => {
        if (!alive) return;
        fail(error, () => setSessions({ state: 'error' }));
      });
    return () => {
      alive = false;
    };
  }, [id, fail]);

  const business = state.state === 'ready' ? state.business : null;

  function applyBusiness(business: AdminBusiness) {
    setState((s) => (s.state === 'ready' ? { ...s, business } : s));
  }

  /** PATCH gönderir; başarısızsa Türkçe hata notu bırakır. */
  async function patchBusiness(patch: Parameters<typeof updateAdminBusiness>[1]): Promise<boolean> {
    if (!id) return false;
    setBusy(true);
    setActionError(null);
    try {
      const data = await updateAdminBusiness(id, patch);
      applyBusiness(data.business);
      return true;
    } catch (error) {
      fail(error, () =>
        setActionError(
          error instanceof HttpError && error.code === 'INSUFFICIENT_CREDITS'
            ? 'Bakiye negatif olamaz; çıkarılacak hak kalmadı.'
            : 'İşlem uygulanamadı; biraz sonra tekrar dene.',
        ),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function parseDelta(): number | null {
    const n = Math.trunc(Number(delta));
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  async function handleCredits(sign: 1 | -1) {
    const amount = parseDelta();
    if (!amount) {
      setActionError('Hak miktarı pozitif bir tam sayı olmalı.');
      return;
    }
    const ok = await patchBusiness({ creditsDelta: sign * amount });
    if (ok) setDelta('1');
  }

  async function handleResetPassword() {
    if (!id) return;
    setBusy(true);
    setActionError(null);
    setReset(null);
    try {
      const data = await resetAdminBusinessPassword(id);
      setReset({ password: data.temporaryPassword });
    } catch (error) {
      fail(error, () => setActionError('Şifre sıfırlanamadı; biraz sonra tekrar dene.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleImpersonate() {
    if (!id) return;
    setImpersonating(true);
    setImpersonateError(null);
    try {
      const data = await impersonateAdminBusiness(id);
      // Sunucu mutlak adres döner (proxy kökeni); panele göreli yolu yeni
      // sekmede açarız — panel her kökende bu uygulama tarafından sunulur.
      let path = data.loginUrl;
      try {
        path = new URL(data.loginUrl).pathname;
      } catch {
        /* Göreli adres: olduğu gibi kullanılır. */
      }
      window.open(path, '_blank', 'noopener');
    } catch (error) {
      fail(error, () =>
        setImpersonateError(
          error instanceof HttpError && error.code === 'BUSINESS_INACTIVE'
            ? 'İşletme pasif; önce aktifleştirin.'
            : 'Adına giriş açılamadı; biraz sonra tekrar dene.',
        ),
      );
    } finally {
      setImpersonating(false);
    }
  }

  if (state.state === 'loading')
    return (
      <div className="flex flex-1 items-center justify-center">
        <p role="status" className="text-sm text-muted">
          Yükleniyor…
        </p>
      </div>
    );
  if (state.state === 'notfound') return <Navigate to="/admin/isletmeler" replace />;
  if (state.state === 'error' || !business)
    return (
      <>
        <TopBar kicker="İşletme" title="Yüklenemedi" />
        <Card>
          <Note>İşletme bilgisi alınamadı; sayfayı yenile.</Note>
        </Card>
        <Link to={NEXT_PATH} className="text-sm underline underline-offset-4">
          ← İşletmeler
        </Link>
      </>
    );

  const usage = state.usage;

  return (
    <>
      <Link to={NEXT_PATH} className="text-sm underline underline-offset-4">
        ← İşletmeler
      </Link>
      <TopBar
        kicker="İşletme"
        title={business.name}
        right={
          <Badge tone={business.active ? 'success' : 'danger'}>
            {business.active ? 'Aktif' : 'Pasif'}
          </Badge>
        }
      />
      {actionError ? (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      <section
        aria-label="Kullanım özeti"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Kullanım özeti</p>
        <p className="font-display text-2xl uppercase">
          Oyun hakkı: {business.unlimitedCredits ? 'Sınırsız' : business.credits}
        </p>
        {usage ? (
          <ul className="flex flex-col gap-1 text-sm">
            <li>Toplam oturum: {usage.sessionCount}</li>
            <li>Aktif oturum: {usage.activeSessionCount}</li>
            <li>Harcanan hak: {usage.consumedCredits}</li>
            <li>İade edilen hak: {usage.refundedCredits}</li>
            <li>Son oyun: {usage.lastGameAt === null ? '—' : formatDateTime(usage.lastGameAt)}</li>
          </ul>
        ) : (
          <Note>Kullanım özeti alınamadı.</Note>
        )}
        <p className="text-xs text-muted">
          {business.username} · Açıldı: {formatDateTime(business.createdAt)}
        </p>
      </section>

      <section
        aria-label="Oyun hakları"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Oyun hakları</p>
        <div>
          <label htmlFor="credit-delta" className="mb-1 block text-sm font-bold">
            Hak miktarı
          </label>
          <input
            id="credit-delta"
            type="number"
            inputMode="numeric"
            min={1}
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            disabled={busy || business.unlimitedCredits}
            className="h-12 w-full rounded-md border border-line bg-background px-3 text-base disabled:opacity-50"
          />
        </div>
        <div className="flex gap-2">
          <GhostButton
            onClick={() => void handleCredits(1)}
            disabled={busy || business.unlimitedCredits}
            className="min-h-11 flex-1 px-3 text-sm"
          >
            Hak ekle
          </GhostButton>
          <GhostButton
            onClick={() => void handleCredits(-1)}
            disabled={busy || business.unlimitedCredits}
            className="min-h-11 flex-1 px-3 text-sm"
          >
            Hak çıkar
          </GhostButton>
        </div>
        <ToggleRow
          label="Sınırsız hak"
          description="Açıkken oyun başlatmaları hak düşmez; hak ekle/çıkar kapanır."
          checked={business.unlimitedCredits}
          onChange={(next) => void patchBusiness({ unlimitedCredits: next })}
          disabled={busy}
        />
      </section>

      <section
        aria-label="İmtiyazlar"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">İmtiyazlar</p>
        <Stepper
          label="Eşzamanlı oturum sınırı"
          value={business.concurrentSessionLimit}
          min={1}
          max={100}
          suffix="oturum"
          onCommit={(next) => void patchBusiness({ concurrentSessionLimit: next })}
          disabled={busy}
        />
        <Stepper
          label="Lobi ömrü"
          value={business.lobbyLifetimeHours}
          min={1}
          max={8760}
          suffix="saat"
          onCommit={(next) => void patchBusiness({ lobbyLifetimeHours: next })}
          disabled={busy}
        />
      </section>

      <section
        aria-label="Hesap işlemleri"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Hesap işlemleri</p>
        {business.active ? (
          <ConfirmButton
            label="Pasife al"
            note="Yöneticinin tüm girişleri kapanır, açık lobisi iptal edilir; süren oyun devam eder."
            confirmLabel="Evet, pasife al"
            onConfirm={() => void patchBusiness({ active: false })}
            disabled={busy}
          />
        ) : (
          <GhostButton onClick={() => void patchBusiness({ active: true })} disabled={busy}>
            Aktifleştir
          </GhostButton>
        )}
        <ConfirmButton
          label="Şifre sıfırla"
          note="Yöneticinin tüm girişleri kapanır; yeni bir geçici şifre verilir."
          confirmLabel="Evet, şifreyi sıfırla"
          onConfirm={() => void handleResetPassword()}
          disabled={busy}
        />
        {reset ? (
          <div
            role="note"
            aria-label="Yeni geçici şifre"
            className="flex flex-col gap-2 rounded-md border border-accent bg-background p-3"
          >
            <p className="text-xs font-bold uppercase tracking-wider text-muted">
              Yeni geçici şifre
            </p>
            <p data-testid="temporary-password" className="font-display text-lg break-all">
              {reset.password}
            </p>
            <CopyButton
              text={reset.password}
              label="Şifreyi kopyala"
              className="min-h-11 text-sm"
            />
            <Note>Bu şifreyi işletmeyle paylaşın; yönetici ilk girişte değiştirmesi önerilir.</Note>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <GhostButton onClick={() => void handleImpersonate()} disabled={impersonating}>
            {impersonating ? 'Açılıyor…' : 'Adına giriş'}
          </GhostButton>
          <Note>İşletmenin paneli yeni sekmede açılır; bu oturum kayda geçer.</Note>
          {impersonateError ? (
            <p role="alert" className="text-sm text-danger">
              {impersonateError}
            </p>
          ) : null}
        </div>
      </section>

      <section
        aria-label="İşletmenin oturumları"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          İşletmenin oturumları
        </p>
        {sessions.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : sessions.state === 'error' ? (
          <Note>Oturumlar alınamadı; sayfayı yenile.</Note>
        ) : sessions.sessions.length === 0 ? (
          <Note>Bu işletmenin oturumu yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.sessions.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/admin/oturumlar/${session.id}`}
                  className="block rounded-md border border-line bg-background px-3 py-2 transition-colors hover:border-accent"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">Oda {session.roomCode}</span>
                    <SessionStatusBadge status={session.status} />
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(session.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="İşletmenin durumları"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          İşletmenin durumları
        </p>
        <Note>Engelleme / engeli kaldırma işletme durumu denetiminde yapılır.</Note>
        <Link
          to={`/admin/icerik/isletme-durumlari?businessId=${encodeURIComponent(business.id)}`}
          className="text-sm underline underline-offset-4"
        >
          Durumlarını denetle
        </Link>
      </section>
    </>
  );
}
