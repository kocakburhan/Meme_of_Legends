# @mol/engine

Pure, deterministic JSON state machine implementing `docs/contracts/engine-api.md`.
The product rules remain in `docs/PRODUCT_SPEC.md`; this file documents integration details.

```ts
import { createSession, reduce, project, DEFAULT_TIMING } from '@mol/engine';

const ctx = {
  now: 0,
  prompts: [{ id: 'p1', text: 'Maaşın yattığı an', owner: 'platform' }],
  timing: DEFAULT_TIMING,
};
let state = createSession({ seed: 123, config: { mode: 'league', leagueRounds: 3 } }, ctx);
const result = reduce(
  state,
  { type: 'join', participantId: 'user1', nickname: 'Şakacı', wants: 'player' },
  ctx,
);
state = result.state;
const view = project(state, { kind: 'participant', participantId: 'user1' }, ctx);
```

- The shell authenticates command origin and participant identity, supplies the live prompt pool and a monotonic millisecond clock, persists accepted state, and schedules `tick` at `nextDeadline`. No engine timers or I/O exist.
- Each due tick advances one transition and anchors its next phase to `ctx.now`: late delivery preserves complete media slots; an immediate duplicate is harmless. Rejected commands return the identical input state and do not consume entropy. An early tick is a no-op.
- Pass the **same timing constants** for the life of a session. Media duration and clip bounds are checked here; file size, MIME inspection, EXIF removal, embedding permissions, and asset access are shell responsibilities.
- `EngineEvent[]` is privileged audit data, **not a public broadcast format**. Send only `project()` views to clients. Manager views deliberately include sender identity during selection/presentation. Public views expose no sender mapping or scores before lock, then reveal results step by step. Display review is a waiting screen; participant review contains anonymous submissions.
- `phase` remains the frozen phase during a pause. `pausedFrom` and `pausedAt` record its recovery checkpoint. Explicit pause survives `restore`. Restore emits the countdown request; the shell renders the recovery overlay. Persist engine state without adding non-JSON values.
- Round scores and votes are historical snapshots. `stageTotals` derives hidden-system-content compensation without rewriting these scores. Overtime rounds contribute neither totals nor jury ballots. Current stage totals appear in public `table` only after reveal; final `result.ranking` uses shared ranks.
- At finalization private media references are cleared in all rounds; `customType` survives for reporting. The shell must delete the physical uploads/YouTube details and perform seven-day nickname anonymization. Retention redaction is the deliberate exception to locked-round immutability.
- Participant and submission IDs are internal identifiers, never human nicknames. IDs generated for submissions carry no sender identity or selection-order index. `nickname` handles Unicode and Turkish case folding.

## Specification questions implemented as explicit assumptions

Each assumption has a `// SPEC-QUESTION:` comment in source and a scenario test.

1. An empty live prompt pool prevents starting; if it becomes empty mid-game, the next round terminates with `reason: 'noPrompts'` rather than inventing a prompt or waiting indefinitely.
2. If hybrid league membership drops below four mid-round, lock current votes and resolve the final league table, including its first-place overtime when needed.
3. Restore preserves the time remaining at persisted `lastNow`; offline time does not consume phase time. The shell renders the three-second recovery overlay without an extra engine phase.
4. Duration estimates are a planning envelope with default media timings and at most one overtime per regular round. Manual pause/time additions are unbounded and excluded; incomplete submissions can finish faster than the estimate.
5. If every qualified juror has exactly the same average, suppress both awards, preserving the rule that nobody receives both.

## Verification

`pnpm --filter @mol/engine test` runs scenario tests and 2,100 generated games, spanning all three modes, 2–64 players (hybrid minimum four), and 0–300 voters. Every generated command is replayed from a JSON-restored input and checked for input immutability, deterministic output, serializability, voting authority, anonymity, and eventual termination. Random commands include missing selections/votes, kicks, departures, disconnects, hidden content, pauses, and restore. Seeds are reported on failure. These tests use an in-repo seeded generator, with no additional runtime or test dependencies.

`pnpm --filter @mol/engine build` emits the public API and declaration files, excluding test helpers.
