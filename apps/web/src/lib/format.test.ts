import { describe, expect, it } from 'vitest';
import type { View } from '@mol/engine';

import { fakeResultsView } from '@/lib/fake';
import { formatClock, isFinalRoundResults, remainingSeconds } from './format';

const NOW = 1_000_000;

function leagueResults(roundNo: number, topScores: [number, number]): View {
  const view = fakeResultsView(NOW, 'league');
  const [, second] = view.table;
  const table = [...view.table];
  if (second) {
    table[0] = { ...table[0]!, score: topScores[0] };
    table[1] = { ...second, score: topScores[1] };
  }
  return { ...view, phase: { kind: 'results', roundNo, endsAt: NOW + 15_000 }, table };
}

describe('remainingSeconds', () => {
  it('tam sayıya yuvarlar ve negatif olmaz', () => {
    expect(remainingSeconds(NOW + 15_181, NOW)).toBe(16);
    expect(remainingSeconds(NOW + 15_000, NOW)).toBe(15);
    expect(remainingSeconds(NOW + 499, NOW)).toBe(1);
    expect(remainingSeconds(NOW - 5_000, NOW)).toBe(0);
  });

  it('formatClock ondalık saniye göstermez', () => {
    expect(formatClock(15.181449951171874)).toBe('0:15');
  });
});

describe('isFinalRoundResults', () => {
  it('son olmayan lig turu "sonraki tur" der', () => {
    expect(isFinalRoundResults(leagueResults(3, [18.4, 17.1]))).toBe(false);
  });

  it('lig son turu (beraberlik yok) final der', () => {
    expect(isFinalRoundResults(leagueResults(10, [18.4, 17.1]))).toBe(true);
  });

  it('lig son turunda tablo başı beraberse uzatma gelir, final denmez', () => {
    expect(isFinalRoundResults(leagueResults(10, [18.4, 18.4]))).toBe(false);
  });

  it('lig son turunu izleyen uzatma turunun sonucu kesinleştirir', () => {
    expect(isFinalRoundResults(leagueResults(11, [18.4, 18.4]))).toBe(true);
  });

  it('elemede tek kazanan kaldıysa final der, beraberli düello uzatır', () => {
    const view = fakeResultsView(NOW, 'elimination');
    const base = { ...view, phase: { kind: 'results' as const, roundNo: 4, endsAt: NOW + 15_000 } };
    expect(
      isFinalRoundResults({
        ...base,
        stage: { context: 'elimination', round: 2, contenders: ['p2'] },
      }),
    ).toBe(true);
    expect(
      isFinalRoundResults({
        ...base,
        stage: { context: 'elimination', round: 2, contenders: ['p2', 'p4'] },
      }),
    ).toBe(false);
    const equalSubs: View['submissions'] = [
      { id: 's2', media: null, hidden: false, playerId: 'p2', score: { average: 4, votes: 10 } },
      { id: 's5', media: null, hidden: false, playerId: 'p5', score: { average: 4, votes: 10 } },
    ];
    const tied = {
      ...view,
      phase: base.phase,
      matches: [['p2', 'p5']] as View['matches'],
      submissions: equalSubs,
    };
    expect(
      isFinalRoundResults({ ...tied, stage: { context: 'elimination', round: 2, contenders: [] } }),
    ).toBe(false);
  });

  it('hibrit yarı finalden sonra tur var; final bağlamının üçüncü turu biter', () => {
    const view = fakeResultsView(NOW, 'elimination');
    const phase = { kind: 'results' as const, roundNo: 8, endsAt: NOW + 15_000 };
    expect(
      isFinalRoundResults({
        ...view,
        phase,
        stage: { context: 'semifinal', round: 3, contenders: ['p2', 'p4'] },
      }),
    ).toBe(false);
    expect(
      isFinalRoundResults({
        ...view,
        phase,
        stage: { context: 'final', round: 2, contenders: ['p2', 'p4'] },
      }),
    ).toBe(false);
    expect(
      isFinalRoundResults({
        ...view,
        phase,
        stage: { context: 'final', round: 3, contenders: ['p2'] },
      }),
    ).toBe(true);
  });

  it('results dışı fazlarda false', () => {
    const view = fakeResultsView(NOW, 'league');
    expect(
      isFinalRoundResults({ ...view, phase: { kind: 'draw', roundNo: 10, endsAt: NOW + 4_000 } }),
    ).toBe(false);
  });
});
