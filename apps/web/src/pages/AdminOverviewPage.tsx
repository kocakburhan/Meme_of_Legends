import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AdminSession } from '@mol/shared';
import {
  getPromptHealth,
  listAdminBusinesses,
  listAdminErrors,
  listAdminSessions,
  listUntaggedMemes,
} from '@/net/admin';
import { Card, Note, TopBar } from '@/components/ui';
import { MODE_LABELS, SESSION_STATUS_LABELS, formatDateTime } from '@/lib/format';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin` — Genel bakış (M5c-1, SPEC 15): aktif oturumlar (işletme, oda,
 * durum → oturum detayı), az platform durumu uyarısı, etiketlenmemiş meme
 * sayısı (→ hızlı etiketleme) ve son hatalar. Grafik yoktur.
 */

/** Kuyruk sayacı: net/admin.ts en fazla 100 kayıt çeker; fazlası "100+" gösterilir. */
const ERROR_LIMIT = 5;
const SESSION_LIMIT = 10;
const NEXT_PATH = '/admin';

type SessionListState =
  | { state: 'loading' }
  | { state: 'ready'; sessions: AdminSession[]; names: Map<string, string> }
  | { state: 'error' };

type HealthState =
  | { state: 'loading' }
  | { state: 'ready'; activeCount: number; lowThreshold: number; low: boolean }
  | { state: 'error' };

type UntaggedState =
  { state: 'loading' } | { state: 'ready'; count: number; more: boolean } | { state: 'error' };

type ErrorListState =
  | { state: 'loading' }
  | {
      state: 'ready';
      errors: { id: string; occurredAt: number; source: string; code: string }[];
    }
  | { state: 'error' };

export default function AdminOverviewPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionListState>({ state: 'loading' });
  const [health, setHealth] = useState<HealthState>({ state: 'loading' });
  const [untagged, setUntagged] = useState<UntaggedState>({ state: 'loading' });
  const [errors, setErrors] = useState<ErrorListState>({ state: 'loading' });

  useEffect(() => {
    let alive = true;
    function fail(error: unknown, onOther: () => void) {
      if (!alive) return;
      if (isAdminAuthError(error)) navigate(adminLoginPath(NEXT_PATH), { replace: true });
      else onOther();
    }
    Promise.all([
      listAdminSessions({ status: 'active', limit: SESSION_LIMIT }),
      listAdminBusinesses(),
    ])
      .then(([sessionList, businessList]) => {
        if (!alive) return;
        setSessions({
          state: 'ready',
          sessions: sessionList.sessions,
          names: new Map(businessList.businesses.map((b) => [b.id, b.name])),
        });
      })
      .catch((error) => fail(error, () => setSessions({ state: 'error' })));
    getPromptHealth()
      .then((d) => {
        if (!alive) return;
        setHealth({
          state: 'ready',
          activeCount: d.activeCount,
          lowThreshold: d.lowThreshold,
          low: d.low,
        });
      })
      .catch((error) => fail(error, () => setHealth({ state: 'error' })));
    listUntaggedMemes()
      .then((d) => {
        if (!alive) return;
        setUntagged({ state: 'ready', count: d.memes.length, more: d.nextCursor !== null });
      })
      .catch((error) => fail(error, () => setUntagged({ state: 'error' })));
    listAdminErrors({ limit: ERROR_LIMIT })
      .then((d) => {
        if (!alive) return;
        setErrors({
          state: 'ready',
          errors: d.errors.map((e) => ({
            id: e.id,
            occurredAt: e.occurredAt,
            source: e.source,
            code: e.code,
          })),
        });
      })
      .catch((error) => fail(error, () => setErrors({ state: 'error' })));
    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <>
      <TopBar kicker="Platform" title="Genel bakış" />

      {/* Az platform durumu uyarısı (SPEC 6.2); eşik sunucu sabitidir. */}
      {health.state === 'loading' ? (
        <Card>
          <Note>Yükleniyor…</Note>
        </Card>
      ) : health.state === 'error' ? (
        <Card>
          <Note>Platform durumu sayısı alınamadı; sayfayı yenile.</Note>
        </Card>
      ) : (
        <div
          role="note"
          aria-label="Platform durumu sayısı"
          className={`rounded-[var(--radius-card)] border bg-surface p-4 text-sm leading-relaxed ${
            health.low ? 'border-accent' : 'border-line'
          }`}
        >
          {health.low
            ? `Platform durumları az: ${health.activeCount} adet (eşik ${health.lowThreshold}).`
            : `Platform durumları: ${health.activeCount} aktif (eşik ${health.lowThreshold}).`}{' '}
          <Link to="/admin/icerik/durumlar" className="underline underline-offset-4">
            Platform durumları
          </Link>
        </div>
      )}

      <section
        aria-label="Aktif oturumlar"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Aktif oturumlar</p>
        {sessions.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : sessions.state === 'error' ? (
          <Note>Aktif oturumlar alınamadı; sayfayı yenile.</Note>
        ) : sessions.sessions.length === 0 ? (
          <Note>Aktif oturum yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.sessions.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/admin/oturumlar/${session.id}`}
                  className="block rounded-md border border-line bg-background px-3 py-2 transition-colors hover:border-accent"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">
                      {sessions.names.get(session.businessId) ?? 'İşletme'} · Oda {session.roomCode}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {SESSION_STATUS_LABELS[session.status]}
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {MODE_LABELS[session.mode]} · {formatDateTime(session.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="Etiketlenmemiş meme"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Etiketlenmemiş meme</p>
        {untagged.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : untagged.state === 'error' ? (
          <Note>Etiketlenmemiş meme sayısı alınamadı; sayfayı yenile.</Note>
        ) : untagged.count === 0 ? (
          <Note>Etiketlenmemiş meme yok.</Note>
        ) : (
          <p className="text-sm">
            Kuyrukta {untagged.more ? '100+' : untagged.count} meme var.{' '}
            <Link to="/admin/icerik/etiketle" className="underline underline-offset-4">
              Hızlı etiketleme
            </Link>
          </p>
        )}
      </section>

      <section
        aria-label="Son hatalar"
        className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Son hatalar</p>
        {errors.state === 'loading' ? (
          <Note>Yükleniyor…</Note>
        ) : errors.state === 'error' ? (
          <Note>Hata kayıtları alınamadı; sayfayı yenile.</Note>
        ) : errors.errors.length === 0 ? (
          <Note>Kayıtlı hata yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {errors.errors.map((error) => (
              <li
                key={error.id}
                className="rounded-md border border-line bg-background px-3 py-2 text-sm"
              >
                <span className="block font-bold">{error.code}</span>
                <span className="text-xs text-muted">
                  {formatDateTime(error.occurredAt)} · {error.source}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/admin/sistem" className="text-sm underline underline-offset-4">
          Tümü: Sistem
        </Link>
      </section>
    </>
  );
}
