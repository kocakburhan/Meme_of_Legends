import type { SessionConfig } from '@mol/engine';
import { Segmented, Stepper, ToggleRow } from '@/console/bits';
import { MODE_LABELS } from '@/lib/format';

/**
 * Ayar formu (SPEC 4.3): lobide tüm alanlar serbest, oyun sırasında mod ve
 * tur sayısı kilitlidir; süreler sonraki turlar için geçerlidir. Değerler
 * sunucu görünümünden kontrol edilir; her değişim tek `updateSettings`
 * komutuyla gider.
 */
export function SettingsEditor({
  config,
  onPatch,
  lockedMode,
  disabled,
}: {
  config: SessionConfig;
  onPatch: (patch: Partial<SessionConfig>) => void;
  /** Oyun sırasında mod/tur sayısı kilitli. */
  lockedMode?: boolean;
  disabled?: boolean;
}) {
  const lock = lockedMode ?? false;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Oyun modu</p>
        <Segmented
          ariaLabel="Oyun modu"
          disabled={disabled || lock}
          value={config.mode}
          onChange={(mode) => onPatch({ mode: mode as SessionConfig['mode'] })}
          options={[
            { value: 'elimination', label: 'Eleme' },
            { value: 'league', label: 'Lig' },
            { value: 'hybrid', label: 'Hibrit' },
          ]}
        />
        {lock ? <p className="text-xs text-muted">Oyun başladı; mod ve tur sayısı kilitli.</p> : null}
      </div>

      {config.mode === 'league' ? (
        <Stepper
          label="Lig tur sayısı"
          value={config.leagueRounds}
          min={1}
          max={50}
          disabled={disabled || lock}
          onCommit={(leagueRounds) => onPatch({ leagueRounds })}
        />
      ) : null}

      <Stepper
        label="Seçim süresi"
        value={config.selectionSeconds}
        min={30}
        max={240}
        step={5}
        suffix="sn"
        disabled={disabled}
        onCommit={(selectionSeconds) => onPatch({ selectionSeconds })}
      />
      <Stepper
        label="Final gözden geçirme süresi"
        value={config.reviewSeconds}
        min={15}
        max={120}
        step={5}
        suffix="sn"
        disabled={disabled}
        onCommit={(reviewSeconds) => onPatch({ reviewSeconds })}
      />

      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <ToggleRow
          label="Özel içerik"
          description="Oyuncular kendi resim, GIF ve YouTube içeriklerini ekleyebilir."
          checked={config.customContent}
          disabled={disabled}
          onChange={(customContent) => onPatch({ customContent })}
        />
        <ToggleRow
          label="Oyuncu onayı"
          description="Açıkken oyuncu olmak isteyen tek tek onaylanır; kapalıyken otomatik kabul."
          checked={config.playerApproval}
          disabled={disabled}
          onChange={(playerApproval) => onPatch({ playerApproval })}
        />
        <ToggleRow
          label="Seyirci onayı"
          description="Açıkken seyirci istekleri onay bekler."
          checked={config.voterApproval}
          disabled={disabled}
          onChange={(voterApproval) => onPatch({ voterApproval })}
        />
        <ToggleRow
          label="Yeni seyirci kabulü"
          description="Kapalıyken yeni seyirci odaya giremez."
          checked={config.acceptVoters}
          disabled={disabled}
          onChange={(acceptVoters) => onPatch({ acceptVoters })}
        />
      </div>
      <p className="sr-only">
        Mod: {MODE_LABELS[config.mode]}
      </p>
    </div>
  );
}
