import type { View } from '@mol/engine';
import type { ManagerShellInfo } from '@mol/shared';
import { GhostButton } from '@/components/ui';
import { Badge } from '@/console/bits';
import { remainingSeconds, formatClock } from '@/lib/format';
import { cn } from '@/lib/cn';
import { phaseEndsAt, phaseLabel } from '@/console/reasons';

/**
 * Sabit durum çubuğu (PROJECT_LOG 3.3): aşama, tur, kalan süre, büyük
 * Duraklat/Devam ve ortak ekran menüsü. Sayfa kayarken üstte kalır.
 */
export function StatusBar({
  view,
  code,
  now,
  connected,
  shell,
  onPause,
  onResume,
  onCreatePairCode,
}: {
  view: View;
  /** 6 karakterlik oda kodu (view taşımaz; yol parametresinden). */
  code: string;
  now: number;
  /** Soket açık mı (değilse yeniden bağlanma uyarısı). */
  connected: boolean;
  shell: ManagerShellInfo | null;
  onPause: () => void;
  onResume: () => void;
  onCreatePairCode: () => void;
}) {
  const endsAt = view.status === 'running' ? phaseEndsAt(view.phase) : null;
  const pairCode = shell?.displayPairCode ?? null;
  const pairLeft = pairCode ? remainingSeconds(pairCode.expiresAt, now) : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/95 px-4 pb-3 pt-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-lg uppercase tracking-wide">
            Oda <span className="text-accent">{code}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {!connected ? <Badge tone="danger">Bağlantı kopuk</Badge> : null}
            {view.status === 'paused' ? <Badge tone="accent">Duraklatıldı</Badge> : null}
            <Badge>{phaseLabel(view)}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {endsAt !== null && endsAt > now ? (
            <p className="min-w-0 flex-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Kalan süre </span>
              <time
                role="timer"
                dateTime={`PT${remainingSeconds(endsAt, now)}S`}
                className={cn(
                  'font-display text-3xl leading-none tabular-nums',
                  remainingSeconds(endsAt, now) <= 5 && 'text-accent',
                )}
              >
                {formatClock(remainingSeconds(endsAt, now))}
              </time>
            </p>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-muted">{deadlineNote(view)}</p>
          )}
          {view.status === 'running' || view.status === 'paused' ? (
            view.status === 'running' ? (
              <button
                type="button"
                onClick={onPause}
                aria-label="Oyunu duraklat"
                className="flex min-h-14 shrink-0 items-center justify-center rounded-md border border-accent bg-surface px-4 font-display text-lg uppercase text-foreground hover:bg-surface-raised"
              >
                ⏸ Duraklat
              </button>
            ) : (
              <button
                type="button"
                onClick={onResume}
                aria-label="Oyuna devam et"
                className="flex min-h-14 shrink-0 items-center justify-center rounded-md bg-accent px-4 font-display text-lg uppercase text-accent-ink hover:bg-[#ffdd66]"
              >
                ▶ Devam
              </button>
            )
          ) : null}
        </div>

        <details className="rounded-md border border-line bg-surface px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 text-sm font-bold">
            Ortak ekran
            <Badge tone={shell?.displayConnected ? 'success' : 'line'}>
              {shell?.displayConnected ? 'Bağlı ✓' : 'Yok'}
            </Badge>
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {pairCode ? (
              <>
                <p className="text-xs text-muted">
                  Ekranda <span className="font-bold">/ekran</span> sayfasını açıp bu kodu gir.
                </p>
                <p role="group" aria-label="Eşleştirme kodu" className="text-center">
                  <span className="break-all font-display text-4xl tracking-[0.3em] text-accent">
                    {pairCode.code}
                  </span>
                </p>
                <p className="text-center text-xs tabular-nums text-muted">
                  {Math.max(0, pairLeft)} sn sonra geçersiz · tek kullanımlık
                </p>
              </>
            ) : (
              <p className="text-xs text-muted">Projektör ya da TV'de oyunu göstermek için kod üret.</p>
            )}
            <GhostButton
              onClick={onCreatePairCode}
              disabled={pairCode !== null && pairLeft > 0}
            >
              {pairCode ? 'Yeni kod üret' : 'Eşleştirme kodu üret'}
            </GhostButton>
          </div>
        </details>
      </div>
    </header>
  );
}

/** Görünümde son aşamalar için nötr not; sayısal süre bunların üstünde görünmez. */

function deadlineNote(view: View): string {
  switch (view.phase.kind) {
    case 'lobby':
      return 'Lobi açık; katılım için kod ve QR aşağıda.';
    case 'reveal':
    case 'draw':
      return 'Sonuçlar sunucuda sırayla açıklanıyor.';
    case 'finished':
      return 'Oyun sona erdi.';
    default:
      return view.status === 'paused' ? 'Duraklatıldı; süre bekliyor.' : 'Süre hesaplanıyor…';
  }
}
