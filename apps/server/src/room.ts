import {
  createSession,
  reduce,
  project,
  nextDeadline,
  DEFAULT_TIMING,
  type EngineState,
  type Ctx,
  type Command,
  type Viewer,
  type EngineEvent,
} from '@mol/engine';
import {
  clientMessageSchema,
  participantCommandSchema,
  managerCommandSchema,
  joinRequestSchema,
  takeoverRequestSchema,
  type ShellAction,
  type ManagerShellInfo,
  type ServerMessage,
} from '@mol/shared';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { ApiFailure, authenticate, body, json, SESSION_LIFETIME_MS } from './auth';
import { gameSessions } from './db/schema';
import {
  digest,
  randomSecret,
  signParticipantToken,
  verifyParticipantToken,
  signDisplayToken,
  verifyDisplayToken,
} from './security';
import { pairingRegistry, pairingRegistryRoute, expirePairIndex } from './display-pairing';

type Session = typeof gameSessions.$inferSelect;
type Attachment = { viewer: Viewer; credential: string; expiresAt: number; closed?: boolean };
type Ack = Extract<ServerMessage, { type: 'ack' }>;
// DO get/put support 128 keys; leave room for the snapshot and a transition ACK.
const COMMAND_BATCH_SIZE = 120;
interface Pending {
  engine: EngineState;
  events: EngineEvent[];
  id: string;
  now: number;
  ack?: { key: string; value: Ack };
  acks?: { key: string; value: Ack }[];
}
interface Takeover {
  requestId: string;
  participantId: string;
  nickname: string;
  requestedAt: number;
  receiptHash: string;
  status: 'pending' | 'approved' | 'rejected';
  token?: string;
}
interface RematchIntent {
  session: Session;
  engine: EngineState;
  ack: { key: string; value: Ack };
}
interface Snapshot {
  session: Session;
  engine: EngineState;
  seq: number;
  tokens: Record<string, string>;
  pending: Pending | null;
  broadcastAt: number | null;
  closed: boolean;
  takeovers: Record<string, Takeover>;
  tokenSessions: Record<string, string>;
  pairCode: ManagerShellInfo['displayPairCode'];
  display: { credential: string; expiresAt: number; sessionId: string } | null;
  recoveryUntil: number | null;
  rematch: RematchIntent | null;
}

/** A serialized, persistent shell. Only engine projections cross the socket boundary. */
export class RoomDurableObject {
  private data: Snapshot | undefined;
  private prompts: Ctx['prompts'] = [];
  private promptsLoadedAt = -Infinity;
  private incoming: {
    ws: WebSocket;
    message: string | ArrayBuffer;
    resolve: () => void;
    reject: (error: unknown) => void;
  }[] = [];
  private draining = false;
  private batch: {
    events: EngineEvent[];
    previous: Map<string, Ack>;
    acks: Map<string, Ack>;
    dirty: boolean;
    replies: { ws: WebSocket; message: Ack }[];
  } | null = null;
  constructor(
    readonly state: DurableObjectState,
    readonly env: Cloudflare.Env,
  ) {
    state.blockConcurrencyWhile(async () => {
      this.data = await state.storage.get<Snapshot>('room');
      if (!this.data) return;
      // Defaults allow persisted M2a/M2b-core rooms to wake under v0.2.
      this.data.takeovers ??= {};
      this.data.tokenSessions ??= {};
      this.data.pairCode ??= null;
      this.data.display ??= null;
      this.data.recoveryUntil ??= null;
      this.data.rematch ??= null;
      await this.replay();
      await this.replayRematch();
      // Hibernation preserves sockets. Lost persisted connections indicate restart;
      // an ordinary alarm wake in an already empty room must keep its deadlines.
      if (
        !state.getWebSockets().length &&
        !this.data.closed &&
        ['running', 'paused'].includes(this.data.engine.status) &&
        Object.values(this.data.engine.participants).some((p) => p.connected)
      ) {
        this.data.recoveryUntil = this.now() + 3000;
        await this.save();
        await this.apply({ type: 'restore' });
      }
      await this.schedule();
    });
  }
  private now() {
    return Math.max(Date.now(), this.data?.engine.lastNow ?? 0);
  }
  private engineNow() {
    return this.data?.recoveryUntil ? this.data.recoveryUntil - 3000 : this.now();
  }
  private async context(force = false): Promise<Ctx> {
    // Cache during vote bursts; always refresh before a command can draw a prompt.
    if (!force && this.now() - this.promptsLoadedAt < 1000)
      return { now: this.engineNow(), prompts: this.prompts, timing: DEFAULT_TIMING };
    const rows = await this.env.DB.prepare(
      `SELECT id,text,owner_type,business_id FROM prompts WHERE status='active' AND admin_blocked=0 AND (owner_type='platform' OR business_id=?) ORDER BY id`,
    )
      .bind(this.data!.session.businessId)
      .all<{ id: string; text: string; owner_type: string; business_id: string | null }>();
    this.prompts = rows.results.map((p) => ({
      id: p.id,
      text: p.text,
      owner: p.owner_type === 'platform' ? 'platform' : p.business_id!,
    }));
    this.promptsLoadedAt = this.now();
    return { now: this.engineNow(), prompts: this.prompts, timing: DEFAULT_TIMING };
  }
  private async save() {
    await this.state.storage.put('room', this.data!);
  }
  private send(ws: WebSocket, message: ServerMessage) {
    if (message.type === 'ack' && this.batch) {
      this.batch.replies.push({ ws, message });
      return;
    }
    try {
      ws.send(JSON.stringify(message));
    } catch {
      /* Close handler reconciles membership. */
    }
  }
  private attachment(ws: WebSocket): Attachment {
    return ws.deserializeAttachment() as Attachment;
  }
  private close(ws: WebSocket, reason: Extract<ServerMessage, { type: 'closed' }>['reason']) {
    const a = this.attachment(ws);
    if (a.closed) return;
    ws.serializeAttachment({ ...a, closed: true });
    this.send(ws, { type: 'closed', reason });
    try {
      ws.close(4000, reason);
    } catch {
      /* Already closed. */
    }
  }
  private sockets() {
    return this.state.getWebSockets().filter((ws) => !this.attachment(ws).closed);
  }
  private view(ws: WebSocket) {
    const a = this.attachment(ws);
    this.send(ws, {
      type: 'view',
      seq: this.data!.seq,
      serverNow: this.now(),
      view: project(this.data!.engine, a.viewer, {
        now: this.now(),
        prompts: this.prompts,
        timing: DEFAULT_TIMING,
      }),
      ...(a.viewer.kind === 'manager' ? { shell: this.shellInfo() } : {}),
    });
  }
  private shellInfo(): ManagerShellInfo {
    const d = this.data!;
    return {
      pendingTakeovers: Object.values(d.takeovers)
        .filter((t) => t.status === 'pending')
        .map(({ requestId, participantId, nickname, requestedAt }) => ({
          requestId,
          participantId,
          nickname,
          requestedAt,
        })),
      displayPairCode: d.pairCode && d.pairCode.expiresAt > this.now() ? d.pairCode : null,
      displayConnected: this.sockets().some((ws) => {
        const a = this.attachment(ws);
        return (
          a.viewer.kind === 'display' &&
          a.credential === d.display?.credential &&
          a.expiresAt > this.now()
        );
      }),
    };
  }
  private recovery(ws: WebSocket) {
    if (this.data!.recoveryUntil !== null && this.data!.recoveryUntil > this.now())
      this.send(ws, {
        type: 'recovery',
        serverNow: this.now(),
        resumesAt: this.data!.recoveryUntil,
      });
  }
  private async broadcast() {
    this.data!.broadcastAt = null;
    // Only share within this publication: revocation must be checked again next time.
    const managers = new Map<string, Promise<boolean>>();
    for (const ws of this.sockets()) {
      const a = this.attachment(ws);
      let allowed: boolean;
      if (a.viewer.kind === 'manager') {
        const key = `${a.credential}:${a.expiresAt}`;
        if (!managers.has(key)) managers.set(key, this.authorized(a));
        allowed = await managers.get(key)!;
      } else allowed = await this.authorized(a);
      if (allowed) this.view(ws);
      else
        this.close(
          ws,
          a.viewer.kind === 'participant' &&
            this.data!.engine.participants[a.viewer.participantId]?.status === 'kicked'
            ? 'kicked'
            : 'superseded',
        );
    }
  }
  private async schedule() {
    const d = this.data;
    if (!d || d.closed) {
      await this.state.storage.deleteAlarm();
      return;
    }
    const deadlines = [
      d.recoveryUntil ??
        nextDeadline(d.engine, { now: this.now(), prompts: this.prompts, timing: DEFAULT_TIMING }),
      d.engine.status === 'lobby' ? d.session.expiresAt : null,
      d.broadcastAt,
      d.pairCode?.expiresAt ?? null,
    ].filter((n): n is number => n !== null);
    if (deadlines.length)
      await this.state.storage.setAlarm(Math.max(this.now() + 1, Math.min(...deadlines)));
    else await this.state.storage.deleteAlarm();
  }
  private ackKey(viewer: Viewer, id: string) {
    return `ack:${viewer.kind === 'participant' ? `participant:${viewer.participantId}` : viewer.kind}:${id}`;
  }
  private async replay(): Promise<boolean> {
    const d = this.data!,
      p = d.pending;
    if (!p) return true;
    const started = p.events.some((e) => e.type === 'sessionStarted');
    if (started) {
      // D1 batch is atomic. The persisted intent is replayable after either side crashes.
      // credit_consumed also marks unlimited starts, without decrementing their balance.
      const result = await this.env.DB.batch([
        this.env.DB.prepare(
          `UPDATE businesses SET credits=credits-1 WHERE id=? AND active=1 AND unlimited_credits=0 AND credits>0 AND EXISTS (SELECT 1 FROM game_sessions WHERE id=? AND status='lobby' AND credit_consumed=0)`,
        ).bind(d.session.businessId, d.session.id),
        this.env.DB.prepare(
          `UPDATE game_sessions SET credit_consumed=1,credit_charged=(changes()=1),started_at=?,status='running' WHERE id=? AND status='lobby' AND credit_consumed=0 AND (changes()=1 OR EXISTS (SELECT 1 FROM businesses WHERE id=? AND active=1 AND unlimited_credits=1))`,
        ).bind(p.now, d.session.id, d.session.businessId),
      ]);
      if (!result[1]!.meta.changes) {
        const row = await this.env.DB.prepare(
          'SELECT credit_consumed FROM game_sessions WHERE id=?',
        )
          .bind(d.session.id)
          .first<{ credit_consumed: number }>();
        if (!row?.credit_consumed) {
          if (p.ack) {
            p.ack.value = { ...p.ack.value, ok: false, reason: 'INSUFFICIENT_CREDITS' };
            await this.state.storage.put(p.ack.key, p.ack.value);
          }
          d.pending = null;
          await this.save();
          return false;
        }
      }
    }
    const ended = p.engine.status === 'finished' || p.engine.status === 'terminated';
    const statements = [
      this.env.DB.prepare(
        `UPDATE game_sessions SET status=?,settings=?,mode=?,ended_at=?,end_reason=? WHERE id=? AND status!='cancelled'`,
      ).bind(
        p.engine.status,
        JSON.stringify(p.engine.config),
        p.engine.config.mode,
        ended ? p.now : null,
        p.engine.result?.reason ?? null,
        d.session.id,
      ),
    ];
    for (const [i, event] of p.events.entries()) {
      statements.push(
        this.env.DB.prepare(
          'INSERT OR IGNORE INTO session_audit (id,session_id,occurred_at,type,payload) VALUES (?,?,?,?,?)',
        ).bind(`${p.id}:${i}`, d.session.id, p.now, event.type, JSON.stringify(event)),
      );
    }
    if (ended) {
      statements.push(
        this.env.DB.prepare(
          'INSERT OR IGNORE INTO session_reports (id,session_id,summary,created_at) VALUES (?,?,?,?)',
        ).bind(
          d.session.id,
          d.session.id,
          JSON.stringify({
            result: p.engine.result,
            participants: p.engine.participants,
            rounds: p.engine.rounds,
          }),
          p.now,
        ),
      );
      // M6 hook: durable, idempotent cleanup intent; physical asset deletion is deferred.
      statements.push(
        this.env.DB.prepare(
          'INSERT OR IGNORE INTO session_audit (id,session_id,occurred_at,type,payload) VALUES (?,?,?,?,?)',
        ).bind(
          `${d.session.id}:mediaCleanup`,
          d.session.id,
          p.now,
          'privateMediaCleanupRequested',
          '{}',
        ),
      );
    }
    await this.env.DB.batch(statements);
    d.engine = p.engine;
    d.session.status = p.engine.status;
    d.session.settings = p.engine.config;
    d.seq++;
    d.pending = null;
    await this.state.storage.transaction(async (txn) => {
      await txn.put(
        Object.fromEntries([
          ['room', d],
          ...(p.ack ? [[p.ack.key, p.ack.value]] : []),
          ...(p.acks ?? []).map((ack) => [ack.key, ack.value]),
        ]),
      );
    });
    return true;
  }
  private async flushBatch() {
    const batch = this.batch;
    if (!batch?.dirty) return;
    const d = this.data!;
    d.pending = {
      engine: d.engine,
      events: batch.events,
      acks: [...batch.acks].map(([key, value]) => ({ key, value })),
      id: crypto.randomUUID(),
      now: this.engineNow(),
    };
    await this.save();
    await this.replay();
    batch.events = [];
    batch.dirty = false;
    await this.schedule();
  }
  private async apply(command: Command, ack?: Pending['ack']): Promise<Ack | undefined> {
    await this.replay();
    const ctx = await this.context(
        ['start', 'replacePrompt', 'tick', 'skipResults', 'restore'].includes(command.type),
      ),
      d = this.data!;
    const result = reduce(d.engine, command, ctx);
    const rejected = result.events.find((e) => e.type === 'commandRejected');
    if (ack)
      ack.value = {
        ...ack.value,
        ok: !rejected,
        ...(rejected ? { reason: String(rejected.reason) } : {}),
      };
    const samePhase =
      JSON.stringify(result.state.phase) === JSON.stringify(d.engine.phase) &&
      result.state.status === d.engine.status;
    if (this.batch && !rejected && samePhase && ['rate', 'finishReview'].includes(command.type)) {
      d.engine = result.state;
      d.broadcastAt ??= ctx.now + 250;
      this.batch.events.push(...result.events);
      if (ack) this.batch.acks.set(ack.key, ack.value);
      this.batch.dirty = true;
      return ack?.value;
    }
    await this.flushBatch();
    if (result.state === d.engine && !result.events.length) {
      if (ack) await this.state.storage.put(ack.key, ack.value);
      await this.schedule();
      return ack?.value;
    }
    if (rejected) {
      if (ack) await this.state.storage.put(ack.key, ack.value);
      return ack?.value;
    }
    const coalesce =
      samePhase &&
      ['rate', 'join', 'connection', 'select', 'confirm', 'finishReview'].includes(command.type);
    // Include the publication deadline in the durable intent's snapshot.
    d.broadcastAt = coalesce ? (d.broadcastAt ?? ctx.now + 250) : null;
    d.pending = {
      engine: result.state,
      events: result.events,
      id: crypto.randomUUID(),
      now: ctx.now,
      ...(ack ? { ack } : {}),
    };
    await this.save();
    const ok = await this.replay();
    if (!ok) return ack ? await this.state.storage.get<Ack>(ack.key) : undefined;
    if (!coalesce) await this.broadcast();
    for (const ws of this.sockets()) {
      const v = this.attachment(ws).viewer;
      if (v.kind === 'participant' && d.engine.participants[v.participantId]?.status === 'kicked')
        this.close(ws, 'kicked');
    }
    await this.schedule();
    return ack?.value;
  }
  private async commitShell(ack?: { key: string; value: Ack }) {
    this.data!.seq++;
    this.data!.broadcastAt = null;
    await this.state.storage.transaction(async (txn) => {
      await txn.put('room', this.data!);
      if (ack) await txn.put(ack.key, ack.value);
    });
    await this.broadcast();
    await this.schedule();
  }
  private async takeover(request: Request) {
    const input = await body(request, takeoverRequestSchema),
      d = this.data!;
    if ('requestId' in input) {
      const pending = d.takeovers[input.requestId];
      if (!pending || pending.receiptHash !== (await digest(input.receipt)))
        throw new ApiFailure(404, 'TAKEOVER_NOT_FOUND');
      if (pending.status === 'approved' && pending.token) {
        return json(
          { status: 'approved', participantId: pending.participantId, token: pending.token },
          200,
          this.participantCookie(request, pending.token),
        );
      }
      return json({ status: pending.status });
    }
    if (!['lobby', 'running', 'paused'].includes(d.engine.status))
      throw new ApiFailure(409, 'SESSION_CLOSED');
    if (await this.identity(request)) throw new ApiFailure(409, 'IDENTITY_EXISTS');
    const fold = (name: string) => name.toLocaleLowerCase('tr');
    const participant = Object.values(d.engine.participants).find(
      (p) =>
        fold(p.nickname) === fold(input.nickname) && p.status !== 'kicked' && p.status !== 'left',
    );
    if (!participant) throw new ApiFailure(404, 'PARTICIPANT_NOT_FOUND');
    const requestId = crypto.randomUUID(),
      receipt = randomSecret();
    d.takeovers[requestId] = {
      requestId,
      participantId: participant.id,
      nickname: participant.nickname,
      requestedAt: this.now(),
      receiptHash: await digest(receipt),
      status: 'pending',
    };
    await this.commitShell();
    return json({ requestId, receipt, status: 'pending' }, 202);
  }
  private participantCookie(request: Request, token: string) {
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    return {
      'Set-Cookie': `mol_participant_${this.data!.session.roomCode}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_LIFETIME_MS / 1000}${secure}`,
    };
  }
  private async shell(action: ShellAction, ack: { key: string; value: Ack }) {
    const d = this.data!;
    if (action.kind === 'rematch') {
      if (!['finished', 'terminated'].includes(d.engine.status))
        throw new ApiFailure(409, 'SESSION_NOT_FINISHED');
      const now = this.now();
      const session: Session = {
        ...d.session,
        id: crypto.randomUUID(),
        status: 'lobby',
        settings: d.engine.config,
        mode: d.engine.config.mode,
        createdAt: now,
        expiresAt: now,
        startedAt: null,
        endedAt: null,
        endReason: null,
        creditConsumed: false,
        creditRefunded: false,
        adminIntervention: false,
      };
      const engine = createSession(
        { seed: crypto.getRandomValues(new Uint32Array(1))[0]!, config: session.settings },
        await this.context(true),
      );
      d.rematch = { session, engine, ack };
      await this.save();
      await this.replayRematch();
      return;
    }
    if (action.kind === 'createDisplayPairCode') {
      const response = await pairingRegistry(this.env).fetch('https://room/pair-index/reserve', {
        method: 'POST',
        body: JSON.stringify({ roomCode: d.session.roomCode, sessionId: d.session.id }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ApiFailure(503, 'PAIR_CODE_UNAVAILABLE');
      }
      const pair = await response.json<{ code: string; expiresAt: number }>();
      d.pairCode = { code: pair.code, expiresAt: pair.expiresAt };
      await this.commitShell(ack);
      return;
    }
    const pending = d.takeovers[action.requestId];
    if (!pending || pending.status !== 'pending') throw new ApiFailure(409, 'TAKEOVER_NOT_PENDING');
    if (action.kind === 'rejectTakeover') pending.status = 'rejected';
    else {
      const participant = d.engine.participants[pending.participantId];
      if (
        !participant ||
        participant.status === 'kicked' ||
        participant.status === 'left' ||
        !['lobby', 'running', 'paused'].includes(d.engine.status)
      )
        throw new ApiFailure(409, 'PARTICIPANT_UNAVAILABLE');
      // Rotate the credential and persist its deliverable result in the same transaction.
      pending.token = await this.issue(pending.participantId, false);
      pending.status = 'approved';
      for (const other of Object.values(d.takeovers))
        if (other !== pending && other.participantId === pending.participantId) {
          other.status = 'rejected';
          delete other.token;
        }
    }
    await this.commitShell(ack);
    // broadcast() has already superseded sockets with revoked credentials.
  }
  private async pairDisplay(request: Request) {
    const input = await request.json<{ code: string; sessionId: string }>(),
      d = this.data!;
    if (
      !d.pairCode ||
      input.sessionId !== d.session.id ||
      input.code !== d.pairCode.code ||
      d.pairCode.expiresAt <= this.now()
    )
      throw new ApiFailure(404, 'PAIR_CODE_INVALID');
    const now = this.now();
    const token = await signDisplayToken(
      {
        kind: 'display',
        sessionId: d.session.id,
        roomCode: d.session.roomCode,
        nonce: randomSecret(16),
        issuedAt: now,
        expiresAt: now + SESSION_LIFETIME_MS,
      },
      this.env.TOKEN_SECRET,
    );
    d.display = {
      credential: await digest(token),
      expiresAt: now + SESSION_LIFETIME_MS,
      sessionId: d.session.id,
    };
    d.pairCode = null;
    await this.commitShell();
    return json({ token, roomCode: d.session.roomCode });
  }
  private async replayRematch() {
    const d = this.data!,
      intent = d.rematch;
    if (!intent) return;
    let session = await drizzle(this.env.DB)
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, intent.session.id))
      .get();
    if (!session) {
      const s = intent.session;
      await this.env.DB.prepare(
        `INSERT OR IGNORE INTO game_sessions (id,business_id,room_code,status,mode,settings,created_at,expires_at)
        SELECT ?,id,?,'lobby',?,?,?,? + lobby_lifetime_hours * 3600000 FROM businesses
        WHERE id=? AND active=1 AND (credits>0 OR unlimited_credits=1)
        AND (SELECT COUNT(*) FROM game_sessions WHERE business_id=businesses.id AND status IN ('lobby','running','paused')) < concurrent_session_limit`,
      )
        .bind(
          s.id,
          s.roomCode,
          s.mode,
          JSON.stringify(s.settings),
          s.createdAt,
          s.createdAt,
          s.businessId,
        )
        .run();
      session = await drizzle(this.env.DB)
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.id, s.id))
        .get();
      if (!session) {
        const account = await this.env.DB.prepare(
          'SELECT credits,unlimited_credits,active FROM businesses WHERE id=?',
        )
          .bind(s.businessId)
          .first<{ credits: number; unlimited_credits: number; active: number }>();
        intent.ack.value = {
          ...intent.ack.value,
          ok: false,
          reason: !account?.active
            ? 'UNAUTHENTICATED'
            : !account.unlimited_credits && account.credits === 0
              ? 'INSUFFICIENT_CREDITS'
              : 'CONCURRENT_SESSION_LIMIT',
        };
        d.rematch = null;
        await this.commitShell(intent.ack);
        return;
      }
    }
    await this.env.DB.batch([
      this.env.DB.prepare(
        'INSERT OR IGNORE INTO session_audit (id,session_id,occurred_at,type,payload) VALUES (?,?,?,?,?)',
      ).bind(
        `${session.id}:rematch`,
        d.session.id,
        session.createdAt,
        'rematchCreated',
        JSON.stringify({ sessionId: session.id }),
      ),
      this.env.DB.prepare(
        'INSERT OR IGNORE INTO session_audit (id,session_id,occurred_at,type,payload) VALUES (?,?,?,?,?)',
      ).bind(`${session.id}:created`, session.id, session.createdAt, 'lobbyCreated', '{}'),
    ]);
    // Transport identities survive, while the fresh engine waits for their new role requests.
    for (const id of Object.keys(d.tokens)) {
      if (d.engine.participants[id]?.status === 'kicked') {
        delete d.tokens[id];
        delete d.tokenSessions[id];
      } else d.tokenSessions[id] ??= d.session.id;
    }
    d.engine = intent.engine;
    d.session = session;
    d.rematch = null;
    d.takeovers = {};
    d.pairCode = null;
    d.recoveryUntil = null;
    d.broadcastAt = null;
    await this.commitShell(intent.ack);
  }
  async fetch(request: Request): Promise<Response> {
    return this.state.blockConcurrencyWhile(async () => {
      try {
        return await this.route(request);
      } catch (error) {
        if (error instanceof ApiFailure) return json({ error: { code: error.code } }, error.status);
        throw error;
      }
    });
  }
  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname;
    if (path.startsWith('/pair-index/')) return await pairingRegistryRoute(request, this.state);
    if (path === '/initialize' && request.method === 'POST') {
      const session = await request.json<Session>();
      if (this.data?.session.id === session.id) return new Response(null, { status: 204 });
      if (
        this.data &&
        !this.data.closed &&
        !['finished', 'terminated'].includes(this.data.engine.status)
      )
        throw new ApiFailure(409, 'ROOM_ACTIVE');
      for (const ws of this.sockets()) this.close(ws, 'sessionEnded');
      this.data = {
        session,
        engine: createSession(
          { seed: crypto.getRandomValues(new Uint32Array(1))[0]!, config: session.settings },
          { now: Date.now(), prompts: [], timing: DEFAULT_TIMING },
        ),
        seq: (this.data?.seq ?? 0) + 1,
        tokens: {},
        pending: null,
        broadcastAt: null,
        closed: false,
        takeovers: {},
        tokenSessions: {},
        pairCode: null,
        display: null,
        recoveryUntil: null,
        rematch: null,
      };
      await this.save();
      await this.schedule();
      return new Response(null, { status: 204 });
    }
    if (!this.data) throw new ApiFailure(404, 'ROOM_NOT_FOUND');
    await this.replay();
    await this.replayRematch();
    if (path === '/admin-report' && request.method === 'GET') {
      if (url.searchParams.get('sessionId') !== this.data.session.id)
        throw new ApiFailure(404, 'NOT_FOUND');
      const { participants, rounds, result } = this.data.engine;
      return json({ participants, rounds, result });
    }
    if (path === '/close') {
      if (url.searchParams.get('sessionId') !== this.data.session.id) {
        if (url.searchParams.get('reason') === 'adminTerminated')
          throw new ApiFailure(409, 'SESSION_NOT_ACTIVE');
        return new Response(null, { status: 204 });
      }
      if (url.searchParams.get('reason') === 'adminTerminated') {
        const intentKey = `adminTermination:${this.data.session.id}`;
        const intended = await this.state.storage.get<boolean>(intentKey);
        if (!intended) {
          if (this.data.closed || ['finished', 'terminated'].includes(this.data.engine.status))
            throw new ApiFailure(409, 'SESSION_NOT_ACTIVE');
          await this.state.storage.put(intentKey, true);
        }
        if (!['finished', 'terminated'].includes(this.data.engine.status))
          await this.apply({ type: 'endGame' });
        const now = this.now(),
          id = this.data.session.id;
        await this.env.DB.batch([
          this.env.DB.prepare(
            `UPDATE game_sessions SET status='terminated',ended_at=coalesce(ended_at,?),end_reason='adminTerminated',admin_intervention=1 WHERE id=? AND (status IN ('lobby','running','paused') OR (status='terminated' AND end_reason='manager'))`,
          ).bind(now, id),
          this.env.DB.prepare(
            `INSERT OR IGNORE INTO admin_actions (id,occurred_at,action,target_id,details) SELECT ?,?,'sessionTerminated',?,'{}' FROM game_sessions WHERE id=? AND end_reason='adminTerminated'`,
          ).bind(`${id}:adminTerminated`, now, id, id),
        ]);
      }
      this.data.closed = true;
      await this.save();
      const reason =
        url.searchParams.get('reason') === 'roomExpired' ? 'roomExpired' : 'sessionEnded';
      for (const ws of this.sockets()) this.close(ws, reason);
      await this.schedule();
      return new Response(null, { status: 204 });
    }
    if (this.data.closed) throw new ApiFailure(404, 'ROOM_NOT_FOUND');
    if (path === '/display-pair') return await this.pairDisplay(request);
    if (path.endsWith('/takeover') && request.method === 'POST')
      return await this.takeover(request);
    if (path.endsWith('/join') && request.method === 'POST') return await this.join(request);
    if (path.endsWith('/ws') && request.method === 'GET') return await this.connect(request);
    throw new ApiFailure(404, 'NOT_FOUND');
  }
  private token(request: Request) {
    const url = new URL(request.url);
    return (
      url.searchParams.get('token') ??
      request.headers.get('authorization')?.replace(/^Bearer /, '') ??
      request.headers
        .get('cookie')
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith(`mol_participant_${this.data!.session.roomCode}=`))
        ?.split('=')[1]
    );
  }
  private async identity(
    request: Request,
  ): Promise<{ participantId: string; token: string } | null> {
    const token = this.token(request);
    if (!token) return null;
    const c = await verifyParticipantToken(token, this.env.TOKEN_SECRET);
    const d = this.data!;
    if (
      !c ||
      c.sessionId !== (d.tokenSessions[c.participantId] ?? d.session.id) ||
      c.roomCode !== d.session.roomCode ||
      d.tokens[c.participantId] !== (await digest(token))
    )
      throw new ApiFailure(401, 'INVALID_TOKEN');
    if (d.engine.participants[c.participantId]?.status === 'kicked')
      throw new ApiFailure(403, 'KICKED');
    return { participantId: c.participantId, token };
  }
  private async issue(participantId: string, persist = true) {
    const d = this.data!,
      now = this.now();
    const token = await signParticipantToken(
      {
        kind: 'participant',
        nonce: randomSecret(16),
        participantId,
        sessionId: d.session.id,
        roomCode: d.session.roomCode,
        issuedAt: now,
        expiresAt: now + SESSION_LIFETIME_MS,
      },
      this.env.TOKEN_SECRET,
    );
    d.tokens[participantId] = await digest(token);
    d.tokenSessions[participantId] = d.session.id;
    if (persist) await this.save();
    return token;
  }
  private async join(request: Request) {
    const input = await body(request, joinRequestSchema);
    const existing = await this.identity(request);
    if (existing && this.data!.engine.participants[existing.participantId]) return json(existing);
    if (this.data!.recoveryUntil !== null) throw new ApiFailure(409, 'RECOVERING');
    const participantId = existing?.participantId ?? crypto.randomUUID();
    const ack = await this.apply(
      { type: 'join', participantId, ...input },
      {
        key: `join:${participantId}`,
        value: { type: 'ack', clientMsgId: participantId, ok: true },
      },
    );
    if (!ack?.ok) throw new ApiFailure(409, ack?.reason ?? 'JOIN_REJECTED');
    // join creates a roster member, not a live socket.
    await this.apply({
      type: 'connection',
      participantId,
      connected: this.sockets().some((ws) => {
        const v = this.attachment(ws).viewer;
        return v.kind === 'participant' && v.participantId === participantId;
      }),
    });
    const token = existing?.token ?? (await this.issue(participantId));
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    return json({ participantId, token }, 201, {
      'Set-Cookie': `mol_participant_${this.data!.session.roomCode}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_LIFETIME_MS / 1000}${secure}`,
    });
  }
  private async connect(request: Request) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      throw new ApiFailure(426, 'WEBSOCKET_REQUIRED');
    const origin = request.headers.get('origin');
    if (
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      throw new ApiFailure(403, 'INVALID_ORIGIN');
    const explicitToken =
      new URL(request.url).searchParams.has('token') || request.headers.has('authorization');
    const managerCookie = request.headers
      .get('cookie')
      ?.split(';')
      .some((c) => c.trim().startsWith('mol_business_session='));
    const rawToken = this.token(request);
    const displayClaims = rawToken
      ? await verifyDisplayToken(rawToken, this.env.TOKEN_SECRET)
      : null;
    const identity =
      !displayClaims && (explicitToken || !managerCookie) ? await this.identity(request) : null;
    let a: Attachment;
    if (displayClaims) {
      const display = this.data!.display;
      if (
        !display ||
        displayClaims.roomCode !== this.data!.session.roomCode ||
        displayClaims.sessionId !== display.sessionId ||
        (await digest(rawToken!)) !== display.credential
      )
        throw new ApiFailure(401, 'INVALID_TOKEN');
      a = {
        viewer: { kind: 'display' },
        credential: display.credential,
        expiresAt: displayClaims.expiresAt,
      };
      for (const ws of this.sockets())
        if (this.attachment(ws).viewer.kind === 'display') this.close(ws, 'superseded');
    } else if (identity) {
      const c = (await verifyParticipantToken(identity.token, this.env.TOKEN_SECRET))!;
      a = {
        viewer: { kind: 'participant', participantId: identity.participantId },
        credential: await digest(identity.token),
        expiresAt: c.expiresAt,
      };
      for (const ws of this.sockets()) {
        const v = this.attachment(ws).viewer;
        if (v.kind === 'participant' && v.participantId === identity.participantId)
          this.close(ws, 'superseded');
      }
    } else {
      const auth = await authenticate(request, this.env, 'business');
      if (auth.ownerId !== this.data!.session.businessId) throw new ApiFailure(403, 'FORBIDDEN');
      a = { viewer: { kind: 'manager' }, credential: auth.id, expiresAt: auth.expiresAt };
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(a);
    if (
      a.viewer.kind === 'participant' &&
      this.data!.engine.participants[a.viewer.participantId] &&
      this.data!.recoveryUntil === null
    )
      await this.apply({
        type: 'connection',
        participantId: a.viewer.participantId,
        connected: true,
      });
    await this.context();
    // A fresh/replacement socket always gets a snapshot, even when fanout is deferred.
    this.view(pair[1]);
    if (a.viewer.kind === 'display') {
      this.data!.seq++;
      await this.save();
      await this.broadcast();
    }
    this.recovery(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  private async authorized(a: Attachment): Promise<boolean> {
    if (a.closed || a.expiresAt <= this.now()) return false;
    if (a.viewer.kind === 'participant')
      return (
        this.data!.tokens[a.viewer.participantId] === a.credential &&
        this.data!.engine.participants[a.viewer.participantId]?.status !== 'kicked'
      );
    if (a.viewer.kind === 'display') return this.data!.display?.credential === a.credential;
    return !!(await this.env.DB.prepare(
      `SELECT 1 FROM auth_sessions s JOIN businesses b ON b.id=s.owner_id WHERE s.id=? AND s.role='business' AND s.owner_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND b.active=1`,
    )
      .bind(a.credential, this.data!.session.businessId, this.now())
      .first());
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    return new Promise<void>((resolve, reject) => {
      this.incoming.push({ ws, message, resolve, reject });
      if (!this.draining) {
        this.draining = true;
        void this.drainMessages();
      }
    });
  }
  private async drainMessages() {
    try {
      while (this.incoming.length) {
        // Outside the input gate so a burst can enter the same durable commit.
        await new Promise((resolve) => setTimeout(resolve, 10));
        const jobs = this.incoming.splice(0, COMMAND_BATCH_SIZE);
        try {
          await this.state.blockConcurrencyWhile(async () => {
            const keys = jobs.flatMap(({ ws, message }) => {
              try {
                if (typeof message !== 'string' || message.length > 16384) return [];
                const parsed = clientMessageSchema.safeParse(JSON.parse(message));
                return parsed.success && parsed.data.type !== 'ping'
                  ? [this.ackKey(this.attachment(ws).viewer, parsed.data.clientMsgId)]
                  : [];
              } catch {
                return [];
              }
            });
            this.batch = {
              events: [],
              previous: keys.length ? await this.state.storage.get<Ack>(keys) : new Map(),
              acks: new Map(),
              dirty: false,
              replies: [],
            };
            try {
              for (const job of jobs) await this.processMessage(job.ws, job.message);
              await this.flushBatch();
              const replies = this.batch.replies;
              this.batch = null;
              for (const reply of replies) this.send(reply.ws, reply.message);
            } finally {
              this.batch = null;
            }
          });
          for (const job of jobs) job.resolve();
        } catch (error) {
          for (const job of jobs) job.reject(error);
        }
      }
    } finally {
      this.draining = false;
    }
  }
  private async processMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const a = this.attachment(ws);
    if (!(await this.authorized(a))) {
      this.close(ws, 'superseded');
      return;
    }
    let input: unknown;
    try {
      if (typeof message !== 'string' || message.length > 16384) throw new Error();
      input = JSON.parse(message);
    } catch {
      ws.close(1008, 'INVALID_MESSAGE');
      return;
    }
    const parsed = clientMessageSchema.safeParse(input);
    if (!parsed.success) {
      const id = (input as { clientMsgId?: unknown })?.clientMsgId;
      if (typeof id === 'string' && id.length <= 200)
        this.send(ws, { type: 'ack', clientMsgId: id, ok: false, reason: 'INVALID_COMMAND' });
      return;
    }
    const msg = parsed.data;
    if (msg.type === 'ping') {
      this.send(ws, { type: 'pong', t: msg.t, serverNow: this.now() });
      return;
    }
    // IDs stay consumed across rematches and across cmd/shell message kinds.
    const key = this.ackKey(a.viewer, msg.clientMsgId);
    const previous = this.batch
      ? (this.batch.acks.get(key) ?? this.batch.previous.get(key))
      : await this.state.storage.get<Ack>(key);
    if (previous) {
      this.send(ws, previous);
      return;
    }
    if (msg.type === 'shell') {
      await this.flushBatch();
      const ack: Ack = { type: 'ack', clientMsgId: msg.clientMsgId, ok: true };
      try {
        if (a.viewer.kind !== 'manager') throw new ApiFailure(403, 'FORBIDDEN');
        await this.shell(msg.action, { key, value: ack });
      } catch (error) {
        if (!(error instanceof ApiFailure)) throw error;
        ack.ok = false;
        ack.reason = error.code;
        await this.state.storage.put(key, ack);
      }
      const stored = (await this.state.storage.get<Ack>(key)) ?? ack;
      this.batch?.previous.set(key, stored);
      this.send(ws, stored);
      return;
    }
    if (this.data!.recoveryUntil !== null) {
      const ack: Ack = {
        type: 'ack',
        clientMsgId: msg.clientMsgId,
        ok: false,
        reason: 'RECOVERING',
      };
      await this.state.storage.put(key, ack);
      this.batch?.previous.set(key, ack);
      this.send(ws, ack);
      return;
    }
    const valid =
      a.viewer.kind === 'manager'
        ? managerCommandSchema.safeParse(msg.cmd)
        : a.viewer.kind === 'participant'
          ? participantCommandSchema.safeParse(msg.cmd)
          : null;
    if (!valid?.success) {
      const ack: Ack = {
        type: 'ack',
        clientMsgId: msg.clientMsgId,
        ok: false,
        reason: 'FORBIDDEN',
      };
      await this.state.storage.put(key, ack);
      this.batch?.previous.set(key, ack);
      this.send(ws, ack);
      return;
    }
    const command = (
      a.viewer.kind === 'participant'
        ? { ...valid.data, participantId: a.viewer.participantId }
        : valid.data
    ) as Command;
    const ack = await this.apply(command, {
      key,
      value: { type: 'ack', clientMsgId: msg.clientMsgId, ok: true },
    });
    if (ack) {
      this.batch?.previous.set(key, ack);
      this.send(ws, ack);
    }
  }
  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean) {
    await this.state.blockConcurrencyWhile(async () => {
      const a = this.attachment(ws);
      try {
        ws.close(code, reason);
      } catch {
        /* Already closed. */
      }
      ws.serializeAttachment({ ...a, closed: true });
      if (this.data?.closed) return;
      if (a.viewer.kind === 'display') {
        this.data!.seq++;
        await this.save();
        await this.broadcast();
        return;
      }
      if (a.viewer.kind !== 'participant' || this.data!.recoveryUntil !== null) return;
      const id = a.viewer.participantId;
      if (
        !this.sockets().some((s) => {
          const v = this.attachment(s).viewer;
          return v.kind === 'participant' && v.participantId === id;
        })
      )
        await this.apply({ type: 'connection', participantId: id, connected: false });
    });
  }
  async webSocketError(ws: WebSocket, _error: unknown) {
    await this.webSocketClose(ws, 1011, 'SOCKET_ERROR', false);
  }
  async alarm() {
    await this.state.blockConcurrencyWhile(async () => {
      if (!this.data) {
        await expirePairIndex(this.state);
        return;
      }
      if (this.data.closed) return;
      await this.replay();
      await this.replayRematch();
      const d = this.data;
      if (d.pairCode && d.pairCode.expiresAt <= this.now()) {
        d.pairCode = null;
        d.seq++;
        await this.save();
        await this.broadcast();
      }
      if (d.recoveryUntil !== null) {
        if (d.recoveryUntil > this.now()) {
          await this.schedule();
          return;
        }
        // Persist clearing the overlay together with the restore intent.
        d.recoveryUntil = null;
        await this.apply({ type: 'restore' });
        // Reconcile lost sockets only after the overlay. Disconnecting every voter
        // earlier would let the engine close review before their reconnect window.
        for (const p of Object.values(d.engine.participants)) {
          const connected = this.sockets().some((ws) => {
            const a = this.attachment(ws);
            return (
              a.viewer.kind === 'participant' &&
              a.viewer.participantId === p.id &&
              a.credential === d.tokens[p.id]
            );
          });
          if (p.connected !== connected)
            await this.apply({ type: 'connection', participantId: p.id, connected });
        }
      }
      if (d.engine.status === 'lobby') {
        const row = await drizzle(this.env.DB)
          .select()
          .from(gameSessions)
          .where(eq(gameSessions.id, d.session.id))
          .get();
        if (!row || row.status === 'cancelled' || row.expiresAt <= this.now()) {
          await this.env.DB.prepare(
            `UPDATE game_sessions SET status='cancelled',ended_at=?,end_reason='lobbyExpired' WHERE id=? AND status='lobby'`,
          )
            .bind(this.now(), d.session.id)
            .run();
          d.closed = true;
          await this.save();
          for (const ws of this.sockets()) this.close(ws, 'roomExpired');
          await this.schedule();
          return;
        }
        d.session.expiresAt = row.expiresAt;
      } else await this.apply({ type: 'tick' });
      if (d.broadcastAt !== null && d.broadcastAt <= this.now()) {
        await this.broadcast();
        await this.save();
      }
      await this.schedule();
    });
  }
}
