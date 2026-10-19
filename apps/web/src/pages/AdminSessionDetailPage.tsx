import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { AdminReport, AdminSession } from '@mol/shared';
import {
  getAdminSession,
  refundAdminSession,
  terminateAdminSession,
  type AdminSessionDetail,
} from '@/net/admin';
import { HttpError } from '@/net/http';
import { Badge, ConfirmButton } from '@/console/bits';
import { Note, TopBar } from '@/components/ui';
import { SessionStatusBadge } from '@/panel/SessionStatusBadge';
import {
  MODE_LABELS,
  formatDateTime,
  formatDuration,
  formatEndReason,
  formatScore,
} from '@/lib/format';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';
import { ADMIN_ACTION_LABELS, AUDIT_LABELS } from '@/admin/labels';

/**
 * `/admin/oturumlar/:id` (M5c-3, SPEC 15.2 ve 15.4): oturumun zaman damgaları,
 * durumu, modu ve ayarları; rapor JSON'u okunur bölümlere ayrılır (katılımcılar,
 * turlar, sonuç/sıralama, gizlemeler, çıkarmalar, duraklatmalar, hatalar).
 * Aktif oturum sonlandırılabilir; gerçekten harcanmış hak bir kez iade edilir.
 */

const NEXT_PATH = '/admin/oturumlar';
const ACTIVE_STATUSES = new Set<AdminSession['status']>(['lobby', 'running', 'paused']);

const PARTICIPANT_ROLE_LABELS: Record<string, string> = {
  player: 'Oyuncu',
  voter: 'Seyirci',
};
const PARTICIPANT_STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  active: 'Aktif',
  left: 'Ayrıldı',
  kicked: 'Çıkarıldı',
};
const ROUND_KIND_LABELS: Record<string, string> = {
  regular: 'Normal',
  overtime: 'Uzatma',
};
const ROUND_CONTEXT_LABELS: Record<string, string> = {
  elimination: 'Eleme',
  league: 'Lig',
  semifinal: 'Yarı final',
  final: 'Final',
};
const RESULT_REASON_LABELS: Record<string, string> = {
  completed: 'Oyun tamamlandı',
  manager: 'Yönetici bitirdi',
  empty: 'Oda boşaldı',
  noPrompts: 'Durum havuzu boşaldı',
  players: 'Yeterli oyuncu kalmadı',
};
const CUSTOM_TYPE_LABELS: Record<string, string> = {
  image: 'Resim',
  gif: 'GIF',
  youtube: 'YouTube',
};

type DetailState =
  | { state: 'loading' }
  | { state: 'ready'; data: AdminSessionDetail }
  | { state: 'notfound' }
  | { state: 'error' };

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs font-bold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-bold">{value}</dd>
    </div>
  );
}

function SettingField({
  label,
  settings,
  name,
  kind,
}: {
  label: string;
  settings: Record<string, unknown>;
  name: string;
  kind: 'number' | 'flag';
}) {
  const value = settings[name];
  const text =
    kind === 'flag'
      ? value === true
        ? 'Açık'
        : value === false
          ? 'Kapalı'
          : '—'
      : typeof value === 'number'
        ? String(value)
        : '—';
  return <Field label={label} value={text} />;
}

/** Denetim/müdahale ayrıntısını kısa "anahtar: değer" satırlarına çevirir. */
function Details({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  return (
    <dl className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
      {entries.map(([key, entry]) => (
        <div key={key} className="flex gap-2">
          <dt className="shrink-0 font-bold">{key}:</dt>
          <dd className="min-w-0 break-words">
            {typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
              ? String(entry)
              : JSON.stringify(entry)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function nameOf(names: Map<string, string>, id: string): string {
  return names.get(id) ?? 'Katılımcı';
}

function ReportRounds({
  report,
  names,
}: {
  report: AdminReport;
  names: Map<string, string>;
}) {
  if (report.rounds.length === 0) return <Note>Oynanmış tur yok.</Note>;
  return (
    <ul className="flex flex-col gap-3">
      {report.rounds.map((round) => {
        const scores = Object.entries(round.scores).sort(
          (left, right) => right[1].average - left[1].average,
        );
        return (
          <li
            key={round.no}
            className="flex flex-col gap-2 rounded-md border border-line bg-background p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold">
                Tur {round.no} · {ROUND_KIND_LABELS[round.kind] ?? round.kind}
              </p>
              <span className="flex flex-wrap gap-1">
                <Badge tone="line">{ROUND_CONTEXT_LABELS[round.context] ?? round.context}</Badge>
                <Badge tone={round.locked ? 'success' : 'accent'}>
                  {round.locked ? 'Kilitli' : 'Açık'}
                </Badge>
              </span>
            </div>
            <p className="whitespace-pre-line break-words text-sm leading-relaxed">
              “{round.prompt.text}”
            </p>
            <p className="text-xs text-muted">
              Durum sahibi: {round.prompt.owner === 'platform' ? 'Platform' : 'İşletme'} · durum
              kimliği: {round.prompt.id}
            </p>

            <div className="grid grid-cols-1 gap-1 text-xs text-muted sm:grid-cols-2">
              <p>
                <span className="font-bold">Oyuncular:</span>{' '}
                {round.players.length === 0
                  ? '—'
                  : round.players.map((id) => nameOf(names, id)).join(', ')}
              </p>
              <p>
                <span className="font-bold">Bay:</span>{' '}
                {round.byes.length === 0 ? '—' : round.byes.map((id) => nameOf(names, id)).join(', ')}
              </p>
              <p className="sm:col-span-2">
                <span className="font-bold">Maçlar:</span>{' '}
                {round.matches.length === 0
                  ? '—'
                  : round.matches
                      .map(([left, right]) => `${nameOf(names, left)} – ${nameOf(names, right)}`)
                      .join(' · ')}
              </p>
              <p className="sm:col-span-2">
                <span className="font-bold">Sonuç grupları:</span>{' '}
                {round.resolution.length === 0
                  ? '—'
                  : round.resolution
                      .filter((group) => group.length > 0)
                      .map((group) => group.map((id) => nameOf(names, id)).join(', '))
                      .join(' · ')}
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">
                Puanlar (oy · ortalama)
              </p>
              {scores.length === 0 ? (
                <Note>Geçerli oy yok.</Note>
              ) : (
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {scores.map(([id, score]) => (
                    <li key={id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{nameOf(names, id)}</span>
                      <span className="shrink-0 font-display tabular-nums">
                        {score.votes} oy · {formatScore(score.average)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Gönderiler</p>
              {round.submissions.length === 0 ? (
                <Note>Gönderi yok.</Note>
              ) : (
                <ul className="mt-1 flex flex-col gap-1 text-xs">
                  {round.submissions.map((submission) => (
                    <li
                      key={submission.id}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-line px-2 py-1"
                    >
                      <span className="font-bold">{nameOf(names, submission.playerId)}</span>
                      <span className="text-muted">
                        {submission.memeId
                          ? `Sistem meme: ${submission.memeId}`
                          : submission.customType
                            ? `Özel içerik: ${CUSTOM_TYPE_LABELS[submission.customType] ?? submission.customType}`
                            : 'Medya yok'}
                      </span>
                      {submission.hidden ? <Badge tone="danger">Gizlendi</Badge> : null}
                      {submission.invalid ? <Badge tone="line">Geçersiz</Badge> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<DetailState>({ state: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState<'terminate' | 'refund' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fail = useCallback(
    (error: unknown, onOther: () => void) => {
      if (isAdminAuthError(error)) {
        navigate(adminLoginPath(`${NEXT_PATH}/${id ?? ''}`), { replace: true });
        return;
      }
      onOther();
    },
    [navigate, id],
  );

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setState({ state: 'loading' });
    getAdminSession(id)
      .then((data) => {
        if (alive) setState({ state: 'ready', data });
      })
      .catch((error) => {
        if (!alive) return;
        if (error instanceof HttpError && error.status === 404) setState({ state: 'notfound' });
        else fail(error, () => setState({ state: 'error' }));
      });
    return () => {
      alive = false;
    };
  }, [id, reloadToken, fail]);

  if (!id) return <Navigate to={NEXT_PATH} replace />;
  if (state.state === 'loading')
    return (
      <div className="flex flex-1 items-center justify-center">
        <p role="status" className="text-sm text-muted">
          Yükleniyor…
        </p>
      </div>
    );
  if (state.state === 'notfound') return <Navigate to={NEXT_PATH} replace />;
  if (state.state === 'error')
    return (
      <>
        <TopBar kicker="Oturum" title="Yüklenemedi" />
        <Note>Oturum bilgisi alınamadı; sayfayı yenile.</Note>
        <Link to={NEXT_PATH} className="text-sm underline underline-offset-4">
          ← Oturumlar
        </Link>
      </>
    );

  const { session, business, report, adminActions, errors, audit } = state.data;
  const isActive = ACTIVE_STATUSES.has(session.status);
  const consumed = session.creditCharged ?? session.creditConsumed;
  const canRefund = consumed && !session.creditRefunded;
  const names = new Map(
    (report?.participants ?? []).map((participant) => [participant.id, participant.nickname]),
  );
  const kicked = (report?.participants ?? []).filter(
    (participant) => participant.status === 'kicked',
  );
  const hiddenSubmissions = (report?.rounds ?? []).flatMap((round) =>
    round.submissions
      .filter((submission) => submission.hidden)
      .map((submission) => ({ roundNo: round.no, submission })),
  );
  const hiddenEvents = audit.filter((event) => event.type === 'contentHidden');
  const pauseEvents = audit.filter((event) =>
    ['paused', 'resumed', 'restored'].includes(event.type),
  );
  const systemMemeIds = [
    ...new Set(
      (report?.rounds ?? []).flatMap((round) =>
        round.submissions
          .map((submission) => submission.memeId)
          .filter((memeId): memeId is string => memeId !== null),
      ),
    ),
  ];
  const customCounts = (report?.rounds ?? [])
    .flatMap((round) => round.submissions)
    .reduce<Record<string, number>>((counts, submission) => {
      if (submission.customType)
        counts[submission.customType] = (counts[submission.customType] ?? 0) + 1;
      return counts;
    }, {});
  const earlyEnd =
    session.startedAt !== null &&
    session.endedAt !== null &&
    session.endReason !== null &&
    session.endReason !== 'completed';

  const cardClass =
    'flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4';

  async function handleTerminate() {
    if (!id) return;
    setBusy('terminate');
    setActionError(null);
    setNotice(null);
    try {
      await terminateAdminSession(id);
      setNotice('Oturum sonlandırıldı.');
      setReloadToken((token) => token + 1);
    } catch (error) {
      fail(error, () =>
        setActionError(
          error instanceof HttpError && error.code === 'SESSION_NOT_ACTIVE'
            ? 'Oturum artık aktif değil.'
            : error instanceof HttpError && error.code === 'ROOM_UNAVAILABLE'
              ? 'Oda şu an yanıt vermiyor; biraz sonra tekrar dene.'
              : 'Oturum sonlandırılamadı; biraz sonra tekrar dene.',
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRefund() {
    if (!id) return;
    setBusy('refund');
    setActionError(null);
    setNotice(null);
    try {
      await refundAdminSession(id);
      setNotice('Hak iade edildi.');
      setReloadToken((token) => token + 1);
    } catch (error) {
      fail(error, () =>
        setActionError(
          error instanceof HttpError && error.code === 'CREDIT_ALREADY_REFUNDED'
            ? 'Bu oturumun hakkı zaten iade edilmiş.'
            : error instanceof HttpError && error.code === 'CREDIT_NOT_CONSUMED'
              ? 'Bu oturumda harcanmış hak yok; iade edilemez.'
              : 'Hak iade edilemedi; biraz sonra tekrar dene.',
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Link to={NEXT_PATH} className="text-sm underline underline-offset-4">
        ← Oturumlar
      </Link>
      <TopBar
        kicker="Oturum"
        title={`Oda ${session.roomCode}`}
        right={<SessionStatusBadge status={session.status} />}
      />

      {notice ? (
        <p role="status" className="text-sm font-bold text-success">
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      <section aria-label="Oturum özeti" className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Özet</p>
        <dl className="flex flex-col gap-2">
          <Field
            label="İşletme"
            value={
              <Link
                to={`/admin/isletmeler/${business.id}`}
                className="underline underline-offset-4"
              >
                {business.name}
              </Link>
            }
          />
          <Field label="Mod" value={MODE_LABELS[session.mode]} />
          <Field label="Oluşturuldu" value={formatDateTime(session.createdAt)} />
          <Field
            label="Başladı"
            value={session.startedAt === null ? '—' : formatDateTime(session.startedAt)}
          />
          <Field
            label="Bitti"
            value={session.endedAt === null ? '—' : formatDateTime(session.endedAt)}
          />
          <Field
            label="Süre"
            value={formatDuration(session.startedAt, session.endedAt) ?? '—'}
          />
          <Field label="Bitiş nedeni" value={formatEndReason(session.endReason)} />
          <Field label="Erken bitiş" value={earlyEnd ? 'Evet' : 'Hayır'} />
          <Field
            label="Hak"
            value={
              session.creditRefunded
                ? 'Harcandı · iade edildi'
                : consumed
                  ? 'Harcandı'
                  : session.creditCharged === false
                    ? 'Harcanmadı (sınırsız hak)'
                    : 'Harcanmadı'
            }
          />
          <Field
            label="Admin müdahalesi"
            value={session.adminIntervention ? 'Var' : 'Yok'}
          />
          <Field label="Lobi sona erme" value={formatDateTime(session.expiresAt)} />
          <Field label="Oturum kimliği" value={<span className="break-all">{session.id}</span>} />
        </dl>
      </section>

      <section aria-label="Oturum ayarları" className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Ayarlar</p>
        <dl className="flex flex-col gap-2">
          <SettingField
            label="Lig turu"
            settings={session.settings}
            name="leagueRounds"
            kind="number"
          />
          <SettingField
            label="Seçim süresi"
            settings={session.settings}
            name="selectionSeconds"
            kind="number"
          />
          <SettingField
            label="Gözden geçirme"
            settings={session.settings}
            name="reviewSeconds"
            kind="number"
          />
          <SettingField
            label="Özel içerik"
            settings={session.settings}
            name="customContent"
            kind="flag"
          />
          <SettingField
            label="Oyuncu onayı"
            settings={session.settings}
            name="playerApproval"
            kind="flag"
          />
          <SettingField
            label="Seyirci onayı"
            settings={session.settings}
            name="voterApproval"
            kind="flag"
          />
          <SettingField
            label="Yeni seyirci"
            settings={session.settings}
            name="acceptVoters"
            kind="flag"
          />
        </dl>
      </section>

      <section aria-label="Kriz araçları" className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Kriz araçları</p>
        {isActive ? (
          <ConfirmButton
            label="Oturumu sonlandır"
            note="Süren oyun hemen biter; katılımcıların bağlantısı kapanır. Bu işlem kayda geçer."
            confirmLabel="Evet, sonlandır"
            onConfirm={() => void handleTerminate()}
            disabled={busy !== null}
          />
        ) : (
          <Note>Oturum aktif değil; sonlandırma gerekmez.</Note>
        )}

        {canRefund ? (
          <ConfirmButton
            label="Hakkı iade et"
            note="Bu oturum için harcanan 1 hak işletmenin bakiyesine eklenir. Oturum başına bir kez yapılabilir."
            confirmLabel="Evet, iade et"
            onConfirm={() => void handleRefund()}
            disabled={busy !== null}
          />
        ) : session.creditRefunded ? (
          <Note>Bu oturumun hakkı iade edildi.</Note>
        ) : (
          <Note>Bu oturumda harcanmış hak yok; iade edilemez.</Note>
        )}
      </section>

      {report ? (
        <>
          <section aria-label="Katılımcılar" className={cardClass}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Katılımcılar</p>
            <p className="text-sm text-muted">
              {report.playerCount} oyuncu · {report.spectatorCount} seyirci
            </p>
            {report.participants.length === 0 ? (
              <Note>Katılımcı yok.</Note>
            ) : (
              <ul className="flex flex-col gap-1">
                {report.participants.map((participant) => (
                  <li
                    key={participant.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line bg-background px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-bold">{participant.nickname}</span>
                    <span className="text-xs text-muted">
                      {PARTICIPANT_ROLE_LABELS[participant.role] ?? participant.role} ·{' '}
                      {PARTICIPANT_STATUS_LABELS[participant.status] ?? participant.status}
                    </span>
                    {participant.eliminated ? <Badge tone="danger">Elendi</Badge> : null}
                    {participant.withdrawn ? <Badge tone="line">Ayrıldı</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Turlar" className={cardClass}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Turlar</p>
            <ReportRounds report={report} names={names} />
          </section>

          <section aria-label="İçerik kullanımı" className={cardClass}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">
              İçerik kullanımı
            </p>
            <p className="text-sm">
              Sistem meme'i: {systemMemeIds.length}
              {systemMemeIds.length > 0 ? ` (${systemMemeIds.join(', ')})` : ''}
            </p>
            <p className="text-sm">
              Özel içerik:{' '}
              {Object.keys(customCounts).length === 0
                ? 'Yok'
                : Object.entries(customCounts)
                    .map(
                      ([type, count]) =>
                        `${CUSTOM_TYPE_LABELS[type] ?? type}: ${count} gönderi`,
                    )
                    .join(' · ')}
            </p>
          </section>

          <section aria-label="Sonuç ve sıralama" className={cardClass}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">
              Sonuç ve sıralama
            </p>
            {report.result === null ? (
              <Note>Sonuç oluşmadı.</Note>
            ) : (
              <>
                <p className="text-sm">
                  <span className="font-bold">Neden:</span>{' '}
                  {RESULT_REASON_LABELS[report.result.reason] ?? report.result.reason}
                </p>
                <p className="text-sm">
                  <span className="font-bold">Şampiyon:</span>{' '}
                  {report.result.champion === null
                    ? 'Yok'
                    : nameOf(names, report.result.champion)}
                </p>
                {report.result.ranking.length === 0 ? (
                  <Note>Sıralama yok.</Note>
                ) : (
                  <ol className="flex flex-col gap-1">
                    {report.result.ranking.map((row) => (
                      <li
                        key={`${row.participantId}-${row.rank}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-line bg-background px-3 py-2 text-sm"
                      >
                        <span className="font-display tabular-nums">{row.rank}</span>
                        <span className="min-w-0 flex-1 truncate font-bold">
                          {nameOf(names, row.participantId)}
                        </span>
                        <span className="font-display tabular-nums">{formatScore(row.score)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {report.result.jury === null ? (
                  <Note>Jüri ödülü yok.</Note>
                ) : (
                  <div className="flex flex-col gap-1 text-sm">
                    <p>
                      <span className="font-bold">En sert jüri:</span>{' '}
                      {report.result.jury.harshest.length === 0
                        ? '—'
                        : report.result.jury.harshest
                            .map((entry) => `${entry.nickname} (${formatScore(entry.average)})`)
                            .join(', ')}
                    </p>
                    <p>
                      <span className="font-bold">En cömert jüri:</span>{' '}
                      {report.result.jury.mostGenerous.length === 0
                        ? '—'
                        : report.result.jury.mostGenerous
                            .map((entry) => `${entry.nickname} (${formatScore(entry.average)})`)
                            .join(', ')}
                    </p>
                  </div>
                )}
              </>
            )}
          </section>

          <section aria-label="Gizlemeler" className={cardClass}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Gizlemeler</p>
            {hiddenSubmissions.length === 0 && hiddenEvents.length === 0 ? (
              <Note>Gizlenen içerik yok.</Note>
            ) : (
              <>
                {hiddenSubmissions.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {hiddenSubmissions.map(({ roundNo, submission }) => (
                      <li key={submission.id} className="rounded-md border border-line px-3 py-2">
                        Tur {roundNo} · {nameOf(names, submission.playerId)} ·{' '}
                        {submission.memeId
                          ? `Sistem meme: ${submission.memeId}`
                          : submission.customType
                            ? `Özel içerik: ${CUSTOM_TYPE_LABELS[submission.customType] ?? submission.customType}`
                            : 'Medya yok'}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {hiddenEvents.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-xs text-muted">
                    {hiddenEvents.map((event) => (
                      <li key={event.id}>
                        {formatDateTime(event.occurredAt)} · {AUDIT_LABELS[event.type] ?? event.type}
                        <Details value={event.payload} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>

          <section aria-label="Çıkarmalar" className={cardClass}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Çıkarmalar</p>
            {kicked.length === 0 ? (
              <Note>Çıkarılan katılımcı yok.</Note>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {kicked.map((participant) => (
                  <li
                    key={participant.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-line bg-background px-3 py-2"
                  >
                    <span className="min-w-0 truncate font-bold">{participant.nickname}</span>
                    <Badge tone="danger">Çıkarıldı</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Duraklatmalar" className={cardClass}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Duraklatmalar</p>
            {pauseEvents.length === 0 ? (
              <Note>Duraklatma yok.</Note>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {pauseEvents.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
                  >
                    <span>{AUDIT_LABELS[event.type] ?? event.type}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {formatDateTime(event.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <section aria-label="Rapor" className={cardClass}>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Rapor</p>
          <Note>Bu oturumda rapor yok; oyun oynanmadan kapanmış olabilir.</Note>
        </section>
      )}

      <section aria-label="Hatalar" className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Hatalar</p>
        {errors.length === 0 ? (
          <Note>Bu oturumda kayıtlı hata yok.</Note>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {errors.map((error) => (
              <li key={error.id} className="rounded-md border border-line px-3 py-2">
                <span className="font-bold">{error.code}</span>
                <span className="block text-xs text-muted">
                  {formatDateTime(error.occurredAt)} · {error.source}
                </span>
                <Details value={error.details} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Admin işlemleri" className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Admin işlemleri</p>
        {adminActions.length === 0 ? (
          <Note>Bu oturum için admin işlemi yok.</Note>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {adminActions.map((action) => (
              <li key={action.id} className="rounded-md border border-line px-3 py-2">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    {ADMIN_ACTION_LABELS[action.action] ?? action.action}
                  </span>
                  <span className="text-xs text-muted">
                    {formatDateTime(action.occurredAt)}
                  </span>
                </span>
                <Details value={action.details} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {audit.length > 0 ? (
        <details className={cardClass}>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-muted">
            Olay kaydı ({audit.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {audit.map((event) => (
              <li key={event.id} className="rounded-md border border-line px-3 py-2">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>{AUDIT_LABELS[event.type] ?? event.type}</span>
                  <span className="text-xs text-muted">{formatDateTime(event.occurredAt)}</span>
                </span>
                <Details value={event.payload} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
