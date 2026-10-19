import type { SessionConfig, View } from '@mol/engine';
import { estimateDuration } from '@mol/engine';

/** mm:ss biçimli kalan süre (büyük Anton rakamlar için). */
export function formatClock(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

/** Faz bitişine kalan tam saniye; ondalık saniye hiçbir yüzeyde görünmez. */
export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * Bu `results` fazından sonra oyun bitiyor mu? Motor `stage.pending`'i
 * görünümle taşımaz; mod ve aşama kurallarından türetilir: lig modunda son
 * lig turu, elemede tek kazanan kalan son tur, hibritte final bağlamının
 * üçüncü turu. Uzatma gerektiren eşitlikler "bitti" sayılmaz.
 */
export function isFinalRoundResults(view: View): boolean {
  const phase = view.phase;
  if (phase.kind !== 'results') return false;
  // Düello bağlamlarında (eleme, yarı final, final) beraberlik uzatma turu açar.
  const duelTied = view.matches.some(([a, b]) => {
    const scoreA = view.submissions.find((s) => s.playerId === a)?.score;
    const scoreB = view.submissions.find((s) => s.playerId === b)?.score;
    return !!scoreA && !!scoreB && scoreA.average === scoreB.average;
  });
  switch (view.config.mode) {
    case 'league': {
      // Lig toplamında başa yakın beraberlik uzatma ister; son turun ardından
      // gelen uzatma turunun kendisi ise sonucu kesinleştirir.
      const topTied = view.table.length > 1 && view.table[0]!.score === view.table[1]!.score;
      return (
        phase.roundNo > view.config.leagueRounds ||
        (phase.roundNo === view.config.leagueRounds && !topTied)
      );
    }
    case 'elimination':
      return (view.stage.contenders?.length ?? 0) <= 1 && !duelTied;
    case 'hybrid':
      return (
        view.stage.context === 'final' &&
        view.stage.round >= 3 &&
        (view.stage.contenders?.length ?? 0) <= 1 &&
        !duelTied
      );
  }
}

/** Ortalama puan: 2 ondalık, Türkçe virgül (SPEC 8.2). */
export function formatScore(value: number): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Tahmini oyun süresi aralığı: "45–70 dk" / "45 dk" (SPEC 4.3). */
export function formatEstimatedDuration(config: SessionConfig, playerCount: number): string | null {
  const { minMs, maxMs } = estimateDuration(config, playerCount);
  if (maxMs <= 0) return null;
  const min = Math.max(1, Math.round(minMs / 60_000));
  const max = Math.max(min, Math.round(maxMs / 60_000));
  return min === max ? `~${min} dk` : `${min}–${max} dk`;
}

export const MODE_LABELS: Record<SessionConfig['mode'], string> = {
  elimination: 'Eleme',
  league: 'Lig',
  hybrid: 'Hibrit',
};
