import { reviewParticipants } from './competition.js';
export * from './types.js';
export { project } from './projection.js';
import { DEFAULT_CONFIG } from './types.js';
import type {
  Command,
  Ctx,
  EngineEvent,
  EngineState,
  MediaRef,
  Phase,
  Round,
  SessionConfig,
  SessionInit,
} from './types.js';
import { drawPrompt, random, shuffle } from './random.js';
import {
  activePlayers,
  currentRound,
  eligibleParticipant,
  eliminate,
  finish,
  settleOvertime,
  settleRegular,
  stageTotals,
} from './competition.js';
import { scoreRound } from './competition.js';

function validConfig(c: SessionConfig): boolean {
  return (
    ['elimination', 'league', 'hybrid'].includes(c.mode) &&
    Number.isInteger(c.leagueRounds) &&
    c.leagueRounds >= 1 &&
    c.leagueRounds <= 50 &&
    Number.isInteger(c.selectionSeconds) &&
    c.selectionSeconds >= 30 &&
    c.selectionSeconds <= 240 &&
    Number.isInteger(c.reviewSeconds) &&
    c.reviewSeconds >= 15 &&
    c.reviewSeconds <= 120 &&
    ['customContent', 'playerApproval', 'voterApproval', 'acceptVoters'].every(
      (k) => typeof c[k as keyof SessionConfig] === 'boolean',
    )
  );
}
export function createSession(init: SessionInit, ctx: Ctx): EngineState {
  const config = { ...DEFAULT_CONFIG, ...init.config };
  if (!validConfig(config) || !Number.isFinite(init.seed))
    throw new RangeError('Invalid session initialization');
  const s: EngineState = {
    version: 1,
    rng: init.seed >>> 0,
    config,
    status: 'lobby',
    participants: {},
    phase: { kind: 'lobby' },
    rounds: [],
    stage: {
      context: 'league',
      round: 0,
      contenders: [],
      matches: [],
      leagueTotals: {},
      matchTotals: {},
      leagueOrder: [],
      semifinalLosers: [],
      finalLoser: null,
      eliminated: {},
      pending: 'next',
      tieGroups: [],
      resolved: [],
      champion: null,
      qualified: false,
    },
    usedPromptIds: {},
    promptDraw: 0,
    promptPreview: null,
    previewReplaced: false,
    pausedFrom: null,
    pausedAt: null,
    lastNow: ctx.now,
    emptySince: null,
    result: null,
  };
  s.promptPreview = drawPrompt(s, ctx);
  return s;
}
function preview(s: EngineState, ctx: Ctx): void {
  s.promptPreview = drawPrompt(s, ctx);
  s.previewReplaced = false;
}
function prepareRound(s: EngineState, ctx: Ctx, events: EngineEvent[], overtime = false): void {
  const st = s.stage;
  if (!s.promptPreview || !ctx.prompts.some((p) => p.id === s.promptPreview!.id)) preview(s, ctx);
  // SPEC-QUESTION: An entirely empty live prompt pool terminates safely; there is no legal prompt to invent.
  if (!s.promptPreview) {
    finish(s, 'noPrompts', events);
    return;
  }
  // A live edit is reflected until the round starts; historical snapshots never change afterwards.
  const prompt = { ...ctx.prompts.find((p) => p.id === s.promptPreview!.id)! };
  let players: string[],
    matches = st.matches,
    byes: string[] = [];
  if (overtime) {
    players = st.tieGroups.flat().filter((id) => !s.participants[id]!.withdrawn);
    matches = st.tieGroups
      .filter((g) => g.length === 2 && st.context !== 'league')
      .map((g) => [g[0]!, g[1]!] as [string, string]);
    if (st.context === 'league' && activePlayers(s).length === 2 && players.length === 2)
      matches = [[players[0]!, players[1]!]];
  } else {
    st.round++;
    st.resolved = [];
    st.tieGroups = [];
    players = activePlayers(s);
    if (st.context === 'elimination') {
      let pool = shuffle(s, players);
      if (pool.length % 2) {
        const min = Math.min(...pool.map((id) => s.participants[id]!.byeCount));
        const id = pool.find((id) => s.participants[id]!.byeCount === min)!;
        byes = [id];
        s.participants[id]!.byeCount++;
        pool = pool.filter((x) => x !== id);
        events.push({ type: 'byeAnnounced', participantId: id });
      }
      matches = [];
      for (let i = 0; i < pool.length; i += 2) matches.push([pool[i]!, pool[i + 1]!]);
      players = pool;
      st.matches = matches;
    } else if (st.context === 'league')
      matches = players.length === 2 ? [[players[0]!, players[1]!]] : [];
    else
      players = st.matches
        .flat()
        .filter((id) => s.participants[id]!.role === 'player' && !s.participants[id]!.withdrawn);
  }
  const r: Round = {
    no: s.rounds.length + 1,
    kind: overtime ? 'overtime' : 'regular',
    context: st.context,
    stageRound: st.round,
    prompt,
    promptReplaced: s.previewReplaced,
    config: { ...s.config },
    players,
    matches: matches.map((m) => [...m]),
    byes,
    submissions: {},
    order: [],
    ratings: {},
    eligibility: {},
    reviewFinished: [],
    scores: {},
    locked: false,
    tieGroups: overtime ? st.tieGroups.map((g) => [...g]) : [],
    resolution: [],
    needsDraw: false,
  };
  s.rounds.push(r);
  s.promptPreview = null;
  s.phase = {
    kind: 'selection',
    roundNo: r.no,
    endsAt:
      ctx.now + (overtime ? ctx.timing.overtimeSelectionMs : r.config.selectionSeconds * 1000),
    promptReplaceUntil: ctx.now + ctx.timing.promptReplaceMs,
  };
  if (r.matches.length) events.push({ type: 'matchupsAnnounced', matches: r.matches });
  if (overtime) events.push({ type: 'overtimeStarted', groups: r.tieGroups });
  events.push({ type: 'phaseChanged', phase: s.phase });
}
export function mediaSlot(media: MediaRef, ctx: Ctx): { watch: number; last: number } {
  if (media.source === 'youtube')
    return {
      watch: Math.max(ctx.timing.videoMinMs, media.endMs - media.startMs),
      last: ctx.timing.videoLastCallMs,
    };
  if (media.mediaType === 'video')
    return {
      watch: Math.max(ctx.timing.videoMinMs, media.durationMs ?? 0),
      last: ctx.timing.videoLastCallMs,
    };
  return { watch: ctx.timing.imageWatchMs, last: ctx.timing.imageLastCallMs };
}
function show(s: EngineState, index: number, ctx: Ctx): void {
  const r = currentRound(s)!;
  if (index >= r.order.length) {
    s.phase = { kind: 'review', roundNo: r.no, endsAt: ctx.now + r.config.reviewSeconds * 1000 };
    return;
  }
  const slot = mediaSlot(r.submissions[r.order[index]!]!.media!, ctx);
  s.phase = {
    kind: 'presentation',
    roundNo: r.no,
    index,
    lastCallAt: ctx.now + slot.watch,
    endsAt: ctx.now + slot.watch + slot.last,
  };
}
function beginPresentation(s: EngineState, ctx: Ctx, events: EngineEvent[]): void {
  const r = currentRound(s)!;
  r.order = shuffle(
    s,
    Object.values(r.submissions)
      .filter((x) => !x.invalid && x.media)
      .map((x) => x.id),
  );
  const raters = Object.keys(s.participants).filter((id) => eligibleParticipant(s, id, r));
  for (const sub of Object.values(r.submissions)) {
    const pair = r.matches.find((m) => m.includes(sub.playerId));
    const neutral = pair && raters.some((id) => !pair.includes(id));
    r.eligibility[sub.id] = raters.filter(
      (id) => id !== sub.playerId && (!pair || !neutral || !pair.includes(id)),
    );
  }
  show(s, 0, ctx);
  events.push({ type: 'phaseChanged', phase: s.phase });
  maybeCloseReview(s, ctx, events);
}
function maybeCloseReview(s: EngineState, ctx: Ctx, events: EngineEvent[]): void {
  if (s.phase.kind !== 'review') return;
  const r = currentRound(s)!;
  const required = reviewParticipants(s, r);
  if (required.every((id) => r.reviewFinished.includes(id))) lockRound(s, ctx, events);
}
function lockRound(s: EngineState, ctx: Ctx, events: EngineEvent[]): void {
  const r = currentRound(s)!;
  scoreRound(r);
  r.locked = true;
  if (r.kind === 'regular') settleRegular(s, r, events);
  else settleOvertime(s, r, events);
  s.phase = {
    kind: 'reveal',
    roundNo: r.no,
    step: 0,
    nextStepAt: ctx.now + ctx.timing.revealStepMs,
  };
  events.push({ type: 'revealStep', roundNo: r.no, step: 0 });
}
function nextRound(s: EngineState, ctx: Ctx, events: EngineEvent[]): void {
  const st = s.stage;
  if (st.tieGroups.length) {
    prepareRound(s, ctx, events, true);
    return;
  }
  if (st.pending === 'finish') {
    finish(s, 'completed', events);
    return;
  }
  if (st.pending === 'semifinal') {
    const top = st.leagueOrder.slice(0, 4);
    if (top.length < 4) {
      st.champion = top[0] ?? null;
      finish(s, 'players', events);
      return;
    }
    for (const id of activePlayers(s))
      if (!top.includes(id)) eliminate(s, id, st.leagueTotals[id] ?? 0, events);
    st.qualified = true;
    st.context = 'semifinal';
    st.round = 0;
    st.contenders = top;
    st.matches = [
      [top[0]!, top[3]!],
      [top[1]!, top[2]!],
    ];
  } else if (st.pending === 'final') {
    st.context = 'final';
    st.round = 0;
    const top = st.contenders.filter((id) => !s.participants[id]!.withdrawn);
    if (top.length < 2) {
      st.champion = top[0] ?? null;
      finish(s, 'players', events);
      return;
    }
    st.matches = [[top[0]!, top[1]!]];
  }
  prepareRound(s, ctx, events);
}
function phaseDeadline(p: Phase): number | null {
  if ('endsAt' in p) return p.endsAt;
  return p.kind === 'reveal' ? p.nextStepAt : null;
}
export function nextDeadline(s: EngineState, ctx: Ctx): number | null {
  if (s.status !== 'running' && s.status !== 'paused') return null;
  const phase = s.status === 'running' ? phaseDeadline(s.phase) : null;
  const empty = s.emptySince === null ? null : s.emptySince + ctx.timing.emptyRoomMs;
  return phase === null ? empty : empty === null ? phase : Math.min(phase, empty);
}
function tick(s: EngineState, ctx: Ctx, events: EngineEvent[]): void {
  if (s.emptySince !== null && ctx.now >= s.emptySince + ctx.timing.emptyRoomMs) {
    finish(s, 'empty', events);
    return;
  }
  if (s.status !== 'running') return;
  const due = phaseDeadline(s.phase);
  if (due === null || ctx.now < due) return;
  const p = s.phase,
    r = currentRound(s)!;
  switch (p.kind) {
    case 'selection':
      beginPresentation(s, ctx, events);
      break;
    case 'presentation':
      show(s, p.index + 1, ctx);
      maybeCloseReview(s, ctx, events);
      break;
    case 'review':
      lockRound(s, ctx, events);
      break;
    case 'reveal': {
      const steps = Math.max(1, r.matches.length || r.players.length);
      if (p.step + 1 < steps) {
        s.phase = { ...p, step: p.step + 1, nextStepAt: ctx.now + ctx.timing.revealStepMs };
        events.push({ type: 'revealStep', roundNo: r.no, step: p.step + 1 });
      } else if (r.needsDraw)
        s.phase = { kind: 'draw', roundNo: r.no, endsAt: ctx.now + ctx.timing.drawMs };
      else results(s, ctx, events);
      break;
    }
    case 'draw':
      results(s, ctx, events);
      break;
    case 'results':
      nextRound(s, ctx, events);
      break;
  }
}
function results(s: EngineState, ctx: Ctx, events: EngineEvent[]): void {
  s.phase = {
    kind: 'results',
    roundNo: currentRound(s)!.no,
    endsAt: ctx.now + ctx.timing.resultsMs,
  };
  if (s.stage.pending !== 'finish' || s.stage.tieGroups.length) preview(s, ctx);
  events.push({ type: 'roundResult', roundNo: currentRound(s)!.no });
}
function shiftPhase(p: Phase, delta: number): Phase {
  const shifted = { ...p };
  if ('endsAt' in shifted) shifted.endsAt += delta;
  if (shifted.kind === 'selection') shifted.promptReplaceUntil += delta;
  if (shifted.kind === 'presentation') shifted.lastCallAt += delta;
  if (shifted.kind === 'reveal') shifted.nextStepAt += delta;
  return shifted;
}
function resumePhase(s: EngineState, p: Phase, delta: number, ctx: Ctx): void {
  s.phase = shiftPhase(p, delta);
  if (p.kind === 'presentation') show(s, p.index, ctx);
}
function validMedia(m: MediaRef): boolean {
  if (m.source === 'youtube')
    return (
      !!m.videoId &&
      Number.isFinite(m.startMs) &&
      Number.isFinite(m.endMs) &&
      m.startMs >= 0 &&
      m.endMs > m.startMs &&
      m.endMs - m.startMs <= 25_000
    );
  if (m.source === 'upload') return !!m.uploadId && ['image', 'gif'].includes(m.mediaType);
  return (
    m.source === 'system' &&
    !!m.memeId &&
    ['image', 'gif', 'video'].includes(m.mediaType) &&
    (m.mediaType !== 'video' ||
      (Number.isFinite(m.durationMs) && m.durationMs! > 0 && m.durationMs! <= 25_000))
  );
}
function nicknameValid(s: EngineState, name: string, id: string): boolean {
  const size = Array.from(name).length;
  return (
    size >= 2 &&
    size <= 20 &&
    /^[\p{L}\p{M}\p{N}\p{Zs}\p{Extended_Pictographic}\p{Emoji_Component}]+$/u.test(name) &&
    !Object.values(s.participants).some(
      (p) =>
        p.id !== id &&
        p.status !== 'kicked' &&
        p.nickname.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'),
    )
  );
}
function emptyRoom(s: EngineState, ctx: Ctx): void {
  if (Object.values(s.participants).some((p) => p.status === 'active' && p.connected))
    s.emptySince = null;
  else s.emptySince ??= ctx.now;
}
function withdraw(
  s: EngineState,
  id: string,
  kicked: boolean,
  ctx: Ctx,
  events: EngineEvent[],
): void {
  const p = s.participants[id]!;
  const wasPlayer = p.role === 'player' && p.status === 'active';
  p.role = 'voter';
  p.withdrawn ||= wasPlayer;
  p.status = kicked ? 'kicked' : 'active';
  if (kicked) p.connected = false;
  if (p.withdrawn && s.stage.champion === id) s.stage.champion = null;
  const r = currentRound(s);
  if (r && !r.locked) {
    for (const sub of Object.values(r.submissions))
      if (sub.playerId === id) {
        sub.invalid = true;
        sub.compensation = false;
      }
    if (kicked) delete r.ratings[id];
  }
  events.push({
    type: 'participantChanged',
    participantId: id,
    action: kicked ? 'kick' : 'leaveToVoter',
  });
  if (s.status !== 'lobby' && wasPlayer) {
    const remaining = activePlayers(s);
    if (remaining.length < 2) {
      s.stage.champion = remaining[0] ?? null;
      finish(s, 'players', events);
      return;
    }
    if (s.config.mode === 'league' && r?.locked) {
      const regular = [...s.rounds].reverse().find((round) => round.kind === 'regular')!;
      settleRegular(s, regular, events);
    }
    if (s.config.mode === 'hybrid' && !s.stage.qualified && remaining.length < 4) {
      // SPEC-QUESTION: If the league loses its fourth player mid-round, lock the current round using votes already received for final standings.
      s.stage.leagueTotals = stageTotals(s, 'league');
      s.stage.champion =
        [...remaining].sort(
          (a, b) => (s.stage.leagueTotals[b] ?? 0) - (s.stage.leagueTotals[a] ?? 0),
        )[0] ?? null;
      // Still resolve a tied first place with the standard overtime chain.
      if (r) {
        const wasLocked = r.locked;
        if (!wasLocked) {
          r.locked = true;
          scoreRound(r);
        }
        if (r.kind === 'overtime' && !wasLocked) settleOvertime(s, r, events);
        else
          settleRegular(
            s,
            r.kind === 'regular'
              ? r
              : [...s.rounds].reverse().find((round) => round.kind === 'regular')!,
            events,
          );
        s.phase = {
          kind: 'reveal',
          roundNo: r.no,
          step: 0,
          nextStepAt: ctx.now + ctx.timing.revealStepMs,
        };
      }
      return;
    }
    // Hybrid semifinal withdrawals award the match immediately, without waiting three rounds.
    if (s.stage.context === 'semifinal') {
      const matches = s.stage.matches;
      if (matches.every((m) => m.filter((x) => !s.participants[x]!.withdrawn).length < 2)) {
        s.stage.contenders = matches.flatMap((m) => m.filter((x) => !s.participants[x]!.withdrawn));
        s.stage.pending = 'final';
        if (r && !r.locked) lockRound(s, ctx, events);
      }
    }
  }
  emptyRoom(s, ctx);
  if (s.status === 'running') {
    if (
      s.phase.kind === 'selection' &&
      currentRound(s)!
        .players.filter((x) => s.participants[x]!.role === 'player')
        .every((x) =>
          Object.values(currentRound(s)!.submissions).some(
            (sub) => sub.playerId === x && sub.confirmed && !sub.invalid,
          ),
        )
    )
      beginPresentation(s, ctx, events);
    maybeCloseReview(s, ctx, events);
  }
}

/** Invalid commands return the exact original state, including RNG and clocks. */
export function reduce(
  state: EngineState,
  cmd: Command,
  ctx: Ctx,
): { state: EngineState; events: EngineEvent[]; nextDeadline: number | null } {
  const reject = (reason: string) => ({
    state,
    events: [{ type: 'commandRejected', reason, command: cmd.type }],
    nextDeadline: nextDeadline(state, ctx),
  });
  if (!Number.isFinite(ctx.now) || ctx.now < state.lastNow) return reject('invalidClock');
  if (state.status === 'finished' || state.status === 'terminated')
    return cmd.type === 'tick' || cmd.type === 'restore'
      ? { state, events: [], nextDeadline: null }
      : reject('sessionClosed');
  // Rating changes only the current round's voter row and review completion.
  // Copy those paths instead of cloning the entire roster and all past rounds per vote.
  const ratingRound = cmd.type === 'rate' ? currentRound(state) : undefined;
  const s: EngineState =
      cmd.type === 'rate'
        ? {
            ...state,
            rounds: state.rounds.map((round) =>
              round === ratingRound
                ? {
                    ...round,
                    ratings: {
                      ...round.ratings,
                      [cmd.participantId]: { ...round.ratings[cmd.participantId] },
                    },
                    reviewFinished: [...round.reviewFinished],
                  }
                : round,
            ),
          }
        : structuredClone(state),
    events: EngineEvent[] = [];
  const r = currentRound(s),
    p =
      'participantId' in cmd && Object.hasOwn(s.participants, cmd.participantId)
        ? s.participants[cmd.participantId]
        : undefined;
  if ('participantId' in cmd && cmd.type !== 'join' && (!p || p.status === 'kicked'))
    return reject('unknownParticipant');
  const participantActions = [
    'select',
    'confirm',
    'rate',
    'finishReview',
    'leaveToVoter',
    'changeNickname',
    'join',
  ];
  if (s.status === 'paused' && participantActions.includes(cmd.type)) return reject('paused');
  const live = s.status === 'running';
  const selection = live && s.phase.kind === 'selection' && ctx.now < s.phase.endsAt;
  const voting =
    live &&
    (s.phase.kind === 'review' || s.phase.kind === 'presentation') &&
    ctx.now < s.phase.endsAt;
  switch (cmd.type) {
    case 'updateSettings': {
      if (
        s.status !== 'lobby' &&
        ((cmd.patch.mode !== undefined && cmd.patch.mode !== s.config.mode) ||
          (cmd.patch.leagueRounds !== undefined &&
            cmd.patch.leagueRounds !== s.config.leagueRounds))
      )
        return reject('settingsLocked');
      const config = { ...s.config, ...cmd.patch };
      if (!validConfig(config)) return reject('invalidSettings');
      s.config = config;
      break;
    }
    case 'join': {
      if (
        !/^[a-zA-Z0-9_-]{1,100}$/.test(cmd.participantId) ||
        Object.hasOwn(Object.prototype, cmd.participantId) ||
        cmd.participantId === 'prototype' ||
        Object.hasOwn(s.participants, cmd.participantId)
      )
        return reject('identityExists');
      if (!nicknameValid(s, cmd.nickname, cmd.participantId)) return reject('invalidNickname');
      const role = s.status === 'lobby' ? cmd.wants : 'voter';
      if (role === 'voter' && !s.config.acceptVoters) return reject('votersClosed');
      if (
        role === 'player' &&
        Object.values(s.participants).filter((x) => x.role === 'player' && x.status !== 'kicked')
          .length >= 1000
      )
        return reject('playerLimit');
      const pending = role === 'player' ? s.config.playerApproval : s.config.voterApproval;
      s.participants[cmd.participantId] = {
        id: cmd.participantId,
        nickname: cmd.nickname,
        role,
        status: pending ? 'pending' : 'active',
        connected: true,
        votingFromRound: r ? r.no + (s.phase.kind === 'selection' ? 0 : 1) : 1,
        byeCount: 0,
        joinedAt: ctx.now,
        needsNickname: false,
        eliminated: false,
        withdrawn: false,
      };
      events.push({ type: 'participantJoined', participantId: cmd.participantId });
      emptyRoom(s, ctx);
      break;
    }
    case 'approveParticipant':
    case 'rejectParticipant': {
      if (p!.status !== 'pending') return reject('notPending');
      if (cmd.type === 'rejectParticipant' && p!.role === 'voter') {
        p!.status = 'left';
        p!.connected = false;
      } else {
        if (cmd.type === 'rejectParticipant' || s.status !== 'lobby') p!.role = 'voter';
        p!.status = 'active';
        p!.votingFromRound = r ? r.no + (s.phase.kind === 'selection' ? 0 : 1) : 1;
      }
      emptyRoom(s, ctx);
      events.push({ type: 'participantChanged', participantId: p!.id });
      break;
    }
    case 'start': {
      if (s.status !== 'lobby') return reject('notLobby');
      const players = activePlayers(s);
      if (players.length < (s.config.mode === 'hybrid' ? 4 : 2))
        return reject('insufficientPlayers');
      if (!ctx.prompts.length) return reject('noPrompts');
      for (const participant of Object.values(s.participants))
        if (participant.role === 'player' && participant.status === 'pending') {
          participant.role = 'voter';
          participant.status = 'active';
          events.push({
            type: 'participantChanged',
            participantId: participant.id,
            reason: 'rosterLocked',
          });
        }
      s.status = 'running';
      s.stage.context = s.config.mode === 'elimination' ? 'elimination' : 'league';
      s.stage.contenders = players;
      events.push({ type: 'sessionStarted' });
      emptyRoom(s, ctx);
      prepareRound(s, ctx, events);
      break;
    }
    case 'select': {
      if (
        !selection ||
        !r!.players.includes(p!.id) ||
        p!.role !== 'player' ||
        p!.status !== 'active'
      )
        return reject('cannotSelect');
      if (!validMedia(cmd.media) || (cmd.media.source !== 'system' && !r!.config.customContent))
        return reject('invalidMedia');
      const old = Object.values(r!.submissions).find((x) => x.playerId === p!.id);
      const id =
        old?.id ??
        `s${Math.floor(random(s) * 4294967296).toString(36)}_${Math.floor(random(s) * 4294967296).toString(36)}`;
      r!.submissions[id] = {
        id,
        playerId: p!.id,
        media: JSON.parse(JSON.stringify(cmd.media)) as MediaRef,
        confirmed: false,
        invalid: false,
        hidden: false,
        compensation: false,
        customType:
          cmd.media.source === 'system'
            ? null
            : cmd.media.source === 'youtube'
              ? 'youtube'
              : cmd.media.mediaType,
      };
      events.push({ type: 'submissionUpdated', submissionId: id, participantId: p!.id });
      break;
    }
    case 'confirm': {
      const sub = r && Object.values(r.submissions).find((x) => x.playerId === p!.id && !x.invalid);
      if (!selection || !sub || p!.role !== 'player') return reject('cannotConfirm');
      sub.confirmed = true;
      if (
        r!.players
          .filter((id) => s.participants[id]!.role === 'player')
          .every((id) =>
            Object.values(r!.submissions).some(
              (x) => x.playerId === id && x.confirmed && !x.invalid,
            ),
          )
      )
        beginPresentation(s, ctx, events);
      break;
    }
    case 'rate': {
      const sub = r?.submissions[cmd.submissionId];
      if (
        !voting ||
        !sub ||
        sub.invalid ||
        sub.hidden ||
        !eligibleParticipant(s, p!.id, r!) ||
        !r!.eligibility[sub.id]?.includes(p!.id) ||
        !Number.isInteger(cmd.score) ||
        cmd.score < 1 ||
        cmd.score > 5
      )
        return reject('cannotRate');
      if (s.phase.kind === 'presentation' && r!.order[s.phase.index] !== sub.id)
        return reject('notCurrentSubmission');
      (r!.ratings[p!.id] ??= {})[sub.id] = cmd.score;
      r!.reviewFinished = r!.reviewFinished.filter((id) => id !== p!.id);
      events.push({
        type: 'ratingProgress',
        submissionId: sub.id,
        count: Object.values(r!.ratings).filter((v) => v[sub.id] !== undefined).length,
      });
      break;
    }
    case 'finishReview':
      if (!voting || s.phase.kind !== 'review' || !eligibleParticipant(s, p!.id, r!))
        return reject('notReview');
      if (!r!.reviewFinished.includes(p!.id)) r!.reviewFinished.push(p!.id);
      maybeCloseReview(s, ctx, events);
      break;
    case 'closeReview':
      if (!live || s.phase.kind !== 'review') return reject('notReview');
      lockRound(s, ctx, events);
      break;
    case 'addTime':
      if (!selection || ![15, 30, 60].includes(cmd.seconds)) return reject('notSelection');
      if (s.phase.kind === 'selection') s.phase.endsAt += cmd.seconds * 1000;
      break;
    case 'replacePrompt': {
      const inPreview = s.status === 'lobby' || s.phase.kind === 'results';
      if (
        inPreview
          ? s.previewReplaced
          : !selection ||
            r!.promptReplaced ||
            s.phase.kind !== 'selection' ||
            ctx.now >= s.phase.promptReplaceUntil
      )
        return reject('cannotReplacePrompt');
      const prompt = drawPrompt(s, ctx);
      if (!prompt) return reject('noPrompts');
      if (inPreview) {
        s.promptPreview = prompt;
        s.previewReplaced = true;
      } else {
        r!.prompt = prompt;
        r!.promptReplaced = true;
        r!.submissions = {};
        if (s.phase.kind === 'selection')
          s.phase.endsAt =
            ctx.now +
            (r!.kind === 'overtime'
              ? ctx.timing.overtimeSelectionMs
              : r!.config.selectionSeconds * 1000);
      }
      break;
    }
    case 'rejectCustom': {
      const sub = r && Object.values(r.submissions).find((x) => x.playerId === p!.id);
      if (!selection || !sub || !sub.media || sub.media.source === 'system' || sub.invalid)
        return reject('cannotRejectCustom');
      sub.invalid = true;
      sub.confirmed = false;
      sub.media = null;
      events.push({ type: 'customRejected', participantId: p!.id });
      break;
    }
    case 'hideCurrent': {
      if (!live || s.phase.kind !== 'presentation') return reject('notPresentation');
      const sub = r!.submissions[r!.order[s.phase.index]!]!;
      if (sub.hidden) return reject('alreadyHidden');
      sub.hidden = true;
      sub.invalid = true;
      sub.compensation = sub.media?.source === 'system';
      for (const votes of Object.values(r!.ratings)) delete votes[sub.id];
      events.push({ type: 'contentHidden', submissionId: sub.id, compensation: sub.compensation });
      break;
    }
    case 'pause':
      if (!live) return reject('notRunning');
      s.status = 'paused';
      s.pausedFrom = { ...s.phase };
      s.pausedAt = ctx.now;
      events.push({ type: 'paused' });
      break;
    case 'resume':
      if (s.status !== 'paused') return reject('notPaused');
      resumePhase(s, s.pausedFrom!, ctx.now - s.pausedAt!, ctx);
      s.status = 'running';
      s.pausedFrom = null;
      s.pausedAt = null;
      events.push({ type: 'resumed' });
      break;
    case 'restore':
      // SPEC-QUESTION: Persisted lastNow is the recovery checkpoint; offline time does not consume remaining phase time. Shell provides the 3-2-1 overlay.
      if (live) resumePhase(s, s.phase, ctx.now - s.lastNow, ctx);
      events.push({ type: 'restored', countdownSeconds: 3 });
      break;
    case 'skipResults':
      if (!live || s.phase.kind !== 'results') return reject('notResults');
      nextRound(s, ctx, events);
      break;
    case 'moveToVoter':
    case 'leaveToVoter':
      if (p!.role !== 'player' || p!.status !== 'active') return reject('notPlayer');
      withdraw(s, p!.id, false, ctx, events);
      break;
    case 'kick':
      withdraw(s, p!.id, true, ctx, events);
      break;
    case 'resetNickname': {
      let n = Object.keys(s.participants).indexOf(p!.id) + 1;
      while (!nicknameValid(s, `Katılımcı ${n}`, p!.id)) n++;
      p!.nickname = `Katılımcı ${n}`;
      p!.needsNickname = true;
      events.push({ type: 'participantChanged', participantId: p!.id });
      break;
    }
    case 'changeNickname':
      if (!nicknameValid(s, cmd.nickname, p!.id)) return reject('invalidNickname');
      p!.nickname = cmd.nickname;
      p!.needsNickname = false;
      break;
    case 'connection':
      p!.connected = cmd.connected;
      emptyRoom(s, ctx);
      if (live) maybeCloseReview(s, ctx, events);
      break;
    case 'endGame':
      finish(s, 'manager', events);
      break;
    case 'tick':
      if (s.status === 'lobby') return { state, events: [], nextDeadline: null };
      if ((nextDeadline(s, ctx) ?? Infinity) > ctx.now)
        return { state, events: [], nextDeadline: nextDeadline(s, ctx) };
      tick(s, ctx, events);
      break;
  }
  if (
    JSON.stringify(s.phase) !== JSON.stringify(state.phase) &&
    !events.some((event) => event.type === 'phaseChanged')
  ) {
    events.push({ type: 'phaseChanged', phase: s.phase });
  }
  // Administrative forfeits can change phase while paused. Resume that new phase, not the obsolete one.
  if (
    s.status === 'paused' &&
    cmd.type !== 'pause' &&
    JSON.stringify(s.phase) !== JSON.stringify(state.phase)
  ) {
    s.pausedFrom = { ...s.phase };
    s.pausedAt = ctx.now;
  }
  s.lastNow = ctx.now;
  return { state: s, events, nextDeadline: nextDeadline(s, ctx) };
}

/** A planning envelope using default media slots, maximum overtime and no manual pauses/time additions. */
export function estimateDuration(
  config: SessionConfig,
  playerCount: number,
): { minMs: number; maxMs: number } {
  if (playerCount < 2 || (config.mode === 'hybrid' && playerCount < 4))
    return { minMs: 0, maxMs: 0 };
  let counts: number[];
  if (config.mode === 'league')
    counts = Array.from({ length: config.leagueRounds }, () => playerCount);
  else if (config.mode === 'hybrid')
    counts = [...Array<number>(5).fill(playerCount), 4, 4, 4, 2, 2, 2];
  else {
    counts = [];
    for (let n = playerCount; n > 1; n = Math.ceil(n / 2)) counts.push(n - (n % 2));
  }
  const minMs = counts.reduce((n, p) => n + p * 15000 + p * 1500 + 15000, 0);
  const maxMs =
    counts.reduce(
      (n, p) =>
        n +
        config.selectionSeconds * 1000 +
        p * 30000 +
        config.reviewSeconds * 1000 +
        p * 1500 +
        15000,
      0,
    ) +
    counts.reduce(
      (n, p) => n + 30000 + p * 30000 + config.reviewSeconds * 1000 + p * 1500 + 20000,
      0,
    );
  // SPEC-QUESTION: Estimate excludes unlimited manual pause/addTime and assumes all players submit; early finish can be shorter.
  return { minMs, maxMs };
}
