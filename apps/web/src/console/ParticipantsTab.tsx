import type { View } from '@mol/engine';
import type { ManagerCommand, ManagerShellInfo } from '@mol/shared';
import type { AckResult } from '@/net/socket';
import { Note } from '@/components/ui';
import { Badge, ConfirmButton, Section } from '@/console/bits';
import { ackReasonNote } from '@/console/reasons';

/**
 * Katılımcılar sekmesi (PROJECT_LOG 3.3): oyuncu/seyirci listeleri, kişi
 * başına işlemler, bekleyen onaylar ve cihaz devri istekleri. Onaylar rozetli
 * sıradadır; asla engelleyici pencere çıkmaz. Atma onay ister.
 */
export function ParticipantsTab({
  view,
  now,
  shell,
  send,
  sendShell,
  onAckNote,
}: {
  view: View;
  now: number;
  shell: ManagerShellInfo | null;
  send: (cmd: ManagerCommand) => Promise<AckResult>;
  sendShell: (action: import('@mol/shared').ShellAction) => Promise<AckResult>;
  onAckNote: (note: string) => void;
}) {
  const pending = view.participants.filter((p) => p.status === 'pending');
  const players = view.participants.filter((p) => p.role === 'player' && p.status === 'active');
  const voters = view.participants.filter((p) => p.role === 'voter' && p.status === 'active');
  const takeovers = shell?.pendingTakeovers ?? [];

  async function run(cmd: ManagerCommand) {
    try {
      const ack = await send(cmd);
      if (!ack.ok) onAckNote(ackReasonNote(ack.reason));
    } catch {
      onAckNote(ackReasonNote('ACK_TIMEOUT'));
    }
  }

  async function resolveTakeover(requestId: string, approve: boolean) {
    try {
      const ack = await sendShell({ kind: approve ? 'approveTakeover' : 'rejectTakeover', requestId });
      onAckNote(ack.ok ? (approve ? 'Devri onayladın.' : 'İsteği reddettin.') : ackReasonNote(ack.reason));
    } catch {
      onAckNote(ackReasonNote('ACK_TIMEOUT'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {takeovers.length > 0 ? (
        <Section title="Cihaz devri istekleri" aside={<Badge tone="accent">{takeovers.length}</Badge>}>
          <ul className="flex flex-col gap-2">
            {takeovers.map((t) => (
              <li key={t.requestId} className="rounded-md border border-accent/60 bg-background px-3 py-2">
                <p className="text-sm font-bold">{t.nickname}</p>
                <p className="mb-2 text-xs text-muted">
                  {new Date(t.requestedAt).toLocaleTimeString('tr-TR')} · yeni cihaz devam etmek istiyor
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <ConfirmButton
                    label="Onayla"
                    note={`"${t.nickname}" yeni cihazdan devam edecek; eski cihaz düşer.`}
                    confirmLabel="Evet, onayla"
                    className="min-h-11"
                    onConfirm={() => void resolveTakeover(t.requestId, true)}
                  />
                  <ConfirmButton
                    label="Reddet"
                    note={`"${t.nickname}" isteği reddedilir; farklı adla seyirci olabilir.`}
                    confirmLabel="Evet, reddet"
                    className="min-h-11"
                    onConfirm={() => void resolveTakeover(t.requestId, false)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {pending.length > 0 ? (
        <Section title="Onay bekleyenler" aside={<Badge tone="accent">{pending.length}</Badge>}>
          <ul className="flex flex-col gap-2">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-background px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{p.nickname}</span>
                  <span className="text-xs text-muted">
                    {p.role === 'player' ? 'oyuncu olmak istiyor' : 'seyirci olmak istiyor'}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    aria-label={`${p.nickname} onayla`}
                    onClick={() => void run({ type: 'approveParticipant', participantId: p.id })}
                    className="flex min-h-11 w-20 items-center justify-center rounded-md bg-accent px-2 text-sm font-bold text-accent-ink"
                  >
                    Onayla
                  </button>
                  <button
                    type="button"
                    aria-label={`${p.nickname} reddet`}
                    onClick={() => void run({ type: 'rejectParticipant', participantId: p.id })}
                    className="flex min-h-11 w-20 items-center justify-center rounded-md border border-line bg-surface px-2 text-sm font-bold text-foreground"
                  >
                    Reddet
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <Note>Oyuncu reddedilirse seyirci olur; seyirci reddedilirse odadan çıkar.</Note>
        </Section>
      ) : null}

      <Section title="Oyuncular" aside={<Badge tone="accent">{players.length}</Badge>}>
        {players.length === 0 ? (
          <Note>Henüz oyuncu yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {players.map((p) => (
              <li key={p.id} className="rounded-md border border-line bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{p.nickname}</span>
                    <span className="text-xs text-muted">{joinedText(p.connected, p.joinedAt, now)}</span>
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {!p.connected ? <Badge tone="danger">Kopuk</Badge> : null}
                    {p.needsNickname ? <Badge tone="accent">Ad bekliyor</Badge> : null}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    aria-label={`${p.nickname} seyirciye al`}
                    onClick={() => void run({ type: 'moveToVoter', participantId: p.id })}
                    className="flex min-h-11 items-center justify-center rounded-md border border-line bg-surface px-1 text-xs font-bold"
                  >
                    Seyirciye al
                  </button>
                  <ConfirmButton
                    label="At"
                    note={`"${p.nickname}" odadan çıkarılır; aynı tarayıcı geri giremez.`}
                    confirmLabel="Evet, at"
                    className="min-h-11"
                    onConfirm={() => void run({ type: 'kick', participantId: p.id })}
                  />
                  <button
                    type="button"
                    aria-label={`${p.nickname} takma adını sıfırla`}
                    onClick={() => void run({ type: 'resetNickname', participantId: p.id })}
                    className="flex min-h-11 items-center justify-center rounded-md border border-line bg-surface px-1 text-xs font-bold"
                  >
                    Adı sıfırla
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Seyirciler" aside={<Badge>{voters.length}</Badge>}>
        {voters.length === 0 ? (
          <Note>Henüz seyirci yok.</Note>
        ) : (
          <ul className="flex flex-col gap-2">
            {voters.map((p) => (
              <li key={p.id} className="rounded-md border border-line bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{p.nickname}</span>
                    <span className="text-xs text-muted">{joinedText(p.connected, p.joinedAt, now)}</span>
                  </span>
                  {!p.connected ? <Badge tone="danger">Kopuk</Badge> : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <ConfirmButton
                    label="At"
                    note={`"${p.nickname}" odadan çıkarılır; aynı tarayıcı geri giremez.`}
                    confirmLabel="Evet, at"
                    className="min-h-11"
                    onConfirm={() => void run({ type: 'kick', participantId: p.id })}
                  />
                  <button
                    type="button"
                    aria-label={`${p.nickname} takma adını sıfırla`}
                    onClick={() => void run({ type: 'resetNickname', participantId: p.id })}
                    className="flex min-h-11 items-center justify-center rounded-md border border-line bg-surface px-1 text-xs font-bold"
                  >
                    Adı sıfırla
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function joinedText(connected: boolean | undefined, joinedAt: number | undefined, now: number): string {
  const joined = joinedAt ? `${Math.max(0, Math.round((now - joinedAt) / 60_000))} dk önce katıldı` : '';
  if (connected === undefined) return joined;
  return joined ? `${joined} · ${connected ? 'bağlı' : 'bağlantı yok'}` : connected ? 'bağlı' : 'bağlantı yok';
}
