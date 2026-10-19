import type { View } from '@mol/engine';
import type { ManagerCommand } from '@mol/shared';
import type { AckResult } from '@/net/socket';
import { Note } from '@/components/ui';
import { ConfirmButton, Section } from '@/console/bits';
import { SettingsEditor } from '@/console/SettingsEditor';
import { ackReasonNote } from '@/console/reasons';

/**
 * Ayarlar sekmesi (PROJECT_LOG 3.3): sonraki turlar için süreler, özel
 * içerik, seyirci kabulü ve onay modları; Oyunu bitir onaylıdır. Lobide
 * ayarlar Oyun sekmesinde olduğu için burada kilitli görünür.
 */
export function SettingsTab({
  view,
  send,
  onAckNote,
}: {
  view: View;
  send: (cmd: ManagerCommand) => Promise<AckResult>;
  onAckNote: (note: string) => void;
}) {
  async function run(cmd: ManagerCommand) {
    try {
      const ack = await send(cmd);
      if (!ack.ok) onAckNote(ackReasonNote(ack.reason));
    } catch {
      onAckNote(ackReasonNote('ACK_TIMEOUT'));
    }
  }

  const live = view.status === 'running';
  const ended = view.status === 'finished' || view.status === 'terminated';

  return (
    <div className="flex flex-col gap-4">
      <Section title="Sonraki turlar">
        <SettingsEditor
          config={view.config}
          lockedMode
          disabled={!live}
          onPatch={(patch) => void run({ type: 'updateSettings', patch })}
        />
        {!live ? <Note>Bu ayarlar oyun sürerken değişir; lobi ayarları Oyun sekmesinde.</Note> : null}
      </Section>

      {!ended ? (
        <Section title="Oyunu bitir">
          <ConfirmButton
            label="Oyunu bitir"
            note="Oyun şimdi sona erer; sıralama tablosu şampiyonlukla kapanır. Geri alınamaz."
            confirmLabel="Evet, bitir"
            disabled={!live}
            onConfirm={() => void run({ type: 'endGame' })}
          />
          <Note>
            {view.status === 'paused'
              ? 'Duraklatılmış oyunda bitir düğmesi kapalıdır; önce devam et.'
              : 'Koşullar sağlanmazsa (duraklatma) düğme pasiftir.'}
          </Note>
        </Section>
      ) : null}
    </div>
  );
}
