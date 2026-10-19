import type { View } from '@mol/engine';
import type { Me, RoomInfo } from '@/lib/contracts';
import { MODE_LABELS, formatEstimatedDuration } from '@/lib/format';
import { Card, GhostButton, Note, Screen, TopBar } from '@/components/ui';

function initials(nickname: string): string {
  return Array.from(nickname.trim())
    .slice(0, 2)
    .map((c) => c.toUpperCase())
    .join('');
}

/** Lobi: oyuncu listesi, seyirci sayısı, mod + tahmini süre, paylaşım. */
export function LobbyScreen({
  view,
  me,
  room,
  onShare,
  shareHint,
  onLeave,
  className,
}: {
  view: View;
  me: Me;
  room: RoomInfo;
  onShare: () => void;
  shareHint?: string | null;
  /** Oyuncu lobi farklı rolde devam etmek istemezse (SPEC 3.1 menüsü). */
  onLeave?: () => void;
  className?: string;
}) {
  const players = view.participants.filter((p) => p.role === 'player');
  const duration = formatEstimatedDuration(view.config, players.length);

  return (
    <Screen className={className}>
      <TopBar
        kicker={room.businessName ?? 'Oda ' + room.code}
        title={
          <span>
            Hazırsın, <span className="text-accent">{me.nickname}</span>
          </span>
        }
      />
      <p className="text-sm text-muted">
        Oyun başladığında buradan takip edeceksin. Yönetici "Başlat"a bastığında turlar başlar.
      </p>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Mod</p>
            <p className="font-display text-xl uppercase">{MODE_LABELS[view.config.mode]}</p>
          </div>
          {duration ? (
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Tahmini süre</p>
              <p className="font-display text-xl uppercase">{duration}</p>
            </div>
          ) : null}
        </div>
      </Card>

      <section aria-label="Oyuncular">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
          {players.length} oyuncu hazır
        </p>
        <ul className="flex flex-wrap gap-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2 text-sm"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-sm bg-surface-raised font-display text-sm"
              >
                {initials(p.nickname)}
              </span>
              {p.nickname}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted">
          {view.spectatorCount} seyirci izliyor
        </p>
      </section>

      <details className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
        <summary className="cursor-pointer text-sm font-bold">Nasıl oynanır?</summary>
        <Note className="mt-2">
          Her tur bir durum gösterilir ("Maaşın yattığı an"). Süre bitmeden duruma en uygun meme'i
          seçer ve onaylarsın. Gönderiler anonim gösterilir; herkesi 1–5 arasında puanlarsın. Yüksek
          puan alan tur atlar.
        </Note>
      </details>

      <div className="mt-auto">
        {onLeave && me.role === 'player' ? (
          <GhostButton onClick={onLeave} ariaLabel="Gönderi yapmayı bırak, seyirci olarak devam et">
            Seyirci olarak devam et
          </GhostButton>
        ) : null}
        <GhostButton onClick={onShare}>Linki paylaş</GhostButton>
        {shareHint ? (
          <p role="status" className="mt-1 text-center text-sm text-success">
            {shareHint}
          </p>
        ) : null}
      </div>
    </Screen>
  );
}
