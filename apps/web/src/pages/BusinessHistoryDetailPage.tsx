import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import type { SessionReport, SessionSummary } from '@mol/shared';
import { HttpError, getBusinessSession } from '@/net/http';
import { Note, TopBar } from '@/components/ui';
import { PanelLayout } from '@/panel/PanelLayout';
import { SessionStatusBadge } from '@/panel/SessionStatusBadge';
import { useBusinessAccount } from '@/panel/useBusinessAccount';
import {
  formatDateTime,
  formatDuration,
  formatEndReason,
  formatScore,
  MODE_LABELS,
} from '@/lib/format';

/**
 * `/isletme/gecmis/:id` (SPEC 14.4, M4c-3): bitmiş oturumun detayı — mod,
 * tarih, süre, oyuncu/seyirci sayısı, şampiyon, sıralama, jüri ödülleri,
 * gizlenen içerik sayısı ve bitiş nedeni (Türkçe). Rapor yalnız oyunda
 * biten/sonlandırılan oturumlarda var; oyun oynanmadan kapanan lobide yoktur.
 */

const NEXT_PATH = '/isletme/gecmis';

type DetailState =
  | { state: 'loading' }
  | { state: 'ready'; session: SessionSummary; report: SessionReport | null }
  | { state: 'notFound' }
  | { state: 'error' };

/** Özet kartındaki "etiket — değer" satırı. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs font-bold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-bold">{value}</dd>
    </div>
  );
}

const CARD_CLASS =
  'flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4';

export default function BusinessHistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { status } = useBusinessAccount();
  const [detail, setDetail] = useState<DetailState>({ state: 'loading' });

  useEffect(() => {
    let alive = true;
    if (!id) return;
    getBusinessSession(id)
      .then((data) => {
        if (alive) setDetail({ state: 'ready', ...data });
      })
      .catch((error) => {
        if (!alive) return;
        setDetail(
          error instanceof HttpError && error.status === 404
            ? { state: 'notFound' }
            : { state: 'error' },
        );
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (status === 'unauth')
    return (
      <Navigate
        to={`/isletme/giris?next=${encodeURIComponent(`${NEXT_PATH}/${id ?? ''}`)}`}
        replace
      />
    );

  const report = detail.state === 'ready' ? detail.report : null;
  const session = detail.state === 'ready' ? detail.session : null;
  const state = !id ? ({ state: 'notFound' } as const) : detail.state;

  return (
    <PanelLayout>
      <TopBar kicker="İşletme paneli" title="Geçmiş" />
      <Link to={NEXT_PATH} className="-mt-2 text-sm underline underline-offset-4">
        ← Geçmişe dön
      </Link>

      {state === 'loading' ? (
        <section aria-label="Oyun detayı" className={CARD_CLASS}>
          <Note>Yükleniyor…</Note>
        </section>
      ) : state === 'notFound' ? (
        <section aria-label="Oyun detayı" className={CARD_CLASS}>
          <Note>Bu oyun bulunamadı; listeden tekrar seç.</Note>
        </section>
      ) : state === 'error' ? (
        <section aria-label="Oyun detayı" className={CARD_CLASS}>
          <Note>Oyun bilgisi alınamadı; sayfayı yenile.</Note>
        </section>
      ) : session ? (
        <>
          <section
            aria-label="Oyun özeti"
            className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-xl uppercase">Oda {session.roomCode}</p>
              <SessionStatusBadge status={session.status} />
            </div>
            <dl className="flex flex-col gap-2">
              <Field label="Mod" value={MODE_LABELS[session.mode]} />
              <Field label="Tarih" value={formatDateTime(session.createdAt)} />
              <Field
                label="Süre"
                value={formatDuration(session.startedAt, session.endedAt) ?? '—'}
              />
              <Field
                label="Katılımcılar"
                value={
                  session.playerCount === null
                    ? '—'
                    : `${session.playerCount} oyuncu · ${session.spectatorCount ?? 0} seyirci`
                }
              />
              <Field label="Şampiyon" value={session.champion ?? '—'} />
              <Field label="Bitiş nedeni" value={formatEndReason(session.endReason)} />
            </dl>
          </section>

          {report ? (
            <>
              <section aria-label="Sıralama" className={CARD_CLASS}>
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Sıralama</p>
                <ol className="flex flex-col gap-1">
                  {report.standings.map((row) => (
                    <li
                      key={row.rank}
                      className="flex items-center justify-between gap-2 rounded-md border border-line bg-background px-3 py-2 text-sm"
                    >
                      <span className="font-display tabular-nums">{row.rank}</span>
                      <span className="min-w-0 flex-1 truncate font-bold">{row.nickname}</span>
                      <span className="font-display tabular-nums">{formatScore(row.score)}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section aria-label="Jüri ödülleri" className={CARD_CLASS}>
                <p className="text-xs font-bold uppercase tracking-wider text-muted">
                  Jüri ödülleri
                </p>
                {report.juryAwards.length === 0 ? (
                  <Note>Bu oyunda jüri ödülü verilmedi.</Note>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {report.juryAwards.map((award, index) => (
                      <li
                        key={`${award.title}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-line bg-background px-3 py-2 text-sm"
                      >
                        <span className="font-bold">{award.title}</span>
                        <span className="min-w-0 truncate text-muted">{award.nickname}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="İçerik durumu" className={CARD_CLASS}>
                <dl>
                  <Field label="Gizlenen gönderi" value={String(report.hiddenContentCount)} />
                </dl>
              </section>
            </>
          ) : (
            <section aria-label="Rapor yok" className={CARD_CLASS}>
              <Note>Bu oturum oyun oynanmadan kapandı; rapor yok.</Note>
            </section>
          )}
        </>
      ) : null}
    </PanelLayout>
  );
}
