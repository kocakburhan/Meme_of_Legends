import { createSession, DEFAULT_TIMING, reduce } from './index.js';
import type { Command, Ctx, EngineState, EngineEvent, SessionConfig } from './index.js';

export class Game {
  ctx: Ctx = {
    now: 0,
    prompts: Array.from({ length: 20 }, (_, i) => ({
      id: `prompt${i}`,
      text: `Durum ${i}`,
      owner: i % 2 ? 'platform' : 'business',
    })),
    timing: { ...DEFAULT_TIMING },
  };
  state: EngineState;
  events: EngineEvent[] = [];
  constructor(config: Partial<SessionConfig> = {}, players = 2, voters = 0, seed = 1) {
    this.state = createSession(
      { seed, config: { mode: 'league', leagueRounds: 1, ...config } },
      this.ctx,
    );
    for (let i = 0; i < players; i++)
      this.send({ type: 'join', participantId: `p${i}`, nickname: `Oyuncu ${i}`, wants: 'player' });
    for (let i = 0; i < voters; i++)
      this.send({ type: 'join', participantId: `v${i}`, nickname: `Seyirci ${i}`, wants: 'voter' });
  }
  get round() {
    return this.state.rounds.at(-1)!;
  }
  send(cmd: Command) {
    const result = reduce(this.state, cmd, this.ctx);
    this.state = result.state;
    this.events = result.events;
    return result;
  }
  start() {
    this.send({ type: 'start' });
    return this;
  }
  advance() {
    const due = this.send({ type: 'tick' }).nextDeadline;
    if (due !== null) {
      this.ctx.now = Math.max(this.ctx.now, due);
      this.send({ type: 'tick' });
    }
  }
  select(id: string, confirm = false) {
    this.send({
      type: 'select',
      participantId: id,
      media: { source: 'system', memeId: 'same-meme', mediaType: 'image' },
    });
    if (confirm) this.send({ type: 'confirm', participantId: id });
  }
  submitAll() {
    for (const id of this.round.players)
      if (this.state.participants[id]!.role === 'player') this.select(id, true);
  }
  toReview() {
    if (this.state.phase.kind === 'selection') this.advance();
    while (this.state.phase.kind === 'presentation') this.advance();
  }
  rateScores(scores: Record<string, number>) {
    this.toReview();
    for (const sub of Object.values(this.round.submissions))
      for (const id of this.round.eligibility[sub.id] ?? [])
        this.send({
          type: 'rate',
          participantId: id,
          submissionId: sub.id,
          score: (scores[sub.playerId] ?? 3) as 1 | 2 | 3 | 4 | 5,
        });
  }
  close() {
    this.send({ type: 'closeReview' });
  }
  nextSelection() {
    let n = 0;
    while (!['selection', 'finished'].includes(this.state.phase.kind) && n++ < 1000) this.advance();
    if (n >= 1000) throw new Error('Stuck');
  }
  play(scores: Record<string, number>) {
    this.submitAll();
    this.rateScores(scores);
    this.close();
    this.nextSelection();
  }
  finish() {
    let n = 0;
    while (!['finished', 'terminated'].includes(this.state.status) && n++ < 5000) this.advance();
    if (n >= 5000) throw new Error('Stuck');
  }
}
