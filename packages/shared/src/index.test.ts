import { expect, it } from 'vitest';
import {
  clientMessageSchema,
  managerCommandSchema,
  participantCommandSchema,
  nicknameSchema,
} from './index.js';
it('rejects system commands and identity spoofing', () => {
  for (const type of ['tick', 'restore', 'connection'])
    expect(
      clientMessageSchema.safeParse({ type: 'cmd', clientMsgId: '1', cmd: { type } }).success,
    ).toBe(false);
  expect(
    participantCommandSchema.safeParse({ type: 'confirm', participantId: 'victim' }).success,
  ).toBe(false);
  expect(
    participantCommandSchema.safeParse({ type: 'kick', participantId: 'victim' }).success,
  ).toBe(false);
  expect(managerCommandSchema.safeParse({ type: 'kick', participantId: 'victim' }).success).toBe(
    true,
  );
  expect(
    clientMessageSchema.safeParse({
      type: 'cmd',
      clientMsgId: '1',
      cmd: { type: 'rate', submissionId: 's', score: 6 },
    }).success,
  ).toBe(false);
});
it('validates Turkish nicknames and emoji without links or markup', () => {
  for (const n of ['Şakacı 42', '😂😂', 'A 👨‍👩‍👧'])
    expect(nicknameSchema.safeParse(n).success).toBe(true);
  for (const n of ['a', ' '.repeat(4), 'a'.repeat(21), 'www.test.com', '<b>Ad</b>', 'Ad\nSoyad'])
    expect(nicknameSchema.safeParse(n).success).toBe(false);
});

it('validates engine projections and rejects privileged event/state payloads', async () => {
  const { createSession, reduce, project, DEFAULT_TIMING } = await import('@mol/engine');
  const { serverMessageSchema } = await import('./index.js');
  const ctx = {
    now: 1000,
    prompts: [{ id: 'prompt', text: 'Maaş günü', owner: 'platform' }],
    timing: DEFAULT_TIMING,
  };
  let state = createSession({ seed: 1, config: { mode: 'league', leagueRounds: 1 } }, ctx);
  for (const participantId of ['alice', 'bob'])
    state = reduce(
      state,
      { type: 'join', participantId, nickname: participantId, wants: 'player' },
      ctx,
    ).state;
  const validate = () => {
    for (const viewer of [
      { kind: 'manager' },
      { kind: 'display' },
      { kind: 'participant', participantId: 'alice' },
    ] as const) {
      const message = {
        type: 'view',
        seq: 1,
        serverNow: ctx.now,
        view: project(state, viewer, ctx),
      };
      expect(serverMessageSchema.safeParse(message).success).toBe(true);
      expect(serverMessageSchema.safeParse({ ...message, view: state }).success).toBe(false);
    }
  };
  validate();
  state = reduce(state, { type: 'start' }, ctx).state;
  validate();
  for (const participantId of ['alice', 'bob']) {
    state = reduce(
      state,
      {
        type: 'select',
        participantId,
        media: { source: 'system', memeId: 'meme', mediaType: 'image' },
      },
      ctx,
    ).state;
    state = reduce(state, { type: 'confirm', participantId }, ctx).state;
  }
  for (let step = 0; step < 100 && state.status !== 'finished'; step++) {
    validate();
    const next = reduce(state, { type: 'tick' }, ctx).nextDeadline;
    if (next === null) break;
    ctx.now = next;
    state = reduce(state, { type: 'tick' }, ctx).state;
  }
  expect(state.status).toBe('finished');
  validate();
  expect(
    serverMessageSchema.safeParse({
      type: 'cue',
      serverNow: 1,
      cue: { type: 'revealStep', roundNo: 1, playerId: 'secret' },
    }).success,
  ).toBe(false);
});

it('validates v0.2 shell commands, private manager metadata and recovery messages', async () => {
  const {
    shellActionSchema,
    managerShellInfoSchema,
    serverMessageSchema,
    takeoverRequestSchema,
    displayPairRequestSchema,
  } = await import('./index.js');
  for (const action of [
    { kind: 'approveTakeover', requestId: 'request' },
    { kind: 'rejectTakeover', requestId: 'request' },
    { kind: 'createDisplayPairCode' },
    { kind: 'rematch' },
  ])
    expect(
      clientMessageSchema.safeParse({ type: 'shell', clientMsgId: 'shell', action }).success,
    ).toBe(true);
  for (const action of [
    { kind: 'tick' },
    { kind: 'approveTakeover' },
    { kind: 'rematch', participantId: 'victim' },
  ])
    expect(shellActionSchema.safeParse(action).success).toBe(false);
  const shell = {
    pendingTakeovers: [{ requestId: 'r', participantId: 'p', nickname: 'İsim', requestedAt: 100 }],
    displayPairCode: { code: '012345', expiresAt: 300100 },
    displayConnected: false,
  };
  expect(managerShellInfoSchema.safeParse(shell).success).toBe(true);
  expect(
    managerShellInfoSchema.safeParse({
      ...shell,
      pendingTakeovers: [{ ...shell.pendingTakeovers[0], token: 'private' }],
    }).success,
  ).toBe(false);
  expect(
    managerShellInfoSchema.safeParse({
      ...shell,
      displayPairCode: { code: '12345', expiresAt: 100 },
    }).success,
  ).toBe(false);
  expect(
    serverMessageSchema.safeParse({ type: 'recovery', serverNow: 100, resumesAt: 3100 }).success,
  ).toBe(true);
  expect(
    serverMessageSchema.safeParse({ type: 'recovery', serverNow: 100, resumesAt: -1 }).success,
  ).toBe(false);
  expect(takeoverRequestSchema.safeParse({ nickname: 'İsim' }).success).toBe(true);
  expect(takeoverRequestSchema.safeParse({ requestId: 'r', receipt: 'secret' }).success).toBe(true);
  expect(takeoverRequestSchema.safeParse({ requestId: 'r' }).success).toBe(false);
  expect(
    takeoverRequestSchema.safeParse({ nickname: 'İsim', participantId: 'victim' }).success,
  ).toBe(false);
  expect(displayPairRequestSchema.safeParse({ code: '012345' }).success).toBe(true);
  expect(displayPairRequestSchema.safeParse({ code: '12345x' }).success).toBe(false);
});
