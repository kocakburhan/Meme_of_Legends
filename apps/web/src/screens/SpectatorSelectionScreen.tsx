import type { View } from '@mol/engine';
import type { Me } from '@/lib/contracts';
import { Countdown, LiveStatus } from '@/components/Countdown';
import { Card, Note, ProgressBar, Screen } from '@/components/ui';

/**
 * Seçim ekranı (seyirci / gönderi yapmayan oyuncu): durum, eşleşmeler ve canlı
 * "hazır" işaretleri, ilerleme çubuğu, kütüphaneye göz atma (SPEC 7.1).
 */
export function SpectatorSelectionScreen({
  view,
  me,
  now,
  onBrowseLibrary,
  className,
}: {
  view: View;
  me: Me;
  now: number;
  onBrowseLibrary: () => void;
  className?: string;
}) {
  const phase = view.phase;
  const secondsLeft = phase.kind === 'selection' ? Math.max(0, Math.ceil((phase.endsAt - now) / 1000)) : 0;
  const total = phase.kind === 'selection' ? view.config.selectionSeconds : 1;

  const players = view.participants.filter((p) => p.role === 'player');
  const readyCount = players.filter((p) => p.ready).length;
  const isBye = view.byes.includes(me.id);
  const votesThisRound =
    me.votingFromRound !== undefined && phase.kind === 'selection' && me.votingFromRound <= phase.roundNo;

  return (
    <Screen className={className}>
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Durum</p>
        <p className="font-display text-2xl uppercase leading-tight text-accent">
          {view.prompt?.text ?? '—'}
        </p>
        <Countdown secondsLeft={secondsLeft} totalSeconds={total} className="mt-2" />
      </div>

      <Card>
        <p className="font-display text-lg uppercase">
          {isBye ? 'Bu tur bay geçtin' : me.role === 'voter' ? 'Seyircisin' : 'Oyuncusun'}
        </p>
        <Note className="mt-1">
          {isBye
            ? 'Rakipleri izle ve puanla; sonraki tura doğrudan geçtin.'
            : me.role === 'voter'
              ? 'Gönderi yapmazsın; her gönderiyi 1–5 puanlarsın.'
              : 'Bu turda gönderi yapmıyorsun; puanlamaya hazırlan.'}
        </Note>
        {votesThisRound === false ? (
          <Note className="mt-2 text-danger">
            Bu tura geç katıldın; puanlamaya sonraki turdan itibaren başlayacaksın.
          </Note>
        ) : null}
      </Card>

      <ProgressBar value={readyCount} max={players.length} label="oyuncu seçti" />

      <section aria-label="Eşleşmeler" className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Eşleşmeler</p>
        {view.matches.map((match, index) => {
          const names = match.map(
            (id) => view.participants.find((p) => p.id === id)?.nickname ?? '?',
          );
          const marks = match.map(
            (id) => view.participants.find((p) => p.id === id)?.ready ?? false,
          );
          return (
            <div
              key={index}
              className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3"
            >
              <span className="font-display text-lg uppercase">
                {names[0]} <span className="text-muted">–</span> {names[1]}
              </span>
              <span className="flex items-center gap-1" aria-label={`Hazır durumu: ${marks.filter(Boolean).length}/2`}>
                {marks.map((ready, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className={
                      ready
                        ? 'flex h-6 w-6 items-center justify-center rounded-full bg-success/20 text-xs font-bold text-success'
                        : 'flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-xs text-muted'
                    }
                  >
                    {ready ? '✓' : '·'}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
        {view.byes.length > 0 ? (
          <p className="text-sm text-muted">
            {view.byes
              .map((id) => view.participants.find((p) => p.id === id)?.nickname ?? '?')
              .join(', ')}{' '}
            bay geçti.
          </p>
        ) : null}
      </section>

      <div className="mt-auto">
        <LiveStatus message={`${readyCount} / ${players.length} oyuncu seçimini tamamladı.`} />
        <button
          type="button"
          onClick={onBrowseLibrary}
          className="min-h-12 w-full rounded-md border border-line bg-surface font-bold transition-colors hover:border-accent"
        >
          Kütüphaneye göz at
        </button>
      </div>
    </Screen>
  );
}
