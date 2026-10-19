import { compareScores } from './score.js';
import { shuffle } from './random.js';
import type { EngineState, EngineEvent, FinalResult, Ranking, Round } from './types.js';

export function activePlayers(s: EngineState): string[] {
  return Object.values(s.participants)
    .filter((p) => p.status === 'active' && p.role === 'player')
    .map((p) => p.id);
}
export function currentRound(s: EngineState): Round | undefined {
  return s.rounds.at(-1);
}
export function eligibleParticipant(s: EngineState, id: string, round: Round): boolean {
  const p = s.participants[id];
  return !!p && p.status === 'active' && p.votingFromRound <= round.no;
}
/** Connected participants who can still review at least one valid submission. */
export function reviewParticipants(s: EngineState, r: Round): string[] {
  return Object.keys(s.participants).filter(
    (id) =>
      s.participants[id]!.connected &&
      eligibleParticipant(s, id, r) &&
      Object.entries(r.eligibility).some(
        ([subId, ids]) =>
          ids.includes(id) && !r.submissions[subId]!.invalid && !r.submissions[subId]!.hidden,
      ),
  );
}
export function eliminate(s: EngineState, id: string, score: number, events: EngineEvent[]): void {
  const p = s.participants[id]!;
  if (p.withdrawn) return;
  p.role = 'voter';
  p.eliminated = true;
  s.stage.eliminated[id] = { round: s.rounds.length, score };
  events.push({ type: 'eliminated', participantId: id });
}
export function scoreRound(r: Round): void {
  for (const id of r.players) {
    const sub = Object.values(r.submissions).find((x) => x.playerId === id);
    const values =
      sub && !sub.invalid && !sub.hidden
        ? Object.values(r.ratings).flatMap((v) => (v[sub.id] === undefined ? [] : [v[sub.id]!]))
        : [];
    r.scores[id] = {
      average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      votes: values.length,
    };
  }
}
/** Compensations are derived at stage boundaries; locked votes and original scores stay immutable. */
export function stageTotals(s: EngineState, context: Round['context']): Record<string, number> {
  const rounds = s.rounds.filter((r) => r.kind === 'regular' && r.context === context && r.locked);
  const totals: Record<string, number> = {};
  for (const id of Object.keys(s.participants)) {
    const played = rounds.filter((r) => r.players.includes(id));
    const normal = played.filter(
      (r) => !Object.values(r.submissions).some((x) => x.playerId === id && x.compensation),
    );
    const average = normal.length
      ? normal.reduce((n, r) => n + (r.scores[id]?.average ?? 0), 0) / normal.length
      : 0;
    totals[id] = played.reduce(
      (n, r) =>
        n +
        (Object.values(r.submissions).some((x) => x.playerId === id && x.compensation)
          ? average
          : (r.scores[id]?.average ?? 0)),
      0,
    );
  }
  return totals;
}
function orderBy(s: EngineState, ids: string[], totals: Record<string, number>): string[] {
  return [...ids].sort(
    (a, b) => compareScores(totals[b] ?? 0, totals[a] ?? 0) || resolvedCompare(s, a, b),
  );
}
function resolvedCompare(s: EngineState, a: string, b: string): number {
  for (const group of s.stage.resolved)
    if (group.includes(a) && group.includes(b)) return group.indexOf(a) - group.indexOf(b);
  return 0;
}
function matchWinners(
  s: EngineState,
  r: Round,
  totals: Record<string, number>,
): { winners: string[]; losers: string[]; ties: string[][] } {
  const winners = [...r.byes],
    losers: string[] = [],
    ties: string[][] = [];
  for (const pair of r.matches) {
    const alive = pair.filter((id) => !s.participants[id]!.withdrawn);
    if (alive.length < 2) {
      winners.push(...alive);
      continue;
    }
    const [a, b] = pair;
    const hidden =
      r.context === 'elimination' &&
      pair.some((id) =>
        Object.values(r.submissions).some((x) => x.playerId === id && x.compensation),
      );
    let diff = hidden ? 0 : compareScores(totals[a] ?? 0, totals[b] ?? 0);
    if (!diff && (r.context === 'semifinal' || r.context === 'final'))
      diff = compareScores(s.stage.leagueTotals[a] ?? 0, s.stage.leagueTotals[b] ?? 0);
    if (!diff && !resolvedCompare(s, a, b)) ties.push(pair);
    else {
      const winner = diff ? (diff > 0 ? a : b) : resolvedCompare(s, a, b) < 0 ? a : b;
      winners.push(winner);
      losers.push(winner === a ? b : a);
    }
  }
  return { winners, losers, ties };
}
/** Called once at lock, then again after one shared overtime has resolved its groups. */
export function settleRegular(s: EngineState, r: Round, events: EngineEvent[]): void {
  const st = s.stage;
  st.tieGroups = [];
  if (r.context === 'league') {
    st.leagueTotals = stageTotals(s, 'league');
    const target = s.config.mode === 'hybrid' ? 5 : s.config.leagueRounds;
    if (st.round < target && !(s.config.mode === 'hybrid' && activePlayers(s).length < 4)) {
      st.pending = 'next';
      return;
    }
    const ids = orderBy(s, activePlayers(s), st.leagueTotals);
    st.leagueOrder = ids;
    const qualifying = s.config.mode === 'hybrid' && ids.length >= 4;
    const boundary = qualifying ? 3 : 0;
    const tied = ids.filter(
      (id) => compareScores(st.leagueTotals[id] ?? 0, st.leagueTotals[ids[boundary]!] ?? 0) === 0,
    );
    const crosses = qualifying ? tied.some((id) => ids.indexOf(id) > 3) : tied.length > 1;
    if (crosses && !tied.every((id, i) => !i || resolvedCompare(s, tied[0]!, id))) {
      st.tieGroups = [tied];
      st.champion = null;
      st.pending = qualifying ? 'semifinal' : 'finish';
      return;
    }
    if (qualifying) {
      // First-four seeding ties use a draw, independently of the qualification overtime.
      const top = ids.slice(0, 4);
      const grouped = new Set<string>();
      for (const id of top) {
        if (grouped.has(id)) continue;
        const group = top.filter(
          (other) => compareScores(st.leagueTotals[other] ?? 0, st.leagueTotals[id] ?? 0) === 0,
        );
        group.forEach((member) => grouped.add(member));
        if (group.length > 1 && !group.some((id) => st.resolved.some((g) => g.includes(id)))) {
          const ordered = shuffle(s, group);
          st.resolved.push(ordered);
          events.push({ type: 'drawPerformed', context: 'seeding', order: ordered });
          currentRound(s)!.needsDraw = true;
        }
      }
      st.leagueOrder = orderBy(s, ids, st.leagueTotals);
      st.pending = 'semifinal';
      st.qualified = true;
      st.contenders = st.leagueOrder.slice(0, 4);
      for (const id of activePlayers(s))
        if (!st.contenders.includes(id)) eliminate(s, id, st.leagueTotals[id] ?? 0, events);
    } else {
      st.champion = ids[0] ?? null;
      st.pending = 'finish';
    }
    return;
  }
  if (
    r.context !== 'elimination' &&
    st.round < 3 &&
    r.matches.some((m) => m.every((id) => !s.participants[id]!.withdrawn))
  ) {
    st.pending = 'next';
    return;
  }
  const totals =
    r.context === 'elimination'
      ? Object.fromEntries(Object.entries(r.scores).map(([id, x]) => [id, x.average]))
      : stageTotals(s, r.context);
  st.matchTotals = totals;
  const outcome = matchWinners(s, r, totals);
  st.tieGroups = outcome.ties;
  if (outcome.ties.length) return;
  for (const id of outcome.losers) eliminate(s, id, totals[id] ?? 0, events);
  st.contenders = outcome.winners;
  if (r.context === 'semifinal') {
    st.semifinalLosers = outcome.losers;
    st.pending = 'final';
  } else if (outcome.winners.length <= 1) {
    st.champion = outcome.winners[0] ?? null;
    st.finalLoser = outcome.losers[0] ?? null;
    st.pending = 'finish';
  } else st.pending = 'next';
}
export function settleOvertime(s: EngineState, r: Round, events: EngineEvent[]): void {
  for (const group of r.tieGroups) {
    const alive = group.filter((id) => !s.participants[id]!.withdrawn);
    const ordered = [...alive].sort((a, b) =>
      compareScores(r.scores[b]?.average ?? 0, r.scores[a]?.average ?? 0),
    );
    const result: string[] = [];
    while (ordered.length) {
      const value = r.scores[ordered[0]!]!.average;
      const equal = ordered.filter((id) => compareScores(r.scores[id]!.average, value) === 0);
      ordered.splice(0, equal.length);
      const draw = shuffle(s, equal);
      result.push(...draw);
      if (equal.length > 1) {
        r.needsDraw = true;
        events.push({ type: 'drawPerformed', order: draw });
      }
    }
    s.stage.resolved.push(result);
    r.resolution.push(result);
  }
  const regular = [...s.rounds].reverse().find((x) => x.kind === 'regular')!;
  settleRegular(s, regular, events);
}
function jury(s: EngineState): FinalResult['jury'] {
  const ballots: Record<string, number[]> = {};
  for (const r of s.rounds.filter((r) => r.kind === 'regular' && r.locked)) {
    for (const [id, votes] of Object.entries(r.ratings)) {
      for (const [subId, score] of Object.entries(votes)) {
        const sub = r.submissions[subId];
        if (sub && !sub.invalid && !sub.hidden) (ballots[id] ??= []).push(score);
      }
    }
  }
  const entries = Object.entries(ballots)
    .filter(([, v]) => v.length >= 5)
    .map(([id, v]) => ({
      nickname: s.participants[id]!.nickname,
      average: v.reduce((a, b) => a + b, 0) / v.length,
    }));
  if (entries.length < 2) return null;
  const min = Math.min(...entries.map((x) => x.average)),
    max = Math.max(...entries.map((x) => x.average));
  // SPEC-QUESTION: All eligible jury averages equal: suppress both awards to avoid awarding both to the same people.
  if (compareScores(min, max) === 0) return null;
  return {
    harshest: entries.filter((x) => compareScores(x.average, min) === 0),
    mostGenerous: entries.filter((x) => compareScores(x.average, max) === 0),
  };
}
export function finish(s: EngineState, reason: FinalResult['reason'], events: EngineEvent[]): void {
  const st = s.stage;
  let ids = Object.values(s.participants)
    .filter((p) => !p.withdrawn && (p.role === 'player' || p.eliminated))
    .map((p) => p.id);
  let compare: (a: string, b: string) => number;
  if (s.config.mode === 'league' || (s.config.mode === 'hybrid' && !st.qualified))
    compare = (a, b) =>
      compareScores(st.leagueTotals[b] ?? 0, st.leagueTotals[a] ?? 0) || resolvedCompare(s, a, b);
  else if (s.config.mode === 'hybrid') {
    const priority = (id: string) =>
      id === st.champion ? 0 : id === st.finalLoser ? 1 : st.semifinalLosers.includes(id) ? 2 : 3;
    compare = (a, b) =>
      priority(a) - priority(b) || compareScores(st.leagueTotals[b] ?? 0, st.leagueTotals[a] ?? 0);
  } else
    compare = (a, b) =>
      (st.eliminated[b]?.round ?? Infinity) - (st.eliminated[a]?.round ?? Infinity) ||
      compareScores(st.eliminated[b]?.score ?? 0, st.eliminated[a]?.score ?? 0);
  ids = ids.sort((a, b) => (a === st.champion ? -1 : b === st.champion ? 1 : compare(a, b)));
  const ranking: Ranking[] = [];
  ids.forEach((id, i) =>
    ranking.push({
      participantId: id,
      rank:
        i && compare(ids[i - 1]!, id) === 0 && id !== st.champion && ids[i - 1] !== st.champion
          ? ranking[i - 1]!.rank
          : i + 1,
      score:
        st.leagueTotals[id] ??
        st.eliminated[id]?.score ??
        [...s.rounds].reverse().find((r) => r.kind === 'regular' && r.players.includes(id))?.scores[
          id
        ]?.average ??
        0,
    }),
  );
  s.result = { champion: st.champion, ranking, jury: jury(s), reason };
  s.status =
    reason === 'manager' || reason === 'empty' || reason === 'noPrompts'
      ? 'terminated'
      : 'finished';
  s.phase = { kind: 'finished' };
  s.pausedFrom = null;
  s.pausedAt = null;
  s.promptPreview = null;
  // Private assets are retained only as usage type; physical deletion belongs to the shell.
  for (const r of s.rounds)
    for (const sub of Object.values(r.submissions))
      if (sub.media?.source !== 'system') sub.media = null;
  events.push({ type: 'sessionFinished', result: s.result });
}
