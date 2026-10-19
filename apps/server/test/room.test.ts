import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CONFIG,
  DEFAULT_TIMING,
  createSession,
  reduce,
  type EngineState,
  type View,
} from '@mol/engine';
import { serverMessageSchema, type ServerMessage } from '@mol/shared';
import { digest } from '../src/security';
import { gameSessions } from '../src/db/schema';

let now = Date.now() + 100_000_000;
const connections: WebSocket[] = [];
let code: string;
let cookie: string;
let sessionId: string;
const stub = () => env.ROOM.get(env.ROOM.idFromName(code));
async function api(path: string, data?: unknown, headers: Record<string, string> = {}) {
  return exports.default.fetch(`https://example.com${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
class Client {
  messages: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  constructor(readonly socket: WebSocket) {
    socket.addEventListener('message', (e) => {
      const parsed = serverMessageSchema.parse(JSON.parse(String(e.data)));
      this.messages.push(parsed);
      for (const wake of this.waiters.splice(0)) wake();
    });
    socket.addEventListener('close', (e) => {
      try {
        socket.close(e.code, e.reason);
      } catch {
        /* Already closed. */
      }
    });
    socket.accept();
    connections.push(socket);
  }
  async wait(predicate: (m: ServerMessage) => boolean): Promise<ServerMessage> {
    const deadline = performance.now() + 3000;
    while (performance.now() < deadline) {
      const index = this.messages.findIndex(predicate);
      if (index >= 0) return this.messages.splice(index, 1)[0]!;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Socket response timed out')),
          Math.max(1, deadline - performance.now()),
        );
        this.waiters.push(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    throw new Error('No message');
  }
  async command(cmd: unknown, id = crypto.randomUUID()) {
    this.socket.send(JSON.stringify({ type: 'cmd', cmd, clientMsgId: id }));
    const ack = await this.wait((m) => m.type === 'ack' && m.clientMsgId === id);
    if (ack.type !== 'ack') throw new Error();
    return ack;
  }
  async shell(action: unknown, id = crypto.randomUUID()) {
    this.socket.send(JSON.stringify({ type: 'shell', action, clientMsgId: id }));
    const ack = await this.wait((m) => m.type === 'ack' && m.clientMsgId === id);
    if (ack.type !== 'ack') throw new Error();
    return ack;
  }
  async managerView(
    predicate: (shell: NonNullable<Extract<ServerMessage, { type: 'view' }>['shell']>) => boolean,
  ) {
    const message = await this.wait((m) => m.type === 'view' && !!m.shell && predicate(m.shell));
    if (message.type !== 'view' || !message.shell) throw new Error();
    return message.shell;
  }
  async view(): Promise<View> {
    const m = await this.wait((m) => m.type === 'view');
    if (m.type !== 'view') throw new Error();
    return m.view;
  }
}
async function connect(token?: string, manager = false) {
  const r = await api(
    `/api/rooms/${code}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`,
    undefined,
    { Upgrade: 'websocket', ...(manager ? { cookie } : {}) },
  );
  expect(r.status, await (r.status === 101 ? Promise.resolve('') : r.text())).toBe(101);
  return new Client(r.webSocket!);
}
async function lobby(mode = 'league', unlimited = false) {
  const id = crypto.randomUUID();
  const credential = crypto.randomUUID();
  cookie = `mol_business_session=${credential}`;
  await env.DB.prepare(
    'INSERT INTO businesses (id,name,username,password_hash,credits,unlimited_credits,created_at) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(id, 'Kafe', id, 'unused', 2, unlimited ? 1 : 0, now)
    .run();
  await env.DB.prepare(
    "INSERT INTO auth_sessions (id,role,owner_id,created_at,expires_at) VALUES (?,'business',?,?,?)",
  )
    .bind(await digest(credential), id, now, now + 86_400_000)
    .run();
  await env.DB.prepare(
    "INSERT INTO prompts (id,owner_type,text,normalized_text,created_at,updated_at) VALUES (?,'platform','Komik bir an','komik bir an',?,?) ON CONFLICT DO UPDATE SET admin_blocked=0,status='active'",
  )
    .bind(crypto.randomUUID(), now, now)
    .run();
  const r = await api(
    '/api/business/sessions',
    {
      settings: {
        ...DEFAULT_CONFIG,
        mode,
        leagueRounds: 1,
        selectionSeconds: 30,
        reviewSeconds: 15,
      },
    },
    { cookie },
  );
  expect(r.status).toBe(201);
  const data = await r.json<{ session: { id: string; roomCode: string } }>();
  code = data.session.roomCode;
  sessionId = data.session.id;
  return id;
}
async function createPairCode(manager: Client, id = crypto.randomUUID()) {
  expect((await manager.shell({ kind: 'createDisplayPairCode' }, id)).ok).toBe(true);
  const info = await manager.managerView((s) => s.displayPairCode !== null);
  return info.displayPairCode!;
}
async function join(nickname: string, wants = 'player', headers: Record<string, string> = {}) {
  const r = await api(`/api/rooms/${code}/join`, { nickname, wants }, headers);
  expect(r.status).toBe(201);
  return r.json<{ participantId: string; token: string }>();
}
async function snapshot() {
  return runInDurableObject(
    stub(),
    async (_instance, state) =>
      (await state.storage.get<{ engine: EngineState; seq: number; pending: unknown }>('room'))!,
  );
}
async function advance() {
  const d = await snapshot();
  const p = d.engine.phase;
  now = Math.max(now + 1, 'endsAt' in p ? p.endsAt : 'nextStepAt' in p ? p.nextStepAt : now + 250);
  expect(await runDurableObjectAlarm(stub())).toBe(true);
}
beforeEach(() => {
  now = Date.now() + 100_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(async () => {
  for (const socket of connections.splice(0))
    try {
      socket.close(1000, 'test');
    } catch {
      /* already closed */
    }
  vi.restoreAllMocks();
});

describe('room WebSockets', () => {
  it.each([false, true])(
    'distinguishes actual credit debits for refunds (unlimited: %s)',
    async (unlimited) => {
      const business = await lobby('league', unlimited);
      const manager = await connect(undefined, true);
      await manager.view();
      await join('Birinci');
      await join('İkinci');
      expect((await manager.command({ type: 'start' })).ok).toBe(true);
      const row = await env.DB.prepare(
        'SELECT credit_consumed,credit_charged FROM game_sessions WHERE id=?',
      )
        .bind(sessionId)
        .first();
      expect(row).toMatchObject({ credit_consumed: 1, credit_charged: unlimited ? 0 : 1 });
      await env.DB.prepare(
        "INSERT INTO auth_sessions (id,role,owner_id,created_at,expires_at) VALUES (?,'admin','1',?,?)",
      )
        .bind(await digest(`refund-admin-${unlimited}`), now, now + 100000)
        .run();
      const response = await api(
        `/api/admin/sessions/${sessionId}/refund`,
        {},
        { cookie: `mol_admin_session=refund-admin-${unlimited}` },
      );
      expect(response.status).toBe(unlimited ? 409 : 200);
      expect(
        (await env.DB.prepare('SELECT credits FROM businesses WHERE id=?')
          .bind(business)
          .first<{ credits: number }>())!.credits,
      ).toBe(2);
    },
  );
  it('terminates a paused running session through the admin API and disconnects participants', async () => {
    await lobby();
    const manager = await connect(undefined, true);
    await manager.view();
    const player = await join('Birinci');
    await join('İkinci');
    const connected = await connect(player.token);
    await connected.view();
    expect((await manager.command({ type: 'start' })).ok).toBe(true);
    expect((await manager.command({ type: 'pause' })).ok).toBe(true);
    await env.DB.prepare(
      "INSERT INTO auth_sessions (id,role,owner_id,created_at,expires_at) VALUES (?,'admin','1',?,?)",
    )
      .bind(await digest('terminate-admin'), now, now + 100000)
      .run();
    const response = await api(
      `/api/admin/sessions/${sessionId}/terminate`,
      {},
      { cookie: 'mol_admin_session=terminate-admin' },
    );
    expect(response.status).toBe(200);
    expect(await connected.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'sessionEnded',
    });
    expect((await snapshot()).engine.status).toBe('terminated');
    const row = await env.DB.prepare(
      'SELECT status,end_reason,admin_intervention FROM game_sessions WHERE id=?',
    )
      .bind(sessionId)
      .first();
    expect(row).toMatchObject({
      status: 'terminated',
      end_reason: 'adminTerminated',
      admin_intervention: 1,
    });
  });

  it('serves the active system meme library for room participants', async () => {
    await lobby();
    const categoryId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO categories (id,name,sort_order,archived) VALUES (?,?,0,0)')
      .bind(categoryId, 'İş')
      .run();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO memes (id,category_id,description,media_type,r2_key,status,created_at) VALUES (?,?,?,?,?,'active',?)",
      ).bind(crypto.randomUUID(), categoryId, 'Pazartesi yüzü', 'image', 'e2e/a.png', now),
      env.DB.prepare(
        "INSERT INTO memes (id,category_id,description,media_type,r2_key,status,created_at) VALUES (?,?,?,?,?,'untagged',?)",
      ).bind(
        crypto.randomUUID(),
        categoryId,
        'Toplantı bitmeyen adam',
        'gif',
        'e2e/b.gif',
        now + 1,
      ),
      env.DB.prepare(
        "INSERT INTO memes (id,description,media_type,r2_key,status,created_at) VALUES (?,?,?,?,'active',?)",
      ).bind(crypto.randomUUID(), 'Kategorisiz', 'image', 'e2e/c.png', now + 2),
    ]);
    const r = await api(`/api/rooms/${code}/library`);
    expect(r.status).toBe(200);
    const data = await r.json<{
      memes: { id: string; title: string; category: string | null; mediaType: string }[];
    }>();
    expect(data.memes.map((m) => [m.title, m.category, m.mediaType])).toEqual([
      ['Pazartesi yüzü', 'İş', 'image'],
      ['Kategorisiz', null, 'image'],
    ]);
    expect((await api(`/api/rooms/XXXXXX/library`)).status).toBe(404);
    expect((await api(`/api/rooms/${code}/library`, {})).status).toBe(405);
    // Unknown room codes do not leak the library.
    const other = await api('/api/rooms/ZZZZ99/library');
    expect(other.status).toBe(404);
  });

  it.each([false, true])(
    'replays every ACK in a durable vote batch after interruption (D1 already applied: %s)',
    async (alreadyApplied) => {
      await lobby();
      const a = await join('Birinci'),
        b = await join('İkinci');
      const players = [await connect(a.token), await connect(b.token)];
      const v = await join('Seyirci', 'voter');
      const voter = await connect(v.token);
      const manager = await connect(undefined, true);
      for (const client of [...players, voter, manager]) await client.view();
      await manager.command({ type: 'start' });
      for (const player of players) {
        await player.command({
          type: 'select',
          media: { source: 'system', memeId: 'meme', mediaType: 'image' },
        });
        await player.command({ type: 'confirm' });
      }
      const saved = await snapshot();
      const submissionId = saved.engine.rounds[0]!.order[0]!;
      const first = reduce(
        saved.engine,
        { type: 'rate', participantId: v.participantId, submissionId, score: 3 },
        { now, prompts: [], timing: DEFAULT_TIMING },
      );
      const second = reduce(
        first.state,
        { type: 'rate', participantId: v.participantId, submissionId, score: 5 },
        { now, prompts: [], timing: DEFAULT_TIMING },
      );
      const events = [...first.events, ...second.events];
      const intentId = crypto.randomUUID();
      await runInDurableObject(stub(), async (_i, state) => {
        const room = (await state.storage.get<Record<string, unknown>>('room'))!;
        await state.storage.put('room', {
          ...room,
          broadcastAt: now + 250,
          pending: {
            engine: second.state,
            events,
            id: intentId,
            now,
            acks: ['first-crash-vote', 'second-crash-vote'].map((id) => ({
              key: `ack:participant:${v.participantId}:${id}`,
              value: { type: 'ack', clientMsgId: id, ok: true },
            })),
          },
        });
      });
      if (alreadyApplied)
        await env.DB.batch(
          events.map((event, i) =>
            env.DB.prepare(
              'INSERT INTO session_audit (id,session_id,occurred_at,type,payload) VALUES (?,?,?,?,?)',
            ).bind(`${intentId}:${i}`, sessionId, now, event.type, JSON.stringify(event)),
          ),
        );
      await evictDurableObject(stub());
      for (const id of ['first-crash-vote', 'second-crash-vote'])
        expect((await voter.command({ type: 'rate', submissionId, score: 1 }, id)).ok).toBe(true);
      expect((await snapshot()).engine.rounds[0]!.ratings[v.participantId]![submissionId]).toBe(5);
      expect((await snapshot()).pending).toBeNull();
      const audit = await env.DB.prepare(
        "SELECT count(*) n FROM session_audit WHERE session_id=? AND type='ratingProgress'",
      )
        .bind(sessionId)
        .first<{ n: number }>();
      expect(audit!.n).toBe(2);
    },
  );

  it('coalesces admissions and connections but immediately snapshots new and replacement sockets', async () => {
    await lobby();
    const manager = await connect(undefined, true);
    await manager.view();
    const a = await join('Birinci');
    const first = await connect(a.token);
    expect((await first.view()).participants).toHaveLength(1);
    const b = await join('İkinci');
    const second = await connect(b.token);
    expect((await second.view()).participants).toHaveLength(2);
    expect(manager.messages.filter((m) => m.type === 'view')).toHaveLength(0);
    const replacement = await connect(a.token);
    expect((await replacement.view()).participants).toHaveLength(2);
    expect(await first.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'superseded',
    });
    now += 250;
    await runDurableObjectAlarm(stub());
    expect((await manager.view()).participants).toHaveLength(2);
    expect(manager.messages.filter((m) => m.type === 'view')).toHaveLength(0);
    // A phase transition cancels a pending lobby publication instead of delaying start.
    await join('Seyirci', 'voter');
    expect((await manager.command({ type: 'start' })).ok).toBe(true);
    expect((await manager.view()).phase.kind).toBe('selection');
    const stored = await runInDurableObject(stub(), async (_i, state) =>
      state.storage.get<{ broadcastAt: number | null }>('room'),
    );
    expect(stored!.broadcastAt).toBeNull();
  });
  it('commits concurrent votes and their ACKs together, deduplicates within the batch and survives eviction', async () => {
    await lobby();
    const manager = await connect(undefined, true);
    await manager.view();
    const a = await join('Birinci'),
      b = await join('İkinci');
    const v = await join('Seyirci', 'voter'),
      w = await join('Diğer', 'voter');
    const players = [await connect(a.token), await connect(b.token)];
    const voter = await connect(v.token),
      other = await connect(w.token);
    for (const client of [...players, voter, other]) await client.view();
    await manager.command({ type: 'start' });
    for (const player of players) {
      await player.command({
        type: 'select',
        media: { source: 'system', memeId: 'meme', mediaType: 'image' },
      });
      await player.command({ type: 'confirm' });
    }
    const before = await snapshot();
    const submissionId = before.engine.rounds[0]!.order[0]!;
    const votes = await Promise.all([
      voter.command({ type: 'rate', submissionId, score: 3 }, 'batch-vote'),
      voter.command({ type: 'rate', submissionId, score: 5 }, 'batch-vote'),
      other.command({ type: 'rate', submissionId, score: 4 }, 'other-vote'),
    ]);
    expect(votes.every((a) => a.ok)).toBe(true);
    const saved = await snapshot();
    expect(saved.seq - before.seq).toBe(1);
    expect(saved.engine.rounds[0]!.ratings[v.participantId]![submissionId]).toBe(3);
    expect(saved.engine.rounds[0]!.ratings[w.participantId]![submissionId]).toBe(4);
    expect(saved.pending).toBeNull();
    const audit = await env.DB.prepare(
      "SELECT count(*) AS n FROM session_audit WHERE session_id=? AND type='ratingProgress'",
    )
      .bind(sessionId)
      .first<{ n: number }>();
    expect(audit!.n).toBe(2);
    await evictDurableObject(stub());
    expect((await voter.command({ type: 'rate', submissionId, score: 1 }, 'batch-vote')).ok).toBe(
      true,
    );
    expect((await snapshot()).engine.rounds[0]!.ratings[v.participantId]![submissionId]).toBe(3);
    now += 250;
    await runDurableObjectAlarm(stub());
    const own = await voter.wait(
      (m) => m.type === 'view' && m.view.submissions.some((s) => s.ownScore === 3),
    );
    expect(own.type).toBe('view');
    const theirs = await other.wait(
      (m) => m.type === 'view' && m.view.submissions.some((s) => s.ownScore === 4),
    );
    expect(theirs.type).toBe('view');
    // Cross the storage API's 128-key limit in one socket burst.
    const burst = await Promise.all(
      Array.from({ length: 130 }, (_, i) =>
        other.command({ type: 'rate', submissionId, score: 4 }, `burst-${i}`),
      ),
    );
    expect(burst.every((ack) => ack.ok)).toBe(true);
    const storedAcks = await runInDurableObject(stub(), async (_i, state) =>
      state.storage.list({ prefix: `ack:participant:${w.participantId}:burst-` }),
    );
    expect(storedAcks.size).toBe(130);
  });

  it.each(['elimination', 'league'])(
    'plays an entire %s game, persists credits/report, hides authors and rejects unauthorized commands',
    async (mode) => {
      const business = await lobby(mode);
      const manager = await connect(undefined, true);
      await manager.view();
      const a = await join('Birinci'),
        b = await join('İkinci'),
        v = await join('Seyirci', 'voter');
      const players = [await connect(a.token), await connect(b.token)],
        voter = await connect(v.token);
      const pairing = await createPairCode(manager);
      const paired = await (
        await api('/api/display/pair', { code: pairing.code })
      ).json<{ token: string }>();
      const display = await connect(paired.token);
      await display.view();
      for (const player of [...players, voter]) await player.view();
      expect((await players[0]!.command({ type: 'start' })).reason).toBe('FORBIDDEN');
      expect(
        (
          await players[0]!.command({
            type: 'connection',
            participantId: a.participantId,
            connected: false,
          })
        ).ok,
      ).toBe(false);
      expect((await manager.command({ type: 'start' }, 'start-once')).ok).toBe(true);
      expect((await manager.command({ type: 'start' }, 'start-once')).ok).toBe(true);
      expect(
        (await env.DB.prepare('SELECT credits FROM businesses WHERE id=?')
          .bind(business)
          .first<{ credits: number }>())!.credits,
      ).toBe(1);
      let guard = 0;
      while (!['finished', 'terminated'].includes((await snapshot()).engine.status)) {
        expect(++guard).toBeLessThan(100);
        const state = (await snapshot()).engine;
        if (state.phase.kind === 'selection') {
          for (const [i, player] of players.entries()) {
            const id = [a, b][i]!.participantId;
            if (!state.stage.contenders.includes(id)) continue;
            expect(
              (
                await player.command({
                  type: 'select',
                  media: { source: 'system', memeId: 'meme', mediaType: 'image' },
                })
              ).ok,
            ).toBe(true);
            expect((await player.command({ type: 'confirm' })).ok).toBe(true);
          }
        } else if (state.phase.kind === 'presentation' || state.phase.kind === 'review') {
          const round = state.rounds.at(-1)!;
          if (state.phase.kind === 'presentation') {
            const id = round.order[state.phase.index]!;
            expect(
              (
                await voter.command({
                  type: 'rate',
                  submissionId: id,
                  score: round.submissions[id]!.playerId === a.participantId ? 5 : 1,
                })
              ).ok,
            ).toBe(true);
          } else expect((await manager.command({ type: 'closeReview' })).ok).toBe(true);
        }
        // Every queued public projection must preserve the engine's anonymity boundary.
        for (const client of [...players, voter, display])
          for (const message of client.messages)
            if (
              message.type === 'view' &&
              ['selection', 'presentation', 'review'].includes(message.view.phase.kind)
            ) {
              for (const submission of message.view.submissions)
                expect(submission.playerId).toBeUndefined();
            }
        const after = (await snapshot()).engine;
        if (
          !['finished', 'terminated'].includes(after.status) &&
          JSON.stringify(after.phase) === JSON.stringify(state.phase)
        )
          await advance();
      }
      expect((await snapshot()).engine.result?.champion).toBe(a.participantId);
      const row = await env.DB.prepare(
        'SELECT status,credit_consumed FROM game_sessions WHERE id=?',
      )
        .bind(sessionId)
        .first<{ status: string; credit_consumed: number }>();
      expect(row).toEqual({ status: 'finished', credit_consumed: 1 });
      expect(
        await env.DB.prepare('SELECT session_id FROM session_reports WHERE session_id=?')
          .bind(sessionId)
          .first(),
      ).toBeTruthy();
      expect(
        await env.DB.prepare(
          "SELECT id FROM session_audit WHERE session_id=? AND type='privateMediaCleanupRequested'",
        )
          .bind(sessionId)
          .first(),
      ).toBeTruthy();
    },
  );
  it('reuses browser identity, reserves nicknames, supersedes sockets and preserves idempotency through hibernation', async () => {
    await lobby();
    const a = await join('İSİM');
    const duplicate = await api(`/api/rooms/${code}/join`, { nickname: 'isim', wants: 'voter' });
    expect(duplicate.status).toBe(409);
    await duplicate.json();
    const reuse = await api(
      `/api/rooms/${code}/join`,
      { nickname: 'Başka', wants: 'voter' },
      { cookie: `mol_participant_${code}=${a.token}` },
    );
    expect(await reuse.json()).toEqual(a);
    const first = await connect(a.token);
    await first.view();
    const second = await connect(a.token);
    await second.view();
    expect(await first.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'superseded',
    });
    expect((await second.command({ type: 'changeNickname', nickname: 'Yeni' }, 'once')).ok).toBe(
      true,
    );
    const before = await snapshot();
    await evictDurableObject(stub());
    expect((await second.command({ type: 'changeNickname', nickname: 'Farklı' }, 'once')).ok).toBe(
      true,
    );
    expect((await snapshot()).engine.participants[a.participantId]!.nickname).toBe('Yeni');
    expect((await snapshot()).seq).toBe(before.seq);
    const manager = await connect(undefined, true);
    await manager.view();
    expect((await manager.command({ type: 'kick', participantId: a.participantId })).ok).toBe(true);
    expect(await second.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'kicked',
    });
    expect(
      (
        await api(
          `/api/rooms/${code}/join`,
          { nickname: 'Yeni2', wants: 'voter' },
          { cookie: `mol_participant_${code}=${a.token}` },
        )
      ).status,
    ).toBe(403);
  }, 20_000);
  it('handles early and late alarms, restart recovery and unlimited credits', async () => {
    const business = await lobby('league', true);
    const manager = await connect(undefined, true);
    await manager.view();
    const a = await join('Birinci');
    await join('İkinci');
    const player = await connect(a.token);
    await player.view();
    expect((await manager.command({ type: 'start' })).ok).toBe(true);
    const before = (await snapshot()).engine.phase;
    await runDurableObjectAlarm(stub());
    expect((await snapshot()).engine.phase).toEqual(before);
    now += 5000;
    await evictDurableObject(stub(), { webSockets: 'close' });
    now += 90_000;
    const reconnected = await connect(a.token);
    const view = await reconnected.view();
    const recovery = await reconnected.wait((m) => m.type === 'recovery');
    if (recovery.type !== 'recovery') throw new Error();
    expect(recovery.resumesAt - recovery.serverNow).toBe(3000);
    expect((await reconnected.command({ type: 'leaveToVoter' }, 'during-recovery')).reason).toBe(
      'RECOVERING',
    );
    now = recovery.resumesAt;
    await runDurableObjectAlarm(stub());
    expect((await reconnected.command({ type: 'leaveToVoter' }, 'during-recovery')).reason).toBe(
      'RECOVERING',
    );
    expect(view.phase.kind).toBe('selection');
    if (view.phase.kind === 'selection')
      expect(view.phase.endsAt - now).toBeGreaterThanOrEqual(25_000);
    expect(
      (await env.DB.prepare('SELECT credits FROM businesses WHERE id=?')
        .bind(business)
        .first<{ credits: number }>())!.credits,
    ).toBe(2);
    await advance();
    expect((await snapshot()).engine.phase.kind).not.toBe('selection');
  });
  it('rejects expired/scoped tokens and cross-origin manager sockets, closes cancelled lobbies', async () => {
    await lobby();
    const a = await join('Birinci');
    const url = `/api/rooms/${code}/ws?token=${a.token}x`;
    expect((await api(url, undefined, { Upgrade: 'websocket' })).status).toBe(401);
    expect(
      (
        await api(`/api/rooms/${code}/ws`, undefined, {
          Upgrade: 'websocket',
          cookie,
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
    const manager = await connect(undefined, true);
    await manager.view();
    const player = await connect(a.token);
    await player.view();
    expect((await api(`/api/business/sessions/${sessionId}/cancel`, {}, { cookie })).status).toBe(
      200,
    );
    expect(await player.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'sessionEnded',
    });
  });
  it('rechecks credits atomically across concurrent room starts', async () => {
    const business = await lobby();
    await env.DB.prepare('UPDATE businesses SET concurrent_session_limit=2 WHERE id=?')
      .bind(business)
      .run();
    const firstCode = code;
    const managerA = await connect(undefined, true);
    await managerA.view();
    await join('Birinci');
    await join('İkinci');
    const response = await api(
      '/api/business/sessions',
      { settings: { mode: 'league', leagueRounds: 1 } },
      { cookie },
    );
    const second = await response.json<{ session: { roomCode: string } }>();
    expect(response.status).toBe(201);
    code = second.session.roomCode;
    const managerB = await connect(undefined, true);
    await managerB.view();
    await join('Birinci');
    await join('İkinci');
    await env.DB.prepare('UPDATE businesses SET credits=1 WHERE id=?').bind(business).run();
    const replies = await Promise.all([
      managerA.command({ type: 'start' }),
      managerB.command({ type: 'start' }),
    ]);
    expect(replies.map((r) => r.ok).sort()).toEqual([false, true]);
    expect(replies.find((r) => !r.ok)?.reason).toBe('INSUFFICIENT_CREDITS');
    expect(
      (await env.DB.prepare('SELECT credits FROM businesses WHERE id=?')
        .bind(business)
        .first<{ credits: number }>())!.credits,
    ).toBe(0);
    const rows = await env.DB.prepare('SELECT status FROM game_sessions WHERE business_id=?')
      .bind(business)
      .all<{ status: string }>();
    expect(rows.results.map((r) => r.status).sort()).toEqual(['lobby', 'running']);
    code = firstCode;
  });
  it('coalesces rating projections while persisting each vote and scopes live prompts to the business', async () => {
    const business = await lobby();
    const ownPrompt = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO prompts (id,owner_type,business_id,text,normalized_text,created_at,updated_at) VALUES (?,'business',?,'Bizim durum','bizim durum',?,?)",
    )
      .bind(ownPrompt, business, now, now)
      .run();
    await env.DB.prepare('UPDATE prompts SET admin_blocked=1 WHERE id!=?').bind(ownPrompt).run();
    const manager = await connect(undefined, true);
    await manager.view();
    const a = await join('Birinci'),
      b = await join('İkinci'),
      v = await join('Seyirci', 'voter');
    const players = [await connect(a.token), await connect(b.token)],
      voter = await connect(v.token);
    for (const client of [...players, voter]) await client.view();
    expect((await manager.command({ type: 'start' })).ok).toBe(true);
    expect((await snapshot()).engine.rounds[0]!.prompt.id).toBe(ownPrompt);
    const before = (await snapshot()).engine.phase;
    expect((await manager.command({ type: 'addTime', seconds: 15 }, 'time')).ok).toBe(true);
    await manager.command({ type: 'addTime', seconds: 15 }, 'time');
    const after = (await snapshot()).engine.phase;
    if (before.kind === 'selection' && after.kind === 'selection')
      expect(after.endsAt - before.endsAt).toBe(15_000);
    for (const p of players) {
      await p.command({
        type: 'select',
        media: { source: 'system', memeId: 'meme', mediaType: 'image' },
      });
      await p.command({ type: 'confirm' });
    }
    voter.messages = [];
    const state = (await snapshot()).engine,
      round = state.rounds[0]!;
    expect(state.phase.kind).toBe('presentation');
    const submission = round.order[0]!;
    await voter.command({ type: 'rate', submissionId: submission, score: 3 });
    await voter.command({ type: 'rate', submissionId: submission, score: 5 });
    expect((await snapshot()).engine.rounds[0]!.ratings[v.participantId]![submission]).toBe(5);
    expect(voter.messages.filter((m) => m.type === 'view')).toHaveLength(0);
    now += 250;
    await runDurableObjectAlarm(stub());
    await voter.view();
    expect(voter.messages.filter((m) => m.type === 'view')).toHaveLength(0);
  });
  it('expires lobbies by alarm and invalidates revoked managers before further projections', async () => {
    await lobby();
    const manager = await connect(undefined, true);
    const secondManager = await connect(undefined, true);
    await manager.view();
    await secondManager.view();
    const a = await join('Birinci');
    const player = await connect(a.token);
    await player.view();
    await env.DB.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?')
      .bind(now, await digest(cookie.split('=')[1]!))
      .run();
    await player.command({ type: 'changeNickname', nickname: 'Değişen' });
    expect(await manager.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'superseded',
    });
    expect(await secondManager.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'superseded',
    });
    const row = await env.DB.prepare('SELECT expires_at FROM game_sessions WHERE id=?')
      .bind(sessionId)
      .first<{ expires_at: number }>();
    now = row!.expires_at;
    await runDurableObjectAlarm(stub());
    expect(await player.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'roomExpired',
    });
    expect(
      (await env.DB.prepare('SELECT status FROM game_sessions WHERE id=?')
        .bind(sessionId)
        .first<{ status: string }>())!.status,
    ).toBe('cancelled');
  });
  it.each([false, true])(
    'replays a persisted start intent after interruption (D1 already committed: %s)',
    async (alreadyCommitted) => {
      const business = await lobby();
      await join('Birinci');
      await join('İkinci');
      const before = await snapshot();
      const context = {
        now,
        prompts: [{ id: 'recovery-prompt', text: 'Kurtarma durumu', owner: 'platform' }],
        timing: DEFAULT_TIMING,
      };
      const started = reduce(before.engine, { type: 'start' }, context);
      expect(started.events.some((e) => e.type === 'sessionStarted')).toBe(true);
      const intent = {
        engine: started.state,
        events: started.events,
        id: crypto.randomUUID(),
        now,
        ack: {
          key: 'ack:manager:start-outbox',
          value: { type: 'ack', clientMsgId: 'start-outbox', ok: true },
        },
      };
      await runInDurableObject(stub(), async (_instance, state) => {
        const saved = await state.storage.get<Record<string, unknown>>('room');
        await state.storage.put('room', { ...saved, pending: intent });
      });
      if (alreadyCommitted)
        await env.DB.batch([
          env.DB.prepare('UPDATE businesses SET credits=credits-1 WHERE id=?').bind(business),
          env.DB.prepare(
            "UPDATE game_sessions SET credit_consumed=1,status='running',started_at=? WHERE id=?",
          ).bind(now, sessionId),
        ]);
      await evictDurableObject(stub());
      const manager = await connect(undefined, true);
      await manager.view();
      expect((await manager.command({ type: 'start' }, 'start-outbox')).ok).toBe(true);
      expect((await snapshot()).pending).toBeNull();
      expect((await snapshot()).engine.status).toBe('running');
      expect(
        (await env.DB.prepare('SELECT credits FROM businesses WHERE id=?')
          .bind(business)
          .first<{ credits: number }>())!.credits,
      ).toBe(1);
      const events = await env.DB.prepare(
        "SELECT id FROM session_audit WHERE session_id=? AND type='sessionStarted'",
      )
        .bind(sessionId)
        .all();
      expect(events.results).toHaveLength(1);
    },
  );
  it('keeps deadlines on an ordinary empty-room wake and terminates after ten minutes', async () => {
    await lobby();
    await join('Birinci');
    await join('İkinci');
    const manager = await connect(undefined, true);
    await manager.view();
    await manager.command({ type: 'start' });
    const phase = (await snapshot()).engine.phase;
    expect(phase.kind).toBe('selection');
    await evictDurableObject(stub(), { webSockets: 'close' });
    if (phase.kind === 'selection') now = phase.endsAt;
    await runDurableObjectAlarm(stub());
    expect((await snapshot()).engine.phase.kind).not.toBe('selection');
    now += DEFAULT_TIMING.emptyRoomMs;
    await runDurableObjectAlarm(stub());
    expect((await snapshot()).engine.status).toBe('terminated');
    expect((await snapshot()).engine.result?.reason).toBe('empty');
  });
  it('approves and rejects takeover requests without losing selections, votes or voting authority', async () => {
    await lobby();
    const manager = await connect(undefined, true);
    await manager.view();
    const a = await join('İSİM'),
      b = await join('İkinci'),
      v = await join('Seyirci', 'voter');
    const old = await connect(a.token),
      other = await connect(b.token),
      voter = await connect(v.token);
    for (const client of [old, other, voter]) await client.view();
    await manager.command({ type: 'start' });
    for (const client of [old, other]) {
      await client.command({
        type: 'select',
        media: { source: 'system', memeId: 'meme', mediaType: 'image' },
      });
      await client.command({ type: 'confirm' });
    }
    const round = (await snapshot()).engine.rounds[0]!;
    await voter.command({ type: 'rate', submissionId: round.order[0]!, score: 4 });
    const before = (await snapshot()).engine;
    const response = await api(`/api/rooms/${code}/takeover`, { nickname: 'isim' });
    expect(response.status).toBe(202);
    const initialReceipt = await response.json<{ requestId: string; receipt: string }>();
    const receipt = { requestId: initialReceipt.requestId, receipt: initialReceipt.receipt };
    const shell = await manager.managerView((s) =>
      s.pendingTakeovers.some((t) => t.requestId === receipt.requestId),
    );
    expect(shell.pendingTakeovers[0]?.participantId).toBe(a.participantId);
    expect(await (await api(`/api/rooms/${code}/takeover`, receipt)).json()).toEqual({
      status: 'pending',
    });
    const stolen = await api(`/api/rooms/${code}/takeover`, { ...receipt, receipt: 'guessed' });
    expect(stolen.status).toBe(404);
    await stolen.json();
    expect(
      (await voter.shell({ kind: 'approveTakeover', requestId: receipt.requestId })).reason,
    ).toBe('FORBIDDEN');
    await evictDurableObject(stub());
    expect(
      (
        await manager.shell(
          { kind: 'approveTakeover', requestId: receipt.requestId },
          'approve-once',
        )
      ).ok,
    ).toBe(true);
    expect(await old.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'superseded',
    });
    const approved = await api(`/api/rooms/${code}/takeover`, receipt);
    expect(approved.headers.get('set-cookie')).toContain('HttpOnly');
    const replacement = await approved.json<{
      status: string;
      participantId: string;
      token: string;
    }>();
    expect(replacement.status).toBe('approved');
    expect(replacement.participantId).toBe(a.participantId);
    expect(replacement.token).not.toBe(a.token);
    const newer = await connect(replacement.token);
    const view = await newer.view();
    expect(view.phase).toEqual(before.phase);
    expect(view.ownSubmission).toBeUndefined();
    const after = (await snapshot()).engine;
    expect(after.rounds).toEqual(before.rounds);
    expect(after.participants[a.participantId]!.role).toBe(
      before.participants[a.participantId]!.role,
    );
    const invalid = await api(`/api/rooms/${code}/ws?token=${a.token}`, undefined, {
      Upgrade: 'websocket',
    });
    expect(invalid.status).toBe(401);
    await invalid.json();
    expect(
      (
        await manager.shell(
          { kind: 'approveTakeover', requestId: receipt.requestId },
          'approve-once',
        )
      ).ok,
    ).toBe(true);
    expect(
      (await (await api(`/api/rooms/${code}/takeover`, receipt)).json<{ token: string }>()).token,
    ).toBe(replacement.token);
    const rejected = await (
      await api(`/api/rooms/${code}/takeover`, { nickname: 'İkinci' })
    ).json<{ requestId: string; receipt: string }>();
    expect(
      (await manager.shell({ kind: 'rejectTakeover', requestId: rejected.requestId })).ok,
    ).toBe(true);
    expect(
      await (
        await api(`/api/rooms/${code}/takeover`, {
          requestId: rejected.requestId,
          receipt: rejected.receipt,
        })
      ).json(),
    ).toEqual({
      status: 'rejected',
    });
    for (const client of [other, voter, newer])
      for (const m of client.messages) if (m.type === 'view') expect(m.shell).toBeUndefined();
  });
  it('pairs one read-only display, enforces single use and expiry, and preserves its role through hibernation', async () => {
    await lobby();
    const manager = await connect(undefined, true);
    await manager.view();
    const firstCode = await createPairCode(manager, 'pair-once');
    expect(firstCode.code).toMatch(/^\d{6}$/);
    expect(firstCode.expiresAt - now).toBe(300_000);
    expect((await manager.shell({ kind: 'createDisplayPairCode' }, 'pair-once')).ok).toBe(true);
    const response = await api('/api/display/pair', { code: firstCode.code });
    expect(response.status).toBe(200);
    const paired = await response.json<{ token: string; roomCode: string }>();
    expect(paired.roomCode).toBe(code);
    const display = await connect(paired.token);
    const view = await display.view();
    expect(view.promptPreview).toBeUndefined();
    expect(view.ownSubmission).toBeUndefined();
    await manager.managerView((s) => s.displayConnected && s.displayPairCode === null);
    const reused = await api('/api/display/pair', { code: firstCode.code });
    expect(reused.status).toBe(404);
    await reused.json();
    for (const action of [
      { kind: 'createDisplayPairCode' },
      { kind: 'rematch' },
      { kind: 'approveTakeover', requestId: 'any' },
      { kind: 'rejectTakeover', requestId: 'any' },
    ])
      expect((await display.shell(action)).reason).toBe('FORBIDDEN');
    expect((await display.command({ type: 'start' })).reason).toBe('FORBIDDEN');
    expect((await display.command({ type: 'changeNickname', nickname: 'Sahte' })).reason).toBe(
      'FORBIDDEN',
    );
    await evictDurableObject(stub());
    display.socket.send(JSON.stringify({ type: 'ping', t: 123 }));
    expect(await display.wait((m) => m.type === 'pong')).toEqual({
      type: 'pong',
      t: 123,
      serverNow: now,
    });
    const secondCode = await createPairCode(manager);
    const second = await (
      await api('/api/display/pair', { code: secondCode.code })
    ).json<{ token: string }>();
    expect(await display.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'superseded',
    });
    const nextDisplay = await connect(second.token);
    await nextDisplay.view();
    const old = await api(`/api/rooms/${code}/ws?token=${paired.token}`, undefined, {
      Upgrade: 'websocket',
    });
    expect(old.status).toBe(401);
    await old.json();
    const expiring = await createPairCode(manager);
    now = expiring.expiresAt;
    const expired = await api('/api/display/pair', { code: expiring.code });
    expect(expired.status).toBe(404);
    await expired.json();
    await runDurableObjectAlarm(stub());
    await manager.managerView((s) => s.displayPairCode === null);
    for (const m of nextDisplay.messages) if (m.type === 'view') expect(m.shell).toBeUndefined();
  });
  it('keeps the room and connected identities through an idempotent rematch and charges only on the new start', async () => {
    const business = await lobby();
    const oldSession = sessionId;
    const manager = await connect(undefined, true);
    await manager.view();
    const a = await join('Birinci'),
      b = await join('İkinci');
    const playerA = await connect(a.token),
      playerB = await connect(b.token);
    await playerA.view();
    await playerB.view();
    expect((await manager.shell({ kind: 'rematch' })).reason).toBe('SESSION_NOT_FINISHED');
    const pairedCode = await createPairCode(manager);
    const paired = await (
      await api('/api/display/pair', { code: pairedCode.code })
    ).json<{ token: string }>();
    const display = await connect(paired.token);
    await display.view();
    await manager.command({ type: 'start' });
    await manager.command({ type: 'endGame' });
    expect((await manager.shell({ kind: 'rematch' }, 'rematch-once')).ok).toBe(true);
    const newSession = (await env.DB.prepare(
      "SELECT id,room_code,credit_consumed FROM game_sessions WHERE business_id=? AND status='lobby'",
    )
      .bind(business)
      .first<{ id: string; room_code: string; credit_consumed: number }>())!;
    expect(newSession.id).not.toBe(oldSession);
    expect(newSession.room_code).toBe(code);
    expect(newSession.credit_consumed).toBe(0);
    expect((await snapshot()).engine.rounds).toHaveLength(0);
    expect((await snapshot()).engine.status).toBe('lobby');
    expect(
      (await env.DB.prepare('SELECT credits FROM businesses WHERE id=?')
        .bind(business)
        .first<{ credits: number }>())!.credits,
    ).toBe(1);
    await evictDurableObject(stub());
    expect((await manager.shell({ kind: 'rematch' }, 'rematch-once')).ok).toBe(true);
    expect(
      (await env.DB.prepare('SELECT COUNT(*) n FROM game_sessions WHERE business_id=?')
        .bind(business)
        .first<{ n: number }>())!.n,
    ).toBe(2);
    const reuse = await api(
      `/api/rooms/${code}/join`,
      { nickname: 'Birinci', wants: 'player' },
      { cookie: `mol_participant_${code}=${a.token}` },
    );
    expect((await reuse.json<{ participantId: string }>()).participantId).toBe(a.participantId);
    expect((await playerB.command({ type: 'join', nickname: 'İkinci', wants: 'player' })).ok).toBe(
      true,
    );
    expect((await snapshot()).engine.participants[b.participantId]!.connected).toBe(true);
    // A display token and a participant token can both reconnect across this room's rematch.
    const restoredDisplay = await connect(paired.token);
    await restoredDisplay.view();
    expect(await display.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'superseded',
    });
    const restoredPlayer = await connect(a.token);
    await restoredPlayer.view();
    expect(await playerA.wait((m) => m.type === 'closed')).toEqual({
      type: 'closed',
      reason: 'superseded',
    });
    expect((await manager.command({ type: 'start' })).ok).toBe(true);
    expect(
      (await env.DB.prepare('SELECT credits FROM businesses WHERE id=?')
        .bind(business)
        .first<{ credits: number }>())!.credits,
    ).toBe(0);
    await manager.command({ type: 'endGame' });
    expect((await manager.shell({ kind: 'rematch' })).reason).toBe('INSUFFICIENT_CREDITS');
    expect(
      (await env.DB.prepare('SELECT COUNT(*) n FROM game_sessions WHERE business_id=?')
        .bind(business)
        .first<{ n: number }>())!.n,
    ).toBe(2);
  });
  it.each(['presentation', 'review', 'results', 'paused'])(
    'restores %s with a recovery countdown and the correct remaining time',
    async (target) => {
      await lobby();
      const manager = await connect(undefined, true);
      await manager.view();
      const a = await join('Birinci'),
        b = await join('İkinci');
      const clients = [await connect(a.token), await connect(b.token)];
      for (const client of clients) await client.view();
      await manager.command({ type: 'start' });
      if (target === 'paused') await manager.command({ type: 'pause' });
      else {
        for (const client of clients) {
          await client.command({
            type: 'select',
            media: { source: 'system', memeId: 'meme', mediaType: 'image' },
          });
          await client.command({ type: 'confirm' });
        }
        let steps = 0;
        while ((await snapshot()).engine.phase.kind !== target) {
          expect(++steps).toBeLessThan(20);
          await advance();
        }
      }
      const before = (await snapshot()).engine;
      const remaining = 'endsAt' in before.phase ? before.phase.endsAt - before.lastNow : 0;
      await evictDurableObject(stub(), { webSockets: 'close' });
      now += 60_000;
      const player = await connect(a.token);
      const view = await player.view();
      const message = await player.wait((m) => m.type === 'recovery');
      if (message.type !== 'recovery') throw new Error();
      expect(message.resumesAt - message.serverNow).toBe(3000);
      await evictDurableObject(stub());
      player.socket.send(JSON.stringify({ type: 'ping', t: 7 }));
      await player.wait((m) => m.type === 'pong');
      expect(view.status).toBe(target === 'paused' ? 'paused' : 'running');
      now = message.resumesAt - 1;
      await runDurableObjectAlarm(stub());
      expect((await snapshot()).engine.phase.kind).toBe(before.phase.kind);
      now = message.resumesAt;
      await runDurableObjectAlarm(stub());
      const restored = (await snapshot()).engine;
      expect(restored.rounds).toEqual(before.rounds);
      if (restored.phase.kind === 'presentation') expect(restored.phase.endsAt - now).toBe(15_000);
      else if (target !== 'paused' && 'endsAt' in restored.phase)
        expect(restored.phase.endsAt - now).toBe(remaining);
      if (target === 'paused') {
        const console = await connect(undefined, true);
        await console.view();
        expect((await console.command({ type: 'resume' })).ok).toBe(true);
        const resumed = (await snapshot()).engine.phase;
        if ('endsAt' in resumed) expect(resumed.endsAt - now).toBe(remaining);
      }
    },
  );
  it('atomically consumes display codes, revokes previous codes and rejects cross-room credentials', async () => {
    await lobby();
    const manager = await connect(undefined, true);
    await manager.view();
    const first = await createPairCode(manager);
    const current = await createPairCode(manager);
    expect(current.code).not.toBe(first.code);
    const revoked = await api('/api/display/pair', { code: first.code });
    expect(revoked.status).toBe(404);
    await revoked.json();
    const raced = await Promise.all([
      api('/api/display/pair', { code: current.code }),
      api('/api/display/pair', { code: current.code }),
    ]);
    expect(raced.map((r) => r.status).sort()).toEqual([200, 404]);
    const token = (await raced.find((r) => r.status === 200)!.json<{ token: string }>()).token;
    await raced.find((r) => r.status === 404)!.json();
    const participant = await join('Birinci');
    const roomA = code;
    await lobby();
    const wrongManager = await api(`/api/rooms/${roomA}/ws`, undefined, {
      Upgrade: 'websocket',
      cookie,
    });
    expect(wrongManager.status).toBe(403);
    await wrongManager.json();
    for (const credential of [token, participant.token]) {
      const wrongRoom = await api(`/api/rooms/${code}/ws?token=${credential}`, undefined, {
        Upgrade: 'websocket',
      });
      expect(wrongRoom.status).toBe(401);
      await wrongRoom.json();
    }
    code = roomA;
    const display = await connect(token);
    await display.view();
    expect(
      (
        await display.command({
          type: 'select',
          media: { source: 'system', memeId: 'meme', mediaType: 'image' },
        })
      ).reason,
    ).toBe('FORBIDDEN');
    const oldSeq = (await snapshot()).seq;
    expect((await manager.command({ type: 'updateSettings', patch: {} }, 'cross-kind')).ok).toBe(
      true,
    );
    expect((await manager.shell({ kind: 'createDisplayPairCode' }, 'cross-kind')).ok).toBe(true);
    expect((await snapshot()).seq).toBe(oldSeq + 1);
    expect(
      await runInDurableObject(
        stub(),
        async (_i, state) => (await state.storage.get<{ pairCode: unknown }>('room'))!.pairCode,
      ),
    ).toBeNull();
  });
  it.each([false, true])(
    'replays a rematch intent after interruption (new D1 session already inserted: %s)',
    async (alreadyInserted) => {
      const business = await lobby();
      const manager = await connect(undefined, true);
      await manager.view();
      const a = await join('Birinci');
      await join('İkinci');
      const player = await connect(a.token);
      await player.view();
      await manager.command({ type: 'start' });
      await manager.command({ type: 'endGame' });
      const newId = crypto.randomUUID();
      const intent = await runInDurableObject(stub(), async (_i, state) => {
        const saved = (await state.storage.get<{
          session: typeof gameSessions.$inferSelect;
          engine: EngineState;
        }>('room'))!;
        const session = {
          ...saved.session,
          id: newId,
          status: 'lobby' as const,
          createdAt: now,
          expiresAt: now + 86_400_000,
          startedAt: null,
          endedAt: null,
          endReason: null,
          creditConsumed: false,
          creditRefunded: false,
          adminIntervention: false,
        };
        const intent = {
          session,
          engine: createSession(
            { seed: 123, config: saved.engine.config },
            { now, prompts: [], timing: DEFAULT_TIMING },
          ),
          ack: {
            key: 'ack:manager:rematch-crash',
            value: { type: 'ack' as const, clientMsgId: 'rematch-crash', ok: true },
          },
        };
        await state.storage.put('room', { ...saved, rematch: intent });
        return intent;
      });
      if (alreadyInserted)
        await env.DB.prepare(
          "INSERT INTO game_sessions (id,business_id,room_code,status,mode,settings,created_at,expires_at) VALUES (?,?,?,'lobby',?,?,?,?)",
        )
          .bind(
            newId,
            business,
            code,
            intent.session.mode,
            JSON.stringify(intent.session.settings),
            now,
            intent.session.expiresAt,
          )
          .run();
      await evictDurableObject(stub());
      expect((await manager.shell({ kind: 'rematch' }, 'rematch-crash')).ok).toBe(true);
      expect((await snapshot()).engine.status).toBe('lobby');
      expect(
        (await env.DB.prepare('SELECT COUNT(*) n FROM game_sessions WHERE business_id=?')
          .bind(business)
          .first<{ n: number }>())!.n,
      ).toBe(2);
      expect(
        (await env.DB.prepare('SELECT credits FROM businesses WHERE id=?')
          .bind(business)
          .first<{ credits: number }>())!.credits,
      ).toBe(1);
      expect(
        (await player.command({ type: 'join', nickname: 'Birinci', wants: 'player' })).ok,
      ).toBe(true);
      expect((await snapshot()).engine.participants[a.participantId]!.connected).toBe(true);
    },
  );
  it('expires a display code during recovery without repeatedly scheduling a past deadline', async () => {
    await lobby();
    const manager = await connect(undefined, true);
    await manager.view();
    const a = await join('Birinci');
    await join('İkinci');
    const player = await connect(a.token);
    await player.view();
    const pair = await createPairCode(manager);
    await manager.command({ type: 'start' });
    await evictDurableObject(stub(), { webSockets: 'close' });
    now = pair.expiresAt - 1000;
    const reconnected = await connect(a.token);
    await reconnected.view();
    const recovery = await reconnected.wait((m) => m.type === 'recovery');
    if (recovery.type !== 'recovery') throw new Error();
    now = pair.expiresAt;
    await runDurableObjectAlarm(stub());
    const saved = await runInDurableObject(stub(), async (_i, state) => ({
      alarm: await state.storage.getAlarm(),
      pair: (await state.storage.get<{ pairCode: unknown }>('room'))!.pairCode,
    }));
    expect(saved.pair).toBeNull();
    expect(saved.alarm).toBe(recovery.resumesAt);
    expect((await snapshot()).engine.phase.kind).toBe('selection');
  });
});
