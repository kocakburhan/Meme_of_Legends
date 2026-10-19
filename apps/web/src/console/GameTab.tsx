import { useRef, useState } from 'react';
import type { MediaRef, View } from '@mol/engine';
import type { ManagerCommand, ShellAction } from '@mol/shared';
import { cancelBusinessSession, listBusinessSessions, type BusinessAccount } from '@/net/http';
import type { AckResult } from '@/net/socket';
import { Card, Note, PrimaryButton, GhostButton } from '@/components/ui';
import { QrCode } from '@/components/QrCode';
import { Badge, ConfirmButton, HoldButton, Section, Segmented } from '@/console/bits';
import { SettingsEditor } from '@/console/SettingsEditor';
import {
  MODE_DESCRIPTIONS,
  ackReasonNote,
  startBlockReason,
} from '@/console/reasons';
import { formatClock, formatEstimatedDuration, formatScore, MODE_LABELS, remainingSeconds } from '@/lib/format';

/**
 * Oyun sekmesi (PROJECT_LOG 3.3): aşamaya göre tek kart. Her komut `ack`
 * bekler; retlerde neden insan dilinde tek bir bölgede gösterilir.
 */
export interface GameTabProps {
  view: View;
  code: string;
  now: number;
  account: BusinessAccount | null;
  send: (cmd: ManagerCommand) => Promise<AckResult>;
  sendShell: (action: ShellAction) => Promise<AckResult>;
  onAckNote: (note: string) => void;
}

export function GameTab(props: GameTabProps) {
  const { view } = props;
  if (view.phase.kind === 'lobby') return <LobbyCard {...props} />;
  switch (view.phase.kind) {
    case 'selection':
      return <SelectionCard {...props} />;
    case 'presentation':
      return <PresentationCard {...props} />;
    case 'review':
      return <ReviewCard {...props} />;
    case 'results':
      return <ResultsCard {...props} />;
    case 'finished':
      return <FinishedCard {...props} />;
    default:
      return <PassiveCard {...props} />;
  }
}

/* ------------------------------- Yardımcılar ------------------------------ */

function nicknameOf(view: View, id: string): string {
  return view.participants.find((p) => p.id === id)?.nickname ?? 'Katılımcı';
}

function mediaLabel(media: MediaRef): string {
  if (media.source === 'youtube') return 'YouTube';
  if (media.mediaType === 'gif') return 'GIF';
  if (media.mediaType === 'video') return 'Video';
  return 'Resim';
}

/* --------------------------------- Lobi ---------------------------------- */

function LobbyCard({ view, code, account, send, onAckNote }: GameTabProps) {
  const players = view.participants.filter((p) => p.role === 'player' && p.status === 'active');
  const duration = formatEstimatedDuration(view.config, players.length);
  const block = startBlockReason(view, account ?? { credits: 1, unlimitedCredits: false });
  const creditsNote = account
    ? account.unlimitedCredits
      ? 'sınırsız'
      : String(account.credits)
    : null;
  const qrRef = useRef<HTMLDivElement | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [linkHint, setLinkHint] = useState<string | null>(null);
  const shareUrl = `${location.origin}/oda/${code}`;

  async function run(cmd: Parameters<GameTabProps['send']>[0]) {
    try {
      const ack = await send(cmd);
      if (!ack.ok) onAckNote(ackReasonNote(ack.reason));
      return ack;
    } catch {
      onAckNote(ackReasonNote('ACK_TIMEOUT'));
      return { ok: false };
    }
  }

  async function handleShare() {
    const url = shareUrl;
    try {
      await navigator.clipboard.writeText(url);
      setLinkHint('Link kopyalandı.');
    } catch {
      setLinkHint(url);
    }
    window.setTimeout(() => setLinkHint(null), 2500);
  }

  function handleDownloadQr() {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meme-of-legends-${code}-qr.svg`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleCancel() {
    // Oturum kimliği sunucudaki aktif oturum listesinden bulunur (M4c-1);
    // localStorage'a bağlı değil, rövanş ve başka cihazdan açılan lobilerde de çalışır.
    try {
      const { sessions } = await listBusinessSessions('active');
      const session = sessions.find((s) => s.roomCode === code);
      if (!session) {
        onAckNote('Bu lobinin oturum kaydı bulunamadı; sayfayı yenileyip tekrar dene.');
        return;
      }
      await cancelBusinessSession(session.id);
    } catch (error) {
      onAckNote(
        error instanceof Error && 'status' in error
          ? ackReasonNote(String((error as { code?: string }).code ?? ''))
          : 'Lobi iptal edilmedi; tekrar dene.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Paylaşım"
        aside={<Badge tone={players.length > 0 ? 'accent' : 'line'}>{players.length} oyuncu</Badge>}
      >
        <PrimaryButton onClick={() => void handleShare()}>Katılım linkini kopyala</PrimaryButton>
        {linkHint ? (
          <p role="status" className="text-center text-sm text-success">
            {linkHint}
          </p>
        ) : null}
        <GhostButton onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'QR gizle' : 'QR göster'}
        </GhostButton>
        {showQr ? (
          <div className="flex flex-col items-center gap-2">
            <div ref={qrRef}>
              <QrCode value={shareUrl} />
            </div>
            <GhostButton onClick={handleDownloadQr}>QR indir</GhostButton>
          </div>
        ) : null}
      </Section>

      <Section title="Mod ve ayarlar" aside={duration ? <Badge>{duration}</Badge> : null}>
        <Note>{MODE_DESCRIPTIONS[view.config.mode]}</Note>
        <SettingsEditor config={view.config} onPatch={(patch) => void run({ type: 'updateSettings', patch })} />
      </Section>

      <Section title="İlk turun durumu (önizleme)">
        {view.promptPreview ? (
          <>
            <p className="font-display text-xl leading-snug">{view.promptPreview.text}</p>
            <GhostButton onClick={() => void run({ type: 'replacePrompt' })}>
              Durumu değiştir
            </GhostButton>
          </>
        ) : (
          <Note>Önizleme bekleniyor…</Note>
        )}
      </Section>

      <Section title="Oyunu başlat">
        <ConfirmButton
          label="Başlat"
          note={
            creditsNote
              ? `1 oyun hakkın düşecek, kalan: ${creditsNote}`
              : '1 oyun hakkın düşecek.'
          }
          confirmLabel="Evet, başlat"
          disabled={block !== null}
          onConfirm={() => void run({ type: 'start' })}
        />
        {block ? (
          <p className="text-sm text-muted">
            Başlat pasif: {block}
          </p>
        ) : null}
        <ConfirmButton
          label="Lobiyi iptal et"
          note="Lobi kapanır; oyun hakkı düşmez, bu işlem geri alınamaz."
          confirmLabel="Evet, iptal et"
          onConfirm={() => void handleCancel()}
        />
      </Section>
    </div>
  );
}

/* -------------------------------- Seçim ---------------------------------- */

function SelectionCard({ view, now, send, onAckNote }: GameTabProps) {
  if (view.phase.kind !== 'selection') return null;
  const phase = view.phase;
  const submitters = view.participants.filter(
    (p) => p.role === 'player' && p.status === 'active' && !view.byes.includes(p.id),
  );
  const readyCount = submitters.filter((p) => p.ready).length;
  const replaceOpen = now < phase.promptReplaceUntil;
  // Görünümde geçersiz gönderi medyası null gelir (projection); seçimde bu
  // yalnız reddedilmiş özel içerik olabilir.
  const custom = view.submissions.filter((s) => s.media?.source !== 'system');

  async function run(cmd: Parameters<GameTabProps['send']>[0]) {
    try {
      const ack = await send(cmd);
      if (!ack.ok) onAckNote(ackReasonNote(ack.reason));
    } catch {
      onAckNote(ackReasonNote('ACK_TIMEOUT'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Durum"
        aside={<Badge>{formatClock(remainingSeconds(phase.endsAt, now))}</Badge>}
      >
        {view.prompt ? <p className="font-display text-xl leading-snug">{view.prompt.text}</p> : null}
        <HoldButton
          disabled={!replaceOpen}
          onComplete={() => void run({ type: 'replacePrompt' })}
          hint="Oyuncu seçimleri sıfırlanır, süre baştan başlar."
        >
          Durumu değiştir
        </HoldButton>
        {!replaceOpen ? (
          <Note>Acil değiştirme penceresi kapandı; tur başına 1 hak, ilk 15 saniyede geçerli.</Note>
        ) : null}
      </Section>

      <Section
        title="Süre ekle"
        aside={<Badge tone={readyCount === submitters.length && submitters.length > 0 ? 'success' : 'line'}>{readyCount}/{submitters.length} hazır</Badge>}
      >
        <Segmented
          ariaLabel="Seçim aşamasına süre ekle"
          value=""
          options={[
            { value: '15', label: '+15 sn' },
            { value: '30', label: '+30 sn' },
            { value: '60', label: '+60 sn' },
          ]}
          onChange={(seconds) => void run({ type: 'addTime', seconds: Number(seconds) as 15 | 30 | 60 })}
        />
        <Note>Süren sayacı kısaltamaz; yalnız uzatır.</Note>
      </Section>

      <Section
        title="Özel içerik (canlı)"
        aside={<Badge>{custom.length}</Badge>}
      >
        {custom.length === 0 ? (
          <Note>Henüz özel içerik yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {custom.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-background px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">
                    {s.playerId ? nicknameOf(view, s.playerId) : 'Katılımcı'}
                  </span>
                  <span className="text-xs text-muted">{s.media ? mediaLabel(s.media) : 'İçerik kaldırıldı'}</span>
                </span>
                {!s.media ? (
                  <Badge tone="danger">Reddedildi</Badge>
                ) : (
                  <GhostButton
                    className="min-h-11 w-24 px-2 text-sm"
                    onClick={() => s.playerId && void run({ type: 'rejectCustom', participantId: s.playerId })}
                  >
                    Reddet
                  </GhostButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------- Gösterim -------------------------------- */

function PresentationCard({ view, now, send, onAckNote }: GameTabProps) {
  if (view.phase.kind !== 'presentation') return null;
  const phase = view.phase;
  const live = view.submissions.filter((s) => !s.hidden && s.media);
  const hidden = view.submissions.filter((s) => s.hidden);

  async function run(cmd: Parameters<GameTabProps['send']>[0]) {
    try {
      const ack = await send(cmd);
      if (!ack.ok) onAckNote(ackReasonNote(ack.reason));
    } catch {
      onAckNote(ackReasonNote('ACK_TIMEOUT'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Gösterim"
        aside={view.presentation ? <Badge>{`Gönderi ${view.presentation.index + 1} / ${view.presentation.total}`}</Badge> : null}
      >
        {view.prompt ? <p className="font-display text-xl leading-snug">{view.prompt.text}</p> : null}
        {live.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {live.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-background px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">
                    {s.playerId ? nicknameOf(view, s.playerId) : 'Anonim'}
                  </span>
                  <span className="text-xs text-muted">
                    {s.media ? mediaLabel(s.media) : ''} · {s.ratingProgress ? `${s.ratingProgress.received}/${s.ratingProgress.eligible} puan verdi` : '—'}
                  </span>
                </span>
                <Badge>{formatClock(remainingSeconds(phase.endsAt, now))}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Note>Gönderi bekleniyor…</Note>
        )}
        <Note>Ortak ekranda gönderiler sırayla, her an yalnız biri gösterilir.</Note>
        <HoldButton
          onComplete={() => void run({ type: 'hideCurrent' })}
          hint="Tüm ekranlardan anında kaldırılır; kazara basmaya karşı 1 sn."
        >
          Hemen gizle
        </HoldButton>
      </Section>

      {hidden.length > 0 ? (
        <Section title="Gizlenenler" aside={<Badge tone="danger">{hidden.length}</Badge>}>
          <Note>
            Gizlenen gönderiler geçersizdir; özel içerikte oyuncu o turdan 0 alır, sistem meme'inde
            telafi uygulanır.
          </Note>
        </Section>
      ) : null}
    </div>
  );
}

/* --------------------------- Gözden geçirme ------------------------------ */

function ReviewCard({ view, send, onAckNote }: GameTabProps) {
  // M4a ile View'e taşınan bitiren/uygun sayıları (projection) doğrudan oku.
  const review = view.review;

  async function run(cmd: Parameters<GameTabProps['send']>[0]) {
    try {
      const ack = await send(cmd);
      if (!ack.ok) onAckNote(ackReasonNote(ack.reason));
    } catch {
      onAckNote(ackReasonNote('ACK_TIMEOUT'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Final gözden geçirme"
        aside={review ? <Badge tone="success">{`${review.finished}/${review.eligible} bitirdi`}</Badge> : null}
      >
        <Note>
          Katılımcılar kaçırdıkları gönderileri yeniden puanlıyor. Bağlı herkes bitirince aşama
          kendiliğinden kapanır.
        </Note>
        <PrimaryButton onClick={() => void run({ type: 'closeReview' })}>Şimdi kapat</PrimaryButton>
      </Section>
    </div>
  );
}

/* --------------------------------- Sonuç --------------------------------- */

function ResultsCard({ view, send, onAckNote }: GameTabProps) {
  async function run(cmd: Parameters<GameTabProps['send']>[0]) {
    try {
      const ack = await send(cmd);
      if (!ack.ok) onAckNote(ackReasonNote(ack.reason));
    } catch {
      onAckNote(ackReasonNote('ACK_TIMEOUT'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Sonuçlar">
        {view.table.slice(0, 8).map((row) => (
          <div key={row.participantId} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">
              {row.rank}. {nicknameOf(view, row.participantId)}
            </span>
            <span className="font-display tabular-nums">{formatScore(row.score)}</span>
          </div>
        ))}
      </Section>
      <Section title="Sonraki turun durumu (önizleme)">
        {view.promptPreview ? (
          <>
            <p className="font-display text-xl leading-snug">{view.promptPreview.text}</p>
            <GhostButton onClick={() => void run({ type: 'replacePrompt' })}>
              Durumu değiştir
            </GhostButton>
          </>
        ) : (
          <Note>Oyunun sonuna gelindi; önizleme yok.</Note>
        )}
      </Section>
      <Section title="Geçiş">
        <div className="grid grid-cols-2 gap-2">
          <GhostButton onClick={() => void run({ type: 'pause' })}>Beklet</GhostButton>
          <PrimaryButton onClick={() => void run({ type: 'skipResults' })}>Hemen geç</PrimaryButton>
        </div>
        <Note>Bekletmek bir duraklatmadır; Hemen geç sonraki tura atlar.</Note>
      </Section>
    </div>
  );
}

/* ------------------------------- Oyun sonu ------------------------------- */

function FinishedCard({ view, sendShell, onAckNote }: GameTabProps) {
  async function rematch() {
    try {
      const ack = await sendShell({ kind: 'rematch' });
      if (!ack.ok) onAckNote(ackReasonNote(ack.reason));
    } catch {
      onAckNote(ackReasonNote('ACK_TIMEOUT'));
    }
  }

  const champion = view.result?.champion ? nicknameOf(view, view.result.champion) : null;
  return (
    <div className="flex flex-col gap-4">
      <Section title="Oyun sonu">
        <p className="font-display text-xl">
          {champion ? `Şampiyon: ${champion}` : 'Şampiyonsuz bitti.'}
        </p>
        <Note>
          Aynı oda kodunda yeni lobi açılır; katılımcılar odadan çıkmaz, oyuncu istekleri yeniden
          toplanır.
        </Note>
        <PrimaryButton onClick={() => void rematch()}>Rövanş</PrimaryButton>
      </Section>
    </div>
  );
}

/* ----------------------------- Etkisiz fazlar ---------------------------- */

function PassiveCard({ view }: GameTabProps) {
  return (
    <Card className="flex flex-col items-center gap-2 text-center">
      <p className="font-display text-xl uppercase">{MODE_LABELS[view.config.mode]} · Tur {view.phase.kind === 'reveal' || view.phase.kind === 'draw' ? view.phase.roundNo : ''}</p>
      <Note>Bu aşamada yönetici işlemi gerekmiyor; akış sunucuda sürüyor.</Note>
    </Card>
  );
}
