import { describe, expect, it } from 'vitest';
import {
  createSession,
  DEFAULT_CONFIG,
  DEFAULT_TIMING,
  estimateDuration,
  mediaSlot,
  project,
} from './index.js';
import { stageTotals } from './competition.js';
import { Game } from './test-helpers.js';
import type { MediaRef, SessionConfig } from './index.js';

const image: MediaRef = { source: 'system', memeId: 'image', mediaType: 'image' };
function rejected(g: Game) {
  expect(g.events[0]?.type).toBe('commandRejected');
}

describe('lobby, settings and membership (§4–5,11)', () => {
  it.each(['league', 'elimination', 'hybrid'] as const)('%s enforces minimum roster', (mode) => {
    const g = new Game({ mode }, mode === 'hybrid' ? 3 : 1).start();
    rejected(g);
    expect(g.state.status).toBe('lobby');
  });
  it('defaults and JSON state are deterministic and independent of inputs', () => {
    const g = new Game();
    const init = { seed: 3 };
    const s = createSession(init, g.ctx);
    expect(s.config).toEqual(DEFAULT_CONFIG);
    expect(s).toEqual(createSession(init, g.ctx));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    g.ctx.prompts[0]!.text = 'Edited';
    expect(s.promptPreview?.text).not.toBe('Edited');
  });
  it('only locks mode and league round count after start; snapshots next-round settings', () => {
    const g = new Game({ leagueRounds: 2 }).start();
    g.send({ type: 'updateSettings', patch: { mode: 'elimination' } });
    rejected(g);
    g.send({ type: 'updateSettings', patch: { leagueRounds: 3 } });
    rejected(g);
    g.send({
      type: 'updateSettings',
      patch: { selectionSeconds: 90, reviewSeconds: 60, customContent: false },
    });
    expect(g.round.config.selectionSeconds).toBe(60);
    g.play({ p0: 5, p1: 3 });
    expect(g.round.config.selectionSeconds).toBe(90);
    expect(g.round.config.reviewSeconds).toBe(60);
    expect(g.round.config.customContent).toBe(false);
  });
  it.each([
    { selectionSeconds: 29 },
    { selectionSeconds: 241 },
    { reviewSeconds: 14 },
    { reviewSeconds: 121 },
    { leagueRounds: 0 },
    { leagueRounds: 51 },
  ])('rejects invalid settings %j', (patch) => {
    const g = new Game();
    const original = g.state;
    g.send({ type: 'updateSettings', patch });
    rejected(g);
    expect(g.state).toBe(original);
  });
  it('supports both approval modes and converts pending players on start', () => {
    const g = new Game({ playerApproval: true, voterApproval: true }, 3, 2);
    g.send({ type: 'approveParticipant', participantId: 'p0' });
    g.send({ type: 'approveParticipant', participantId: 'p1' });
    g.send({ type: 'rejectParticipant', participantId: 'v0' });
    expect(g.state.participants.v0!.status).toBe('left');
    g.send({ type: 'approveParticipant', participantId: 'v1' });
    g.start();
    expect(g.state.participants.p2).toMatchObject({ role: 'voter', status: 'active' });
    g.send({ type: 'join', participantId: 'new', nickname: 'Yeni', wants: 'player' });
    expect(g.state.participants.new).toMatchObject({ role: 'voter', status: 'pending' });
  });
  it('rejected players become voters and viewer admission stays private', () => {
    const g = new Game({ playerApproval: true }, 1);
    g.send({ type: 'rejectParticipant', participantId: 'p0' });
    expect(g.state.participants.p0!.role).toBe('voter');
    g.send({ type: 'updateSettings', patch: { acceptVoters: false } });
    g.send({ type: 'join', participantId: 'v1', nickname: 'Yeni', wants: 'voter' });
    rejected(g);
  });
  it('late join and late approval wait until next round; selection join can vote', () => {
    const g = new Game({}, 2).start();
    g.send({ type: 'join', participantId: 'early', nickname: 'Erken', wants: 'voter' });
    g.submitAll();
    g.send({ type: 'join', participantId: 'late', nickname: 'Geç', wants: 'voter' });
    expect(g.state.participants.early!.votingFromRound).toBe(1);
    expect(g.state.participants.late!.votingFromRound).toBe(2);
    g.toReview();
    const sub = Object.values(g.round.submissions)[0]!;
    g.send({ type: 'rate', participantId: 'late', submissionId: sub.id, score: 5 });
    rejected(g);
    g.send({ type: 'rate', participantId: 'early', submissionId: sub.id, score: 5 });
    expect(g.events[0]?.type).toBe('ratingProgress');
  });
  it.each(['a', 'a'.repeat(21), 'https://a.co', '<html>', 'Ad!'])(
    'rejects invalid nickname %s',
    (nickname) => {
      const g = new Game();
      g.send({ type: 'join', participantId: 'x', nickname, wants: 'voter' });
      rejected(g);
    },
  );
  it('supports Unicode names, case uniqueness, reset and rename', () => {
    const g = new Game();
    g.send({ type: 'join', participantId: 'x', nickname: 'Şaka 😂', wants: 'voter' });
    g.send({ type: 'join', participantId: 'y', nickname: 'şaka 😂', wants: 'voter' });
    rejected(g);
    g.send({ type: 'resetNickname', participantId: 'x' });
    expect(g.state.participants.x!.needsNickname).toBe(true);
    g.send({ type: 'changeNickname', participantId: 'x', nickname: 'Yeni Ad' });
    expect(g.state.participants.x!.needsNickname).toBe(false);
    g.send({ type: 'join', participantId: 'x', nickname: 'Başka', wants: 'voter' });
    rejected(g);
    g.send({ type: 'join', participantId: '__proto__', nickname: 'Başka', wants: 'voter' });
    rejected(g);
  });
  it('disconnect preserves player, selection and role; no automatic expulsion', () => {
    const g = new Game({ leagueRounds: 2 }).start();
    g.select('p0');
    g.send({ type: 'connection', participantId: 'p0', connected: false });
    expect(g.state.participants.p0!.role).toBe('player');
    g.send({ type: 'connection', participantId: 'p0', connected: true });
    expect(Object.values(g.round.submissions)).toHaveLength(1);
  });
  it('manager can cancel lobby or terminate game without champion', () => {
    const g = new Game();
    g.send({ type: 'endGame' });
    expect(g.state.status).toBe('terminated');
    expect(g.state.result!.champion).toBeNull();
  });
  it('player departure ends a two-player game immediately and excludes withdrawer', () => {
    const g = new Game().start();
    g.send({ type: 'leaveToVoter', participantId: 'p0' });
    expect(g.state.status).toBe('finished');
    expect(g.state.result!.champion).toBe('p1');
    expect(g.state.result!.ranking.map((x) => x.participantId)).toEqual(['p1']);
  });
  it('zero-player finish is championless', () => {
    const g = new Game().start();
    // Simulates a restored state with both players absent; a removal still honors the global <2 rule.
    g.state.participants.p1!.role = 'voter';
    g.state.participants.p1!.withdrawn = true;
    g.send({ type: 'kick', participantId: 'p0' });
    expect(g.state.result!.champion).toBeNull();
  });
  it('kick removes unlocked votes and submission, blocks identity reuse; leaving preserves votes', () => {
    const g = new Game({}, 3, 1).start();
    g.submitAll();
    g.toReview();
    const sub = Object.values(g.round.submissions).find((x) => x.playerId === 'p2')!;
    g.send({ type: 'rate', participantId: 'p0', submissionId: sub.id, score: 4 });
    g.send({ type: 'leaveToVoter', participantId: 'p0' });
    expect(g.round.ratings.p0![sub.id]).toBe(4);
    g.send({ type: 'rate', participantId: 'v0', submissionId: sub.id, score: 5 });
    g.send({ type: 'kick', participantId: 'v0' });
    expect(g.round.ratings.v0).toBeUndefined();
    g.send({ type: 'join', participantId: 'v0', nickname: 'Geri', wants: 'voter' });
    rejected(g);
  });
  it('locked historical votes survive kick', () => {
    const g = new Game({ leagueRounds: 2 }, 3, 1).start();
    g.submitAll();
    g.rateScores({ p0: 5, p1: 4, p2: 3 });
    g.close();
    const ratings = structuredClone(g.round.ratings);
    g.send({ type: 'kick', participantId: 'v0' });
    expect(g.round.ratings).toEqual(ratings);
  });
  it('expires only after ten minutes with no active connected participant, even while paused', () => {
    const g = new Game().start();
    for (const id of ['p0', 'p1'])
      g.send({ type: 'connection', participantId: id, connected: false });
    g.send({ type: 'pause' });
    g.ctx.now = 599999;
    g.send({ type: 'tick' });
    expect(g.state.status).toBe('paused');
    g.ctx.now++;
    g.send({ type: 'tick' });
    expect(g.state.result!.reason).toBe('empty');
  });
  it('reconnection resets empty-room timer; lobby has no motor lifetime', () => {
    const g = new Game().start();
    for (const id of ['p0', 'p1'])
      g.send({ type: 'connection', participantId: id, connected: false });
    g.ctx.now = 1000;
    g.send({ type: 'connection', participantId: 'p1', connected: true });
    expect(g.state.emptySince).toBeNull();
    const lobby = new Game();
    lobby.ctx.now = 100000000;
    lobby.send({ type: 'tick' });
    expect(lobby.state.status).toBe('lobby');
  });
});

describe('live prompts and replacement (§6.3–6.4)', () => {
  it('draws without replacement then from least recently used, including new live prompts', () => {
    const g = new Game({ leagueRounds: 4 }).start();
    g.ctx.prompts = [
      { id: 'a', text: 'AAA', owner: 'business' },
      { id: 'b', text: 'BBB', owner: 'platform' },
    ];
    g.play({ p0: 5, p1: 1 });
    const first = g.round.prompt.id;
    g.play({ p0: 5, p1: 1 });
    const second = g.round.prompt.id;
    expect(first).not.toBe(second);
    g.play({ p0: 5, p1: 1 });
    expect(g.round.prompt.id).toBe(first);
  });
  it('updates live preview text at start, retains historical snapshot, archives immediately affect next draw', () => {
    const g = new Game();
    const preview = g.state.promptPreview!;
    g.ctx.prompts = [{ ...preview, text: 'Yeni metin' }];
    g.start();
    expect(g.round.prompt.text).toBe('Yeni metin');
    g.ctx.prompts[0]!.text = 'Başka';
    expect(g.round.prompt.text).toBe('Yeni metin');
  });
  it('preview replacement consumes the one per round right and marks both prompts used', () => {
    const g = new Game();
    const old = g.state.promptPreview!.id;
    g.send({ type: 'replacePrompt' });
    expect(g.state.promptPreview!.id).not.toBe(old);
    expect(g.state.usedPromptIds[old]).toBeDefined();
    g.start();
    g.send({ type: 'replacePrompt' });
    rejected(g);
    expect(project(g.state, { kind: 'display' }, g.ctx)).not.toHaveProperty('promptPreview');
  });
  it('emergency replacement resets choices and selection timer; cannot be reused', () => {
    const g = new Game().start();
    const old = g.round.prompt.id;
    g.select('p0');
    g.ctx.now = 10000;
    g.send({ type: 'replacePrompt' });
    expect(g.round.prompt.id).not.toBe(old);
    expect(g.round.submissions).toEqual({});
    expect(g.state.phase).toMatchObject({ kind: 'selection', endsAt: 70000 });
    g.send({ type: 'replacePrompt' });
    rejected(g);
  });
  it('replacement window closes exactly at 15 seconds; empty pool is safe', () => {
    const g = new Game().start();
    g.ctx.now = 15000;
    g.send({ type: 'replacePrompt' });
    rejected(g);
    g.ctx.prompts = [];
    g.send({ type: 'replacePrompt' });
    rejected(g);
    const empty = new Game();
    empty.ctx.prompts = [];
    empty.start();
    rejected(empty);
  });
  it('new active prompt has priority over used prompts', () => {
    const g = new Game();
    g.ctx.prompts = [{ id: 'new', text: 'Yeni', owner: 'business' }];
    g.start();
    expect(g.round.prompt.id).toBe('new');
  });
});

describe('round pipeline, time and visibility (§7,12)', () => {
  it('confirmation can be changed before everyone confirms; last valid unconfirmed selection submits on timeout', () => {
    const g = new Game().start();
    g.select('p0', true);
    g.send({ type: 'select', participantId: 'p0', media: { ...image, memeId: 'new' } });
    expect(Object.values(g.round.submissions)[0]!.confirmed).toBe(false);
    g.advance();
    expect(g.state.phase.kind).toBe('presentation');
    expect(Object.values(g.round.submissions)[0]!.media).toMatchObject({ memeId: 'new' });
  });
  it('all confirmed ends selection early; duplicate system media are valid', () => {
    const g = new Game().start();
    g.submitAll();
    expect(g.ctx.now).toBe(0);
    expect(g.state.phase.kind).toBe('presentation');
    expect(g.round.order).toHaveLength(2);
  });
  it.each([15, 30, 60] as const)('adds %s seconds without shortening selection', (seconds) => {
    const g = new Game().start();
    g.send({ type: 'addTime', seconds });
    expect(g.state.phase).toMatchObject({ endsAt: 60000 + seconds * 1000 });
  });
  it('does not accept selection/ratings at or after deadline; early and repeated ticks are harmless', () => {
    const g = new Game().start();
    const original = g.state;
    g.send({ type: 'tick' });
    expect(g.state).toBe(original);
    g.ctx.now = 60000;
    g.select('p0');
    rejected(g);
    expect(g.state).toBe(original);
    g.send({ type: 'tick' });
    const after = g.state;
    g.send({ type: 'tick' });
    expect(g.state).toBe(after);
  });
  it.each([
    [{ source: 'system', memeId: 'a', mediaType: 'image' }, 12000, 3000],
    [{ source: 'upload', uploadId: 'a', mediaType: 'gif' }, 12000, 3000],
    [{ source: 'system', memeId: 'a', mediaType: 'video', durationMs: 25000 }, 25000, 5000],
    [{ source: 'youtube', videoId: 'a', startMs: 2000, endMs: 6000 }, 12000, 5000],
  ] as [MediaRef, number, number][])('uses media slot for %j', (media, watch, last) => {
    const g = new Game().start();
    expect(mediaSlot(media, g.ctx)).toEqual({ watch, last });
  });
  it('allows changing last-call rating and limits presentation rating to current submission', () => {
    const g = new Game({}, 2, 1).start();
    g.submitAll();
    const p = g.state.phase;
    if (p.kind !== 'presentation') throw new Error();
    const id = g.round.order[p.index]!;
    g.send({ type: 'rate', participantId: 'v0', submissionId: g.round.order[1]!, score: 5 });
    rejected(g);
    g.send({ type: 'rate', participantId: 'v0', submissionId: id, score: 1 });
    g.ctx.now = p.lastCallAt;
    g.send({ type: 'rate', participantId: 'v0', submissionId: id, score: 5 });
    expect(g.round.ratings.v0![id]).toBe(5);
    g.ctx.now = p.endsAt;
    g.send({ type: 'rate', participantId: 'v0', submissionId: id, score: 2 });
    rejected(g);
  });
  it('review waits for connected eligible raters, not disconnected participants or manager', () => {
    const g = new Game({}, 2, 1).start();
    g.submitAll();
    g.toReview();
    // Duelists are ineligible with the neutral spectator present.
    g.send({ type: 'finishReview', participantId: 'p0' });
    expect(g.state.phase.kind).toBe('review');
    g.send({ type: 'finishReview', participantId: 'v0' });
    expect(g.round.locked).toBe(true);
    expect(g.state.phase.kind).toBe('reveal');
  });
  it('disconnect can close review; manager can close with missing votes', () => {
    const g = new Game({}, 2, 1).start();
    g.submitAll();
    g.toReview();
    g.send({ type: 'connection', participantId: 'v0', connected: false });
    expect(g.round.locked).toBe(true);
    const h = new Game().start();
    h.submitAll();
    h.toReview();
    h.close();
    expect(h.round.locked).toBe(true);
    h.send({ type: 'rate', participantId: 'p0', submissionId: h.round.order[0]!, score: 4 });
    rejected(h);
  });
  it('sends sequential reveal steps then 15 seconds of results and auto-advances', () => {
    const g = new Game({ leagueRounds: 2 }, 3).start();
    g.submitAll();
    g.rateScores({ p0: 5, p1: 4, p2: 3 });
    g.close();
    expect(g.state.phase).toMatchObject({ kind: 'reveal', step: 0 });
    g.advance();
    expect(g.state.phase).toMatchObject({ step: 1 });
    g.advance();
    g.advance();
    expect(g.state.phase).toMatchObject({ kind: 'results', endsAt: g.ctx.now + 15000 });
    expect(project(g.state, { kind: 'manager' }, g.ctx).promptPreview).not.toBeNull();
    g.send({ type: 'skipResults' });
    expect(g.round.no).toBe(2);
  });
  it('missing submissions and zero votes score zero without a default rating', () => {
    const g = new Game({}, 3).start();
    g.select('p0');
    g.toReview();
    g.close();
    expect(Object.values(g.round.scores).map((x) => x.average)).toEqual([0, 0, 0]);
  });
  it('averages partial ballots at full precision but projects two decimals', () => {
    const g = new Game({}, 3, 1).start();
    g.submitAll();
    g.toReview();
    const sub = Object.values(g.round.submissions).find((x) => x.playerId === 'p0')!;
    for (const [id, score] of [
      ['p1', 1],
      ['p2', 2],
      ['v0', 2],
    ] as const)
      g.send({ type: 'rate', participantId: id, submissionId: sub.id, score });
    g.close();
    expect(g.round.scores.p0!.average).toBe(5 / 3);
    expect(
      project(g.state, { kind: 'manager' }, g.ctx).submissions.find((x) => x.playerId === 'p0')!
        .score!.average,
    ).toBe(1.67);
  });
  it('manager sees custom owner, own selection is private, public views contain no raw ballots or RNG', () => {
    const g = new Game({}, 3).start();
    g.send({
      type: 'select',
      participantId: 'p0',
      media: { source: 'upload', uploadId: 'secret', mediaType: 'image' },
    });
    const display = project(g.state, { kind: 'display' }, g.ctx);
    expect(display.submissions).toEqual([]);
    expect(display).not.toHaveProperty('rng');
    expect(
      project(g.state, { kind: 'participant', participantId: 'p1' }, g.ctx).ownSubmission,
    ).toBeNull();
    expect(project(g.state, { kind: 'manager' }, g.ctx).submissions[0]!.playerId).toBe('p0');
    g.select('p1', true);
    g.select('p2', true);
    g.send({ type: 'confirm', participantId: 'p0' });
    for (const viewer of [
      { kind: 'display' },
      { kind: 'participant', participantId: 'p1' },
    ] as const) {
      const v = project(g.state, viewer, g.ctx);
      expect(v.submissions[0]).not.toHaveProperty('playerId');
      expect(v.submissions[0]).not.toHaveProperty('score');
      expect(v).not.toHaveProperty('ratings');
    }
    g.toReview();
    expect(project(g.state, { kind: 'display' }, g.ctx).submissions).toEqual([]);
    expect(
      project(g.state, { kind: 'participant', participantId: 'p1' }, g.ctx).submissions.every(
        (x) => !('playerId' in x),
      ),
    ).toBe(true);
  });
  it('public reveal exposes only each step, and projections are detached copies', () => {
    const g = new Game({}, 3).start();
    g.submitAll();
    g.rateScores({ p0: 5, p1: 4, p2: 3 });
    g.close();
    const v = project(g.state, { kind: 'display' }, g.ctx);
    expect(v.submissions).toHaveLength(1);
    v.config.mode = 'hybrid';
    expect(g.state.config.mode).toBe('league');
  });
  it.each(['selection', 'review', 'results'] as const)(
    'pause/resume preserves remaining %s time',
    (phase) => {
      const g = new Game({ leagueRounds: 2 }).start();
      if (phase !== 'selection') {
        g.submitAll();
        g.toReview();
      }
      if (phase === 'results') {
        g.close();
        while (g.state.phase.kind !== 'results') g.advance();
      }
      const p = g.state.phase;
      if (!('endsAt' in p)) throw new Error();
      const end = p.endsAt;
      g.ctx.now += 100;
      g.send({ type: 'pause' });
      g.select('p0');
      rejected(g);
      g.ctx.now += 100000;
      g.send({ type: 'tick' });
      expect(g.state.status).toBe('paused');
      g.send({ type: 'resume' });
      expect(g.state.phase).toMatchObject({ endsAt: end + 100000 });
    },
  );
  it('resume and restore restart the current presentation slot', () => {
    const g = new Game().start();
    g.submitAll();
    g.ctx.now = 5000;
    g.send({ type: 'pause' });
    g.ctx.now = 20000;
    g.send({ type: 'resume' });
    expect(g.state.phase).toMatchObject({ kind: 'presentation', endsAt: 35000, lastCallAt: 32000 });
    g.ctx.now = 100000;
    g.send({ type: 'restore' });
    expect(g.state.phase).toMatchObject({ endsAt: 115000 });
    expect(g.events[0]).toMatchObject({ type: 'restored', countdownSeconds: 3 });
  });
  it('restore resumes remaining selection from checkpoint and preserves explicit pause', () => {
    const g = new Game().start();
    g.ctx.now = 5000;
    g.select('p0');
    g.ctx.now = 100000;
    g.send({ type: 'restore' });
    expect(g.state.phase).toMatchObject({ endsAt: 155000 });
    g.send({ type: 'pause' });
    g.ctx.now = 200000;
    g.send({ type: 'restore' });
    expect(g.state.status).toBe('paused');
  });
  it('ends private content lifetime at final result, preserving usage type', () => {
    const g = new Game().start();
    g.send({
      type: 'select',
      participantId: 'p0',
      media: { source: 'youtube', videoId: 'private', startMs: 0, endMs: 20000 },
    });
    g.send({ type: 'endGame' });
    const sub = Object.values(g.round.submissions)[0]!;
    expect(sub.media).toBeNull();
    expect(sub.customType).toBe('youtube');
    expect(JSON.stringify(g.state)).not.toContain('private');
  });
});

describe('voting authority (§8.1)', () => {
  it('league players rate everyone but themselves; own vote is always rejected', () => {
    const g = new Game({}, 3).start();
    g.submitAll();
    g.toReview();
    for (const sub of Object.values(g.round.submissions)) {
      expect(g.round.eligibility[sub.id]).toEqual(
        ['p0', 'p1', 'p2'].filter((id) => id !== sub.playerId),
      );
      g.send({ type: 'rate', participantId: sub.playerId, submissionId: sub.id, score: 5 });
      rejected(g);
    }
  });
  it.each(['league', 'elimination'] as const)(
    'two-player %s uses mutual voting only with no neutral rater',
    (mode) => {
      const g = new Game({ mode }).start();
      g.submitAll();
      for (const sub of Object.values(g.round.submissions))
        expect(g.round.eligibility[sub.id]).toEqual([sub.playerId === 'p0' ? 'p1' : 'p0']);
      const h = new Game({ mode }, 2, 1).start();
      h.submitAll();
      for (const sub of Object.values(h.round.submissions))
        expect(h.round.eligibility[sub.id]).toEqual(['v0']);
    },
  );
  it('eligibility is frozen at presentation start; kicked neutral does not enable opponents', () => {
    const g = new Game({}, 2, 1).start();
    g.submitAll();
    g.send({ type: 'kick', participantId: 'v0' });
    g.toReview();
    const sub = Object.values(g.round.submissions).find((x) => x.playerId === 'p1')!;
    g.send({ type: 'rate', participantId: 'p0', submissionId: sub.id, score: 5 });
    rejected(g);
  });
  it('bay player is neutral; other duel participants only rate other matches', () => {
    const g = new Game({ mode: 'elimination' }, 5).start();
    g.submitAll();
    const bye = g.round.byes[0]!;
    for (const sub of Object.values(g.round.submissions)) {
      expect(g.round.eligibility[sub.id]).toContain(bye);
      const pair = g.round.matches.find((m) => m.includes(sub.playerId))!;
      expect(g.round.eligibility[sub.id]!.some((id) => pair.includes(id))).toBe(false);
    }
    expect(g.round.players).not.toContain(bye);
    g.select(bye);
    rejected(g);
  });
  it('neutral disconnected participants count as in room; late arrivals do not change snapshot', () => {
    const g = new Game({}, 2, 1).start();
    g.send({ type: 'connection', participantId: 'v0', connected: false });
    g.submitAll();
    for (const sub of Object.values(g.round.submissions))
      expect(g.round.eligibility[sub.id]).toEqual(['v0']);
    g.send({ type: 'join', participantId: 'new', nickname: 'Yeni', wants: 'voter' });
    for (const sub of Object.values(g.round.submissions))
      expect(g.round.eligibility[sub.id]).not.toContain('new');
  });
});

describe('elimination, league, hybrid and tie chains (§9–10)', () => {
  it('elimination uses new random pairs, fair bye, no carry-over scores, and converts losers', () => {
    const g = new Game({ mode: 'elimination' }, 7).start();
    const firstBye = g.round.byes[0]!;
    expect(g.round.matches).toHaveLength(3);
    expect(g.round.players).toHaveLength(6);
    const scores = Object.fromEntries(g.round.players.map((id, i) => [id, i % 2 ? 1 : 5]));
    g.play(scores);
    expect(g.round.matches).toHaveLength(2);
    expect(g.round.byes).toHaveLength(0);
    expect(Object.values(g.state.participants).filter((p) => p.eliminated)).toHaveLength(3);
    expect(g.state.participants[firstBye]!.byeCount).toBe(1);
    g.finish();
    expect(g.state.result!.ranking).toHaveLength(7);
    expect(g.state.result!.ranking[0]!.rank).toBe(1);
  });
  it('a second odd round gives bye to a player with fewer previous byes', () => {
    const g = new Game({ mode: 'elimination' }, 5).start();
    const bye = g.round.byes[0]!;
    const scores = Object.fromEntries(
      g.round.matches.flatMap((m) => [
        [m[0], 5],
        [m[1], 1],
      ]),
    );
    g.play(scores);
    expect(g.round.byes).toHaveLength(1);
    expect(g.round.byes[0]).not.toBe(bye);
  });
  it('same-round elimination losers share rank for equal scores; final has first and second', () => {
    const g = new Game({ mode: 'elimination' }, 4).start();
    const scores = Object.fromEntries(
      g.round.matches.flatMap((m) => [
        [m[0], 5],
        [m[1], 1],
      ]),
    );
    const losers = g.round.matches.map((m) => m[1]);
    g.play(scores);
    const pair = g.round.matches[0]!;
    g.play({ [pair[0]]: 5, [pair[1]]: 1 });
    expect(
      g.state.result!.ranking.filter((x) => losers.includes(x.participantId)).map((x) => x.rank),
    ).toEqual([3, 3]);
    expect(g.state.result!.champion).toBe(pair[0]);
  });
  it('simultaneous tied duels share exactly one overtime; non-tied players cannot submit', () => {
    const g = new Game({ mode: 'elimination' }, 6, 1).start();
    const matches = g.round.matches;
    const scores = Object.fromEntries(
      matches.flatMap((m, i) => [
        [m[0], i === 2 ? 5 : 3],
        [m[1], i === 2 ? 1 : 3],
      ]),
    );
    g.play(scores);
    expect(g.round.kind).toBe('overtime');
    expect(g.round.tieGroups).toHaveLength(2);
    expect(g.round.players).toHaveLength(4);
    expect(g.state.phase).toMatchObject({ kind: 'selection', endsAt: g.ctx.now + 30000 });
    g.select(matches[2]![0]);
    rejected(g);
    g.send({ type: 'replacePrompt' });
    expect(g.round.promptReplaced).toBe(true);
    g.play(
      Object.fromEntries(
        g.round.matches.flatMap((m) => [
          [m[0], 5],
          [m[1], 1],
        ]),
      ),
    );
    expect(g.round.kind).toBe('regular');
    expect(g.state.rounds.filter((r) => r.kind === 'overtime')).toHaveLength(1);
  });
  it('zero/zero duels use one overtime then animated draw and never another overtime', () => {
    const g = new Game({ mode: 'elimination' }).start();
    g.toReview();
    g.nextSelection();
    expect(g.round.kind).toBe('overtime');
    g.toReview();
    expect(g.round.needsDraw).toBe(true);
    while (g.state.phase.kind === 'reveal') g.advance();
    expect(g.state.phase.kind).toBe('draw');
    g.finish();
    expect(g.state.rounds).toHaveLength(2);
    expect(g.state.result!.champion).toMatch(/^p[01]$/);
  });
  it('league totals accumulate at full precision; lower positions share rank and only first gets overtime', () => {
    const g = new Game({ mode: 'league', leagueRounds: 2 }, 4).start();
    g.play({ p0: 5, p1: 2, p2: 2, p3: 1 });
    g.play({ p0: 5, p1: 2, p2: 2, p3: 1 });
    expect(g.state.stage.leagueTotals).toMatchObject({ p0: 10, p1: 4, p2: 4, p3: 2 });
    expect(g.state.rounds).toHaveLength(2);
    expect(g.state.result!.ranking.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
  });
  it('multi-person first-place overtime changes order but never totals', () => {
    const g = new Game({ mode: 'league' }, 4).start();
    g.play({ p0: 4, p1: 4, p2: 4, p3: 1 });
    expect(g.round.players).toEqual(['p0', 'p1', 'p2']);
    expect(g.round.matches).toEqual([]);
    g.play({ p0: 2, p1: 5, p2: 3 });
    expect(g.state.result!.champion).toBe('p1');
    expect(g.state.stage.leagueTotals).toMatchObject({ p0: 4, p1: 4, p2: 4, p3: 1 });
  });
  it('hybrid has five league + three parallel semifinal + three final rounds; match totals reset', () => {
    const g = new Game({ mode: 'hybrid' }, 6, 1).start();
    for (let i = 0; i < 5; i++) g.play({ p0: 5, p1: 4, p2: 3, p3: 2, p4: 1, p5: 1 });
    expect(g.round.context).toBe('semifinal');
    expect(g.round.matches).toEqual([
      ['p0', 'p3'],
      ['p1', 'p2'],
    ]);
    expect(g.round.players).toHaveLength(4);
    expect(g.state.participants.p4!.eliminated).toBe(true);
    for (let i = 0; i < 3; i++) g.play({ p0: 1, p1: 1, p2: 5, p3: 5 });
    expect(g.round.context).toBe('final');
    expect(g.round.players).toEqual(['p3', 'p2']);
    for (let i = 0; i < 3; i++) g.play({ p3: 1, p2: 5 });
    expect(g.state.status).toBe('finished');
    expect(g.state.rounds).toHaveLength(11);
    expect(g.state.result!.ranking.map((x) => x.participantId)).toEqual([
      'p2',
      'p3',
      'p0',
      'p1',
      'p4',
      'p5',
    ]);
    expect(g.state.result!.ranking.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 5]);
    expect(g.state.stage.matchTotals.p2).toBe(15);
    expect(g.state.stage.leagueTotals.p2).toBe(15);
  });
  it('hybrid match tie uses league points before considering overtime', () => {
    const g = new Game({ mode: 'hybrid' }, 4, 1).start();
    for (let i = 0; i < 5; i++) g.play({ p0: 5, p1: 4, p2: 3, p3: 2 });
    for (let i = 0; i < 3; i++) g.play({ p0: 3, p1: 3, p2: 3, p3: 3 });
    expect(g.round.context).toBe('final');
    expect(g.round.players).toEqual(['p0', 'p1']);
    expect(g.state.rounds.filter((r) => r.kind === 'overtime')).toHaveLength(0);
  });
  it('hybrid resolves only qualification boundary; initial top-four seed ties draw directly', () => {
    const g = new Game({ mode: 'hybrid' }, 6).start();
    for (let i = 0; i < 5; i++) g.play({ p0: 5, p1: 5, p2: 4, p3: 3, p4: 3, p5: 3 });
    expect(g.round.kind).toBe('overtime');
    expect([...g.round.players].sort()).toEqual(['p3', 'p4', 'p5']);
    g.play({ p3: 1, p4: 5, p5: 2 });
    expect(g.round.context).toBe('semifinal');
    expect(g.round.players).toContain('p4');
    expect(g.round.players).not.toContain('p3');
    expect(g.state.rounds.filter((r) => r.kind === 'overtime')).toHaveLength(1);
    expect(g.state.rounds.find((r) => r.kind === 'overtime')!.needsDraw).toBe(true);
  });
  it('four-player hybrid still plays five league rounds', () => {
    const g = new Game({ mode: 'hybrid' }, 4).start();
    for (let i = 0; i < 4; i++) g.play({ p0: 5, p1: 4, p2: 3, p3: 2 });
    expect(g.round.context).toBe('league');
    expect(g.round.stageRound).toBe(5);
  });
  it('hybrid player loss before qualification cancels semifinals and finalizes league', () => {
    const g = new Game({ mode: 'hybrid' }, 4).start();
    g.play({ p0: 5, p1: 4, p2: 3, p3: 2 });
    g.send({ type: 'moveToVoter', participantId: 'p3' });
    g.finish();
    expect(g.state.rounds.every((r) => r.context === 'league')).toBe(true);
    expect(g.state.result!.champion).toBe('p0');
  });
  it('post-pair departure yields forfeit, invalidates submission, and removes withdrawer from ranking', () => {
    const g = new Game({ mode: 'elimination' }, 4).start();
    const pair = g.round.matches[0]!;
    g.select(pair[0]);
    g.send({ type: 'moveToVoter', participantId: pair[0] });
    expect(Object.values(g.round.submissions)[0]!.invalid).toBe(true);
    g.play(Object.fromEntries(g.round.players.map((id) => [id, id === pair[1] ? 1 : 5])));
    expect(g.state.participants[pair[1]]!.role).toBe('player');
    g.finish();
    expect(g.state.result!.ranking.some((x) => x.participantId === pair[0])).toBe(false);
  });
  it('semifinal withdrawal awards opponent a final place; finalist withdrawal ends game', () => {
    const g = new Game({ mode: 'hybrid' }, 4, 1).start();
    for (let i = 0; i < 5; i++) g.play({ p0: 5, p1: 4, p2: 3, p3: 2 });
    g.send({ type: 'leaveToVoter', participantId: 'p3' });
    for (let i = 0; i < 3; i++) g.play({ p0: 1, p1: 5, p2: 1 });
    expect(g.round.context).toBe('final');
    expect(g.round.players).toEqual(['p0', 'p1']);
    g.send({ type: 'kick', participantId: 'p1' });
    expect(g.state.result!.champion).toBe('p0');
  });
  it('two semifinal forfeits do not require three empty rounds', () => {
    const g = new Game({ mode: 'hybrid' }, 4).start();
    for (let i = 0; i < 5; i++) g.play({ p0: 5, p1: 4, p2: 3, p3: 2 });
    g.send({ type: 'leaveToVoter', participantId: 'p3' });
    g.send({ type: 'leaveToVoter', participantId: 'p2' });
    g.nextSelection();
    expect(g.round.context).toBe('final');
    expect(g.round.players).toEqual(['p0', 'p1']);
  });
});

describe('moderation and stage compensation (§12.5)', () => {
  it('rejects custom content during selection, permits reselection and uses zero if no new choice', () => {
    const g = new Game().start();
    g.send({
      type: 'select',
      participantId: 'p0',
      media: { source: 'upload', uploadId: 'u', mediaType: 'gif' },
    });
    g.send({ type: 'rejectCustom', participantId: 'p0' });
    expect(g.events[0]!.type).toBe('customRejected');
    expect(Object.values(g.round.submissions)[0]!.invalid).toBe(true);
    g.select('p0');
    expect(Object.values(g.round.submissions)[0]!.invalid).toBe(false);
    g.send({ type: 'rejectCustom', participantId: 'p0' });
    rejected(g);
  });
  it.each([
    { source: 'youtube', videoId: 'u', startMs: 0, endMs: 25001 },
    { source: 'youtube', videoId: 'u', startMs: -1, endMs: 1 },
    { source: 'system', memeId: 'm', mediaType: 'video', durationMs: 26000 },
    { source: 'upload', uploadId: 'u', mediaType: 'video' },
  ])('rejects invalid clip/media %j', (media) => {
    const g = new Game().start();
    g.send({ type: 'select', participantId: 'p0', media: media as MediaRef });
    rejected(g);
  });
  it('custom setting rejects both upload and youtube, but accepts system content', () => {
    const g = new Game({ customContent: false }).start();
    g.send({
      type: 'select',
      participantId: 'p0',
      media: { source: 'upload', uploadId: 'u', mediaType: 'image' },
    });
    rejected(g);
    g.send({
      type: 'select',
      participantId: 'p0',
      media: { source: 'youtube', videoId: 'u', startMs: 0, endMs: 5000 },
    });
    rejected(g);
    g.select('p0');
    expect(g.events[0]!.type).toBe('submissionUpdated');
  });
  it('hidden custom content vanishes from every view and earns zero', () => {
    const g = new Game({}, 2, 1).start();
    g.send({
      type: 'select',
      participantId: 'p0',
      media: { source: 'upload', uploadId: 'private', mediaType: 'image' },
    });
    g.select('p1', true);
    g.send({ type: 'confirm', participantId: 'p0' });
    while (
      g.round.submissions[
        g.round.order[g.state.phase.kind === 'presentation' ? g.state.phase.index : 0]!
      ]!.playerId !== 'p0'
    )
      g.advance();
    g.send({ type: 'hideCurrent' });
    expect(project(g.state, { kind: 'display' }, g.ctx).submissions[0]!.media).toBeNull();
    g.toReview();
    g.close();
    expect(g.round.scores.p0!.average).toBe(0);
    expect(Object.values(g.round.submissions).find((x) => x.playerId === 'p0')!.compensation).toBe(
      false,
    );
  });
  it('system hidden in league gets other-round average at stage end without modifying locked scores', () => {
    const g = new Game({ leagueRounds: 3 }, 3, 1).start();
    g.submitAll();
    const target = g.round.submissions[g.round.order[0]!]!.playerId;
    g.send({ type: 'hideCurrent' });
    g.rateScores({ p0: 5, p1: 5, p2: 5 });
    g.close();
    const locked = structuredClone(g.round);
    g.nextSelection();
    g.play({ p0: 2, p1: 2, p2: 2 });
    g.play({ p0: 4, p1: 4, p2: 4 });
    expect(g.state.stage.leagueTotals[target]).toBe(9);
    expect(g.state.rounds[0]).toEqual(locked);
  });
  it('single-round system hiding has zero compensation; hidden votes do not count', () => {
    const g = new Game({}, 3, 1).start();
    g.submitAll();
    const sub = g.round.submissions[g.round.order[0]!]!;
    g.send({ type: 'rate', participantId: 'v0', submissionId: sub.id, score: 5 });
    g.send({ type: 'hideCurrent' });
    expect(g.round.ratings.v0![sub.id]).toBeUndefined();
    g.toReview();
    g.close();
    expect(stageTotals(g.state, 'league')[sub.playerId]).toBe(0);
  });
  it('system hidden in elimination forces overtime even against a higher-scored opponent', () => {
    const g = new Game({ mode: 'elimination' }, 2, 1).start();
    g.submitAll();
    g.send({ type: 'hideCurrent' });
    g.rateScores({ p0: 5, p1: 5 });
    g.close();
    g.nextSelection();
    expect(g.round.kind).toBe('overtime');
    g.play({ p0: 5, p1: 1 });
    expect(g.state.result!.champion).toBe('p0');
  });
  it('hybrid match compensation uses its own stage, excludes league and overtime', () => {
    const g = new Game({ mode: 'hybrid' }, 4, 1).start();
    for (let i = 0; i < 5; i++) g.play({ p0: 5, p1: 4, p2: 3, p3: 2 });
    g.submitAll();
    const target = g.round.submissions[g.round.order[0]!]!.playerId;
    g.send({ type: 'hideCurrent' });
    g.rateScores({ p0: 5, p1: 5, p2: 5, p3: 5 });
    g.close();
    g.nextSelection();
    g.play({ p0: 2, p1: 2, p2: 2, p3: 2 });
    g.play({ p0: 4, p1: 4, p2: 4, p3: 4 });
    expect(g.state.stage.matchTotals[target]).toBe(9);
  });
});

describe('jury and duration (§8.3,4.3)', () => {
  it('awards tied harsh/generous jurors, requires five votes, and excludes overtime', () => {
    const g = new Game({ leagueRounds: 3 }, 3, 4).start();
    for (let n = 0; n < 3; n++) {
      g.submitAll();
      g.toReview();
      for (const sub of Object.values(g.round.submissions))
        for (const [id, score] of [
          ['v0', 1],
          ['v1', 1],
          ['v2', 5],
          ['v3', 5],
        ] as const)
          g.send({ type: 'rate', participantId: id, submissionId: sub.id, score });
      g.close();
      g.nextSelection();
    }
    expect(g.round.kind).toBe('overtime');
    g.submitAll();
    g.toReview();
    for (const sub of Object.values(g.round.submissions))
      g.send({ type: 'rate', participantId: 'v0', submissionId: sub.id, score: 5 });
    g.close();
    g.nextSelection();
    expect(g.state.result!.jury).toEqual({
      harshest: [
        { nickname: 'Seyirci 0', average: 1 },
        { nickname: 'Seyirci 1', average: 1 },
      ],
      mostGenerous: [
        { nickname: 'Seyirci 2', average: 5 },
        { nickname: 'Seyirci 3', average: 5 },
      ],
    });
  });
  it('fewer than two qualified jurors and all-equal averages suppress awards', () => {
    const g = new Game({}, 2, 1).start();
    g.play({ p0: 5, p1: 1 });
    expect(g.state.result!.jury).toBeNull();
    const h = new Game({ leagueRounds: 3 }, 3).start();
    for (let n = 0; n < 3; n++) h.play({ p0: 3, p1: 3, p2: 3 });
    h.finish();
    expect(h.state.result!.jury).toBeNull();
  });
  it.each(['league', 'elimination', 'hybrid'] as const)(
    'estimates ordered positive finite %s duration; reflects player and round counts',
    (mode) => {
      const c: SessionConfig = { ...DEFAULT_CONFIG, mode };
      const e = estimateDuration(c, 8);
      expect(e.minMs).toBeGreaterThan(0);
      expect(e.maxMs).toBeGreaterThan(e.minMs);
      expect(estimateDuration(c, 1)).toEqual({ minMs: 0, maxMs: 0 });
      expect(estimateDuration(c, 16).maxMs).toBeGreaterThan(e.maxMs);
    },
  );
  it('duration includes video upper bound and grows with league count and settings', () => {
    const g = new Game();
    const c = { ...g.state.config, leagueRounds: 2 };
    expect(estimateDuration(c, 4).maxMs).toBeGreaterThan(estimateDuration(g.state.config, 4).maxMs);
    expect(DEFAULT_TIMING.videoMinMs + DEFAULT_TIMING.videoLastCallMs).toBe(17000);
  });
});

describe('additional boundary regressions', () => {
  it('accepts 1000 players but rejects player 1001 without imposing a voter cap', () => {
    const g = new Game();
    const template = g.state.participants.p0!;
    for (let i = 2; i < 1000; i++)
      g.state.participants[`p${i}`] = { ...template, id: `p${i}`, nickname: `Oyuncu ${i}` };
    g.send({ type: 'join', participantId: 'extra', nickname: 'Fazla', wants: 'player' });
    rejected(g);
    g.send({ type: 'join', participantId: 'extra', nickname: 'Seyirci', wants: 'voter' });
    expect(g.state.participants.extra!.role).toBe('voter');
  });
  it('a pool that becomes entirely empty terminates on the next round instead of waiting for management', () => {
    const g = new Game({ leagueRounds: 2 }).start();
    g.ctx.prompts = [];
    g.play({ p0: 5, p1: 1 });
    expect(g.state.result!.reason).toBe('noPrompts');
  });
  it('prompt IDs remain safe across JSON recovery, including inherited JavaScript names', () => {
    const g = new Game();
    g.ctx.prompts = [
      { id: '__proto__', text: 'Durum', owner: 'platform' },
      { id: 'toString', text: 'Diğer', owner: 'business' },
    ];
    g.start();
    expect(['__proto__', 'toString']).toContain(g.round.prompt.id);
    g.state = JSON.parse(JSON.stringify(g.state));
    g.send({ type: 'replacePrompt' });
    expect(Object.keys(g.state.usedPromptIds)).toContain('__proto__');
    expect(Object.keys(g.state.usedPromptIds)).toContain('toString');
  });
  it('only active room identities can send commands; nonexistent inherited names cannot crash the reducer', () => {
    const g = new Game().start();
    g.send({ type: 'connection', participantId: 'toString', connected: true });
    rejected(g);
  });
  it('approval after presentation does not create voting rights in the same review', () => {
    const g = new Game({ voterApproval: true }, 2, 1).start();
    g.submitAll();
    g.send({ type: 'approveParticipant', participantId: 'v0' });
    g.toReview();
    g.send({ type: 'rate', participantId: 'v0', submissionId: g.round.order[0]!, score: 5 });
    rejected(g);
  });
  it('jury awards include player ballots, preserve precision, and reveal no recipient-level votes', () => {
    const g = new Game({ leagueRounds: 3 }, 3).start();
    for (let n = 0; n < 3; n++) {
      g.submitAll();
      g.toReview();
      for (const sub of Object.values(g.round.submissions))
        for (const id of g.round.eligibility[sub.id]!) {
          g.send({
            type: 'rate',
            participantId: id,
            submissionId: sub.id,
            score: id === 'p0' ? 1 : 5,
          });
        }
      g.close();
      g.nextSelection();
    }
    g.finish();
    expect(g.state.result!.jury).toEqual({
      harshest: [{ nickname: 'Oyuncu 0', average: 1 }],
      mostGenerous: [
        { nickname: 'Oyuncu 1', average: 5 },
        { nickname: 'Oyuncu 2', average: 5 },
      ],
    });
  });
  it('hybrid equal-league semifinal ties share one overtime and third place can be shared', () => {
    const g = new Game({ mode: 'hybrid' }, 4, 1).start();
    for (let i = 0; i < 5; i++) g.play({ p0: 3, p1: 3, p2: 3, p3: 3 });
    for (let i = 0; i < 3; i++) g.play({ p0: 3, p1: 3, p2: 3, p3: 3 });
    expect(g.round.kind).toBe('overtime');
    expect(g.round.matches).toHaveLength(2);
    const winners = g.round.matches.map((m) => m[0]);
    g.play(
      Object.fromEntries(
        g.round.matches.flatMap((m) => [
          [m[0], 5],
          [m[1], 1],
        ]),
      ),
    );
    for (let i = 0; i < 3; i++) g.play({ [winners[0]!]: 5, [winners[1]!]: 1 });
    expect(g.state.result!.ranking.map((x) => x.rank)).toEqual([1, 2, 3, 3]);
  });
  it('rejected commands preserve every state field and old-clock commands cannot rewind time', () => {
    const g = new Game().start();
    g.ctx.now = 500;
    g.select('p0');
    const before = g.state;
    g.ctx.now = 499;
    g.send({ type: 'tick' });
    rejected(g);
    expect(g.state).toBe(before);
  });
});

it('projects stage totals after reveal, excludes spectators, and keeps scores hidden while voting', () => {
  const g = new Game({ leagueRounds: 2 }, 3, 2).start();
  g.submitAll();
  g.rateScores({ p0: 5, p1: 4, p2: 3 });
  expect(project(g.state, { kind: 'display' }, g.ctx).table).toEqual([]);
  g.close();
  expect(project(g.state, { kind: 'display' }, g.ctx).table).toEqual([]);
  while (g.state.phase.kind === 'reveal') g.advance();
  expect(project(g.state, { kind: 'display' }, g.ctx).table).toEqual([
    { participantId: 'p0', rank: 1, score: 5 },
    { participantId: 'p1', rank: 2, score: 4 },
    { participantId: 'p2', rank: 3, score: 3 },
  ]);
});

it('administrative hybrid withdrawal during pause resumes the new phase', () => {
  const g = new Game({ mode: 'hybrid' }, 4).start();
  g.play({ p0: 5, p1: 4, p2: 3, p3: 2 });
  g.send({ type: 'pause' });
  g.send({ type: 'moveToVoter', participantId: 'p3' });
  expect(g.state.status).toBe('paused');
  expect(g.state.pausedFrom!.kind).toBe('reveal');
  g.ctx.now += 10000;
  g.send({ type: 'resume' });
  expect(g.state.phase.kind).toBe('reveal');
  g.finish();
  expect(g.state.result!.champion).toBe('p0');
});

it('qualification locks at the fifth league result; a departing qualifier is not replaced by fifth place', () => {
  const g = new Game({ mode: 'hybrid' }, 6, 1).start();
  for (let i = 0; i < 4; i++) g.play({ p0: 5, p1: 4, p2: 3, p3: 2, p4: 1, p5: 1 });
  g.submitAll();
  g.rateScores({ p0: 5, p1: 4, p2: 3, p3: 2, p4: 1, p5: 1 });
  g.close();
  while (g.state.phase.kind === 'reveal') g.advance();
  expect(g.state.stage.qualified).toBe(true);
  expect(g.state.participants.p4!.eliminated).toBe(true);
  g.send({ type: 'leaveToVoter', participantId: 'p3' });
  g.nextSelection();
  expect(g.round.context).toBe('semifinal');
  expect(g.round.matches).toContainEqual(['p0', 'p3']);
  expect(g.round.players).not.toContain('p4');
  expect(g.round.players).not.toContain('p3');
});

it('hybrid loss during qualification overtime resolves that overtime rather than opening a second', () => {
  const g = new Game({ mode: 'hybrid' }, 5, 1).start();
  for (let i = 0; i < 5; i++) g.play({ p0: 3, p1: 3, p2: 3, p3: 3, p4: 3 });
  expect(g.round.kind).toBe('overtime');
  g.send({ type: 'leaveToVoter', participantId: 'p4' });
  g.send({ type: 'leaveToVoter', participantId: 'p3' });
  g.finish();
  expect(g.state.rounds.filter((r) => r.kind === 'overtime')).toHaveLength(1);
  expect(g.state.stage.qualified).toBe(false);
  expect(g.state.result!.champion).not.toBeNull();
});

it('league winner leaving during the final results countdown promotes the remaining leader', () => {
  const g = new Game({}, 3, 1).start();
  g.submitAll();
  g.rateScores({ p0: 5, p1: 4, p2: 3 });
  g.close();
  expect(g.state.stage.champion).toBe('p0');
  g.send({ type: 'leaveToVoter', participantId: 'p0' });
  g.finish();
  expect(g.state.result!.champion).toBe('p1');
  expect(g.state.result!.ranking.some((r) => r.participantId === 'p0')).toBe(false);
});

it('league winner leaving can expose a new first-place tie which follows the normal overtime chain', () => {
  const g = new Game({}, 3, 1).start();
  g.submitAll();
  g.rateScores({ p0: 5, p1: 4, p2: 4 });
  g.close();
  g.send({ type: 'kick', participantId: 'p0' });
  g.nextSelection();
  expect(g.round.kind).toBe('overtime');
  g.play({ p1: 5, p2: 1 });
  expect(g.state.result!.champion).toBe('p1');
});

it('another departure after locked hybrid overtime preserves the entire locked round', () => {
  const g = new Game({ mode: 'hybrid' }, 5, 1).start();
  for (let i = 0; i < 5; i++) g.play({ p0: 3, p1: 3, p2: 3, p3: 3, p4: 3 });
  g.send({ type: 'leaveToVoter', participantId: 'p4' });
  g.send({ type: 'leaveToVoter', participantId: 'p3' });
  const round = structuredClone(g.round);
  g.send({ type: 'leaveToVoter', participantId: 'p2' });
  expect(g.round).toEqual(round);
  g.finish();
  expect(g.state.status).toBe('finished');
});

it('normalizes explicitly undefined optional media fields into strict JSON state', () => {
  const g = new Game().start();
  g.send({
    type: 'select',
    participantId: 'p0',
    media: { source: 'system', memeId: 'image', mediaType: 'image', durationMs: undefined },
  });
  expect(JSON.parse(JSON.stringify(g.state))).toStrictEqual(g.state);
});
