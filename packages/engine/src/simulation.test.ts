import { describe, expect, it } from 'vitest';
import { createSession, DEFAULT_TIMING, project, nextDeadline, reduce } from './index.js';
import type { Command, Ctx, EngineState, Mode, Participant } from './index.js';

/** Reproducible generated command traces, with the seed printed on failure. No external entropy. */
function generator(seed: number) {
  let value = seed >>> 0;
  return (limit: number) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return Math.floor((value / 4294967296) * limit);
  };
}
function participant(id: string, role: 'player' | 'voter'): Participant {
  return {
    id,
    nickname: id,
    role,
    status: 'active',
    connected: true,
    votingFromRound: 1,
    byeCount: 0,
    joinedAt: 0,
    needsNickname: false,
    eliminated: false,
    withdrawn: false,
  };
}
function population(seed: number, mode: Mode, gen: ReturnType<typeof generator>) {
  // Mostly small rooms, with every tenth trace sampling the full capacity range.
  // Explicit boundary traces ensure that both extremes actually run, not just get generated.
  const large = seed % 10 === 0;
  let players = 2 + gen(large ? 63 : 7);
  let voters = gen(large ? 301 : 9);
  if (seed === 7919) {
    players = 64;
    voters = 300;
  }
  if (seed === 15838) {
    players = 2;
    voters = 0;
  }
  return { players: mode === 'hybrid' ? Math.max(4, players) : players, voters };
}
function simulate(seed: number, mode: Mode) {
  const gen = generator(seed);
  const { players: count, voters } = population(seed, mode, gen);
  const ctx: Ctx = {
    now: 0,
    timing: DEFAULT_TIMING,
    prompts: Array.from({ length: 3 }, (_, i) => ({
      id: `q${i}`,
      text: `Durum ${i}`,
      owner: 'platform',
    })),
  };
  let state = createSession({ seed, config: { mode, leagueRounds: 1 + gen(3) } }, ctx);
  // Hydration fixture avoids spending simulation time on O(n²) lobby joins (covered in scenarios).
  for (let i = 0; i < count; i++) state.participants[`p${i}`] = participant(`p${i}`, 'player');
  for (let i = 0; i < voters; i++) state.participants[`v${i}`] = participant(`v${i}`, 'voter');
  const status = () => state.status;
  let steps = 0;
  const run = (command: Command) => {
    if (++steps > 2200) throw new Error(`Nontermination: seed=${seed}, mode=${mode}`);
    const before = JSON.stringify(state);
    const result = reduce(state, command, ctx);
    if (JSON.stringify(state) !== before) throw new Error('Input mutation');
    const serialized = JSON.stringify(result);
    // Restore the *input* each time: compares original objects against JSON recovery on every command.
    const replay = reduce(JSON.parse(before) as EngineState, command, ctx);
    if (serialized !== JSON.stringify(replay)) throw new Error(`Nondeterminism: ${seed}`);
    if (result.state.status !== 'finished' && result.state.status !== 'terminated') {
      for (const previous of state.rounds.filter((round) => round.locked)) {
        if (JSON.stringify(previous) !== JSON.stringify(result.state.rounds[previous.no - 1]))
          throw new Error('Locked round mutation');
      }
    }
    state = result.state;
    if (JSON.stringify(JSON.parse(JSON.stringify(state))) !== JSON.stringify(state))
      throw new Error('Non JSON state');
    const round = state.rounds.at(-1);
    if (round) {
      for (const [subId, raters] of Object.entries(round.eligibility)) {
        const owner = round.submissions[subId]!.playerId;
        if (raters.includes(owner)) throw new Error('Own rating');
        const pair = round.matches.find((m) => m.includes(owner));
        // A snapshot is either entirely neutral, or contains only the opposing duelist under the exception.
        if (
          pair &&
          raters.some((id) => pair.includes(id)) &&
          raters.some((id) => !pair.includes(id))
        )
          throw new Error('Duel exception violated');
      }
      if (!round.locked) {
        for (const viewer of [
          { kind: 'display' },
          { kind: 'participant', participantId: 'p0' },
        ] as const) {
          const view = project(state, viewer, ctx);
          if (view.submissions.some((sub) => 'playerId' in sub || 'score' in sub))
            throw new Error('Sender/score leak');
          if ('ratings' in view || 'rng' in view || 'promptPreview' in view)
            throw new Error('Private state leak');
        }
      }
    }
    return result.nextDeadline;
  };
  run({ type: 'start' });
  while (status() !== 'finished' && status() !== 'terminated') {
    if (status() === 'paused') {
      ctx.now += gen(100000);
      run({ type: gen(2) ? 'restore' : 'tick' });
      run({ type: 'resume' });
      continue;
    }
    const r = state.rounds.at(-1)!;
    // Random failures/admin interventions, bounded so manual controls cannot postpone forever.
    if (gen(20) === 0) run({ type: 'pause' });
    if (status() === 'paused') continue;
    if (gen(25) === 0) run({ type: 'restore' });
    if (gen(12) === 0) {
      const ids = Object.keys(state.participants);
      const id = ids[gen(ids.length)]!;
      const p = state.participants[id]!;
      if (p.status === 'active')
        run({ type: 'connection', participantId: id, connected: !p.connected });
    }
    if (gen(25) === 0) {
      const ids = Object.keys(state.participants).filter(
        (id) => state.participants[id]!.status === 'active',
      );
      const id = ids[gen(ids.length)];
      if (id) run({ type: gen(2) ? 'kick' : 'moveToVoter', participantId: id });
    }
    if (status() === 'finished' || status() === 'terminated') break;
    if (state.phase.kind === 'selection') {
      const submitters = r.players.filter(
        (id) =>
          state.participants[id]!.role === 'player' && state.participants[id]!.status === 'active',
      );
      // Sparse ballots cover absent submitters while keeping thousands of large rooms inexpensive.
      for (let n = 0; n < Math.min(3, submitters.length); n++) {
        const id = submitters[gen(submitters.length)]!;
        run({
          type: 'select',
          participantId: id,
          media: gen(4)
            ? {
                source: 'system',
                memeId: 'm',
                mediaType: gen(3) ? 'image' : 'video',
                durationMs: 25000,
              }
            : { source: 'upload', uploadId: 'u', mediaType: 'gif' },
        });
        if (gen(2)) run({ type: 'confirm', participantId: id });
      }
      if (gen(5) === 0) run({ type: 'replacePrompt' });
      if (gen(5) === 0) run({ type: 'addTime', seconds: 15 });
    } else if (state.phase.kind === 'presentation') {
      const subId = r.order[state.phase.index]!;
      const raters = r.eligibility[subId] ?? [];
      if (raters.length)
        run({
          type: 'rate',
          participantId: raters[gen(raters.length)]!,
          submissionId: subId,
          score: (1 + gen(5)) as 1 | 2 | 3 | 4 | 5,
        });
      if (gen(6) === 0) run({ type: 'hideCurrent' });
    } else if (state.phase.kind === 'review') {
      const subs = Object.values(r.submissions).filter((sub) => !sub.invalid);
      const sub = subs[gen(subs.length)];
      const raters = sub ? (r.eligibility[sub.id] ?? []) : [];
      if (sub && raters.length) {
        const id = raters[gen(raters.length)]!;
        run({
          type: 'rate',
          participantId: id,
          submissionId: sub.id,
          score: (1 + gen(5)) as 1 | 2 | 3 | 4 | 5,
        });
        run({ type: 'finishReview', participantId: id });
      }
      if (gen(3) === 0) run({ type: 'closeReview' });
    }
    const deadline = nextDeadline(state, ctx);
    if (deadline !== null) {
      ctx.now = Math.max(ctx.now, deadline) + gen(100);
      run({ type: 'tick' });
    } else if (status() !== 'finished' && status() !== 'terminated')
      throw new Error('No deadline in running game');
  }
  if (!state.result) throw new Error('Missing result');
  const ranks = state.result.ranking;
  if (new Set(ranks.map((x) => x.participantId)).size !== ranks.length)
    throw new Error('Duplicate ranking');
  if (state.result.champion && state.participants[state.result.champion]!.withdrawn)
    throw new Error('Withdrawn champion');
  return { players: count, voters, steps };
}

describe('generated full-game invariants (2–64 players, 0–300 voters)', () => {
  for (const mode of ['elimination', 'league', 'hybrid'] as const) {
    for (let batch = 0; batch < 7; batch++) {
      it(`${mode}: generated traces ${batch * 100 + 1}–${(batch + 1) * 100}`, () => {
        for (let seed = batch * 100 + 1; seed <= (batch + 1) * 100; seed++) {
          try {
            simulate(seed * 7919, mode);
          } catch (error) {
            throw new Error(`Simulation failed: mode=${mode}, seed=${seed * 7919}`, {
              cause: error,
            });
          }
        }
      }, 120000);
    }
    it(`${mode}: generation covers both population boundaries`, () => {
      const sizes = new Set<number>(),
        audiences = new Set<number>();
      for (let seed = 1; seed <= 700; seed++) {
        const gen = generator(seed * 7919);
        const { players, voters } = population(seed * 7919, mode, gen);
        sizes.add(players);
        audiences.add(voters);
      }
      expect(sizes.has(64)).toBe(true);
      expect(sizes.has(mode === 'hybrid' ? 4 : 2)).toBe(true);
      expect(audiences.has(0)).toBe(true);
      expect(audiences.has(300)).toBe(true);
    });
  }
});
