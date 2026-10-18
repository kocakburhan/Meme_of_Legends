import type { View } from '@mol/engine';
import { Card, Note, Screen } from '@/components/ui';
import { formatScore } from '@/lib/format';

function nicknameOf(view: View, id: string): string {
  return view.participants.find((p) => p.id === id)?.nickname ?? '?';
}

/**
 * Oyun sonu (SPEC 4.5): şampiyon, kürsü (1-2-3), jüri ödülleri, tam sıralama
 * ve rövanş bekleme notu. Şampiyonda kısa konfeti + sabit sonuç (SPEC 16A.3).
 */
export function GameOverScreen({
  view,
  className,
}: {
  view: View;
  className?: string;
}) {
  const result = view.result;
  const top3 = (result?.ranking ?? []).slice(0, 3);

  return (
    <Screen className={className}>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Oyun bitti</p>
        <h1 className="font-display text-4xl uppercase leading-none">
          Şampiyon: <span className="text-accent">{result?.champion ? nicknameOf(view, result.champion) : 'Yok'}</span>
        </h1>
      </div>

      <section aria-label="Kürsü" className="flex items-end justify-center gap-2 pt-2">
        {[2, 1, 0].map((slot) => {
          const entry = top3[slot];
          if (!entry) return null;
          const heights = ['h-24', 'h-32', 'h-20'];
          return (
            <div key={entry.participantId} className="flex flex-1 flex-col items-center gap-1">
              <span className="font-display text-lg uppercase">{nicknameOf(view, entry.participantId)}</span>
              <div
                className={
                  slot === 1
                    ? `flex w-full items-start justify-center rounded-t-[var(--radius-card)] border border-accent bg-accent/20 ${heights[slot]}`
                    : `flex w-full items-start justify-center rounded-t-[var(--radius-card)] border border-line bg-surface ${heights[slot]}`
                }
              >
                <span className="font-display text-3xl pt-2">{slot + 1}</span>
              </div>
            </div>
          );
        })}
      </section>

      {result?.jury ? (
        <section aria-label="Jüri ödülleri" className="grid grid-cols-2 gap-2">
          <Card className="text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">En sert jüri</p>
            <p className="font-display text-lg uppercase">{result.jury.harshest[0]?.nickname ?? '—'}</p>
            {result.jury.harshest[0] ? (
              <p className="text-sm text-muted">{formatScore(result.jury.harshest[0].average)} ort.</p>
            ) : null}
          </Card>
          <Card className="text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">En cömert jüri</p>
            <p className="font-display text-lg uppercase">{result.jury.mostGenerous[0]?.nickname ?? '—'}</p>
            {result.jury.mostGenerous[0] ? (
              <p className="text-sm text-muted">{formatScore(result.jury.mostGenerous[0].average)} ort.</p>
            ) : null}
          </Card>
        </section>
      ) : null}

      <section aria-label="Tam sıralama">
        <h2 className="mb-2 font-display text-lg uppercase">Tam sıralama</h2>
        <ol className="flex flex-col gap-1">
          {(result?.ranking ?? []).map((row) => (
            <li
              key={row.participantId}
              className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm"
            >
              <span>
                <span className="font-display mr-2 text-muted">{row.rank}.</span>
                {nicknameOf(view, row.participantId)}
              </span>
              <span className="font-display">{formatScore(view.table.find((t) => t.participantId === row.participantId)?.score ?? 0)}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-auto">
        <Card className="border-dashed text-center">
          <Note>
            Yönetici rövanş açarsa buradan devam edersin; odaya bağlı kal, çıkmak yok.
          </Note>
        </Card>
      </div>
    </Screen>
  );
}
