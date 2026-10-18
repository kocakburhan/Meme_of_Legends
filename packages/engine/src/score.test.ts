import { describe, expect, it } from 'vitest';
import { compareScores } from './score.js';
import { finish, settleOvertime, settleRegular } from './competition.js';
import { project } from './index.js';
import { Game } from './test-helpers.js';

// Unlike 1/3 + 1/3 + 1/3 on IEEE doubles, this sum actually differs from 1.
const roundedOne = Array.from({ length: 10 }, () => 0.1).reduce((a, b) => a + b, 0);
const low = 1 + Number.EPSILON;

describe('roundoff-safe score decisions', () => {
  it('compares sums symmetrically without hiding meaningful differences', () => {
    expect(compareScores(1 / 3 + 1 / 3 + 1 / 3, 1)).toBe(0);
    expect(roundedOne).not.toBe(1);
    expect(compareScores(roundedOne, 1)).toBe(0);
    expect(compareScores(1, roundedOne)).toBe(0);
    expect(compareScores(15 + Number.EPSILON * 16, 15)).toBe(0);
    expect(compareScores(1 + 1 / 364, 1)).toBe(1);
    expect(compareScores(1, 1 + 1 / 364)).toBe(-1);
  });

  it('keeps elimination match ties and overtime draws', () => {
    const g = new Game({ mode: 'elimination' }).start();
    g.round.scores = { p0: { average: 1, votes: 3 }, p1: { average: low, votes: 3 } };
    settleRegular(g.state, g.round, []);
    expect(g.state.stage.tieGroups).toHaveLength(1);
    const overtime = structuredClone(g.round);
    overtime.kind = 'overtime';
    overtime.tieGroups = [['p0', 'p1']];
    const events: typeof g.events = [];
    settleOvertime(g.state, overtime, events);
    expect(events.some((e) => e.type === 'drawPerformed')).toBe(true);
  });

  it('shares live and final league ranks despite accumulated roundoff', () => {
    const g = new Game({}, 3).start();
    g.state.stage.leagueTotals = { p0: 5, p1: 1, p2: low };
    expect(project(g.state, { kind: 'manager' }, g.ctx).table.map((x) => x.rank)).toEqual([
      1, 2, 2,
    ]);
    g.state.stage.champion = 'p0';
    finish(g.state, 'completed', []);
    expect(g.state.result!.ranking.map((x) => x.rank)).toEqual([1, 2, 2]);
  });

  it('resolves roundoff at the hybrid qualification boundary and seeding', () => {
    const g = new Game({ mode: 'hybrid' }, 5).start();
    g.round.locked = true;
    g.state.stage.round = 5;
    g.round.scores = Object.fromEntries(
      ['p0', 'p1', 'p2', 'p3', 'p4'].map((id, i) => [
        id,
        { average: i < 3 ? 5 - i : i === 3 ? 1 : low, votes: 3 },
      ]),
    );
    settleRegular(g.state, g.round, []);
    expect(g.state.stage.tieGroups).toEqual([['p3', 'p4']]);
    g.state.stage.resolved = [['p3', 'p4']];
    g.round.scores.p1!.average = 5 + Number.EPSILON * 4;
    const events: typeof g.events = [];
    settleRegular(g.state, g.round, events);
    expect(events.some((e) => e.type === 'drawPerformed' && e.context === 'seeding')).toBe(true);
  });

  it('uses league totals as the hybrid match tiebreaker after tied sums', () => {
    const g = new Game({ mode: 'hybrid' }, 4).start();
    g.round.context = 'final';
    g.round.matches = [['p0', 'p1']];
    g.round.byes = [];
    g.round.players = ['p0', 'p1'];
    g.round.locked = true;
    g.round.scores = { p0: { average: 1, votes: 3 }, p1: { average: low, votes: 3 } };
    g.state.stage.round = 3;
    g.state.stage.leagueTotals = { p0: 10, p1: 9 };
    settleRegular(g.state, g.round, []);
    expect(g.state.stage.champion).toBe('p0');
    g.state.stage.leagueTotals.p1 = 10 + Number.EPSILON * 8;
    settleRegular(g.state, g.round, []);
    expect(g.state.stage.tieGroups).toEqual([['p0', 'p1']]);
  });
});
