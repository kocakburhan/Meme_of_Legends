import { expect, it } from 'vitest';
import { project } from './index.js';
import { Game } from './test-helpers.js';

it('exposes review progress only to manager/display using the same eligibility as review closure', () => {
  const g = new Game({}, 2, 2).start();
  for (const id of Object.keys(g.state.participants))
    g.send({ type: 'connection', participantId: id, connected: true });
  g.submitAll();
  g.toReview();
  const view = (kind: 'manager' | 'display') => project(g.state, { kind }, g.ctx);
  expect(view('manager').review).toEqual({ finished: 0, eligible: 2 });
  g.send({ type: 'finishReview', participantId: 'v0' });
  expect(view('display').review).toEqual({ finished: 1, eligible: 2 });
  expect(
    project(g.state, { kind: 'participant', participantId: 'v0' }, g.ctx).review,
  ).toBeUndefined();
  g.send({ type: 'pause' });
  expect(view('manager').review).toEqual({ finished: 1, eligible: 2 });
  g.send({ type: 'resume' });
  g.send({ type: 'connection', participantId: 'v0', connected: false });
  expect(view('manager').review).toEqual({ finished: 0, eligible: 1 });
  g.send({ type: 'join', participantId: 'late', nickname: 'Geç Gelen', wants: 'voter' });
  g.send({ type: 'connection', participantId: 'late', connected: true });
  expect(view('display').review).toEqual({ finished: 0, eligible: 1 });
  g.send({ type: 'finishReview', participantId: 'v1' });
  expect(view('manager').review).toBeUndefined();
});
it('keeps unconfirmed private selection and its sender visible only to manager', () => {
  const g = new Game().start();
  const media = { source: 'upload', uploadId: 'private', mediaType: 'image' } as const;
  g.send({ type: 'select', participantId: 'p0', media });
  expect(project(g.state, { kind: 'manager' }, g.ctx).submissions).toEqual([
    expect.objectContaining({ playerId: 'p0', media }),
  ]);
  expect(project(g.state, { kind: 'display' }, g.ctx).submissions).toEqual([]);
  expect(project(g.state, { kind: 'participant', participantId: 'p1' }, g.ctx).submissions).toEqual(
    [],
  );
});
it.each(['league', 'elimination', 'hybrid'] as const)(
  '%s marks final outcomes only after resolving any overtime',
  (mode) => {
    const g = new Game({ mode, leagueRounds: 2 }, 4).start();
    const final = () => project(g.state, { kind: 'display' }, g.ctx).isFinalRound;
    expect(final()).toBe(false);
    let rounds = 0;
    while (g.state.status === 'running' && rounds++ < 20) {
      g.submitAll();
      g.rateScores({ p0: 5, p1: 4, p2: 3, p3: 2 });
      g.close();
      const finishing = g.state.stage.pending === 'finish' && g.state.stage.tieGroups.length === 0;
      expect(final()).toBe(finishing);
      g.nextSelection();
    }
    expect(g.state.status).toBe('finished');
    expect(final()).toBe(true);
  },
);
it.each(['league', 'elimination', 'hybrid'] as const)(
  '%s does not announce final results before its overtime',
  (mode) => {
    const g = new Game({ mode }, mode === 'hybrid' ? 4 : 2).start();
    let rounds = 0;
    while (g.state.status === 'running' && rounds++ < 40) {
      g.submitAll();
      g.rateScores({ p0: 3, p1: 3, p2: 3, p3: 3 });
      g.close();
      const view = project(g.state, { kind: 'manager' }, g.ctx);
      if (g.state.stage.tieGroups.length) expect(view.isFinalRound).toBe(false);
      g.nextSelection();
    }
    expect(g.state.status).toBe('finished');
    expect(project(g.state, { kind: 'display' }, g.ctx).isFinalRound).toBe(true);
  },
);
it('names the submission on screen during presentation for every admitted viewer', () => {
  const g = new Game({}, 3, 1).start();
  g.submitAll();
  expect(g.state.phase.kind).toBe('presentation');
  const onScreen = g.round.order[0]!;
  const manager = project(g.state, { kind: 'manager' }, g.ctx);
  expect(manager.presentation?.submissionId).toBe(onScreen);
  expect(manager.submissions.some((sub) => sub.id === onScreen)).toBe(true);
  const voter = project(g.state, { kind: 'participant', participantId: 'v0' }, g.ctx);
  expect(voter.presentation?.submissionId).toBe(voter.submissions[0]!.id);
});
