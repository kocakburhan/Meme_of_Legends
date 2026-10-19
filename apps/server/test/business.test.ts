import { env, exports } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { DEFAULT_CONFIG, DEFAULT_TIMING, createSession, type EngineState } from '@mol/engine';
import {
  businessPromptResponseSchema,
  businessPromptsResponseSchema,
  businessSessionResponseSchema,
  businessSessionsResponseSchema,
} from '@mol/shared';
import { authSessions, businesses, gameSessions, prompts, sessionReports } from '../src/db/schema';
import { digest } from '../src/security';

const db = drizzle(env.DB);
const cookie = 'mol_business_session=business-test';
async function api(path: string, method = 'GET', data?: unknown, auth = cookie) {
  return exports.default.fetch(`https://example.com/api/business/${path}`, {
    method,
    headers: { cookie: auth, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function failure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code } });
}
async function create(text: string) {
  const response = await api('prompts', 'POST', { text });
  expect(response.status).toBe(201);
  return businessPromptResponseSchema.parse(await response.json()).prompt;
}
async function list(path = 'prompts?status=all') {
  const response = await api(path);
  expect(response.status).toBe(200);
  return businessPromptsResponseSchema.parse(await response.json());
}
async function session(
  id: string,
  status: typeof gameSessions.$inferSelect.status,
  businessId = 'own',
  createdAt = 100,
) {
  await db.insert(gameSessions).values({
    id,
    businessId,
    roomCode: id.toUpperCase(),
    status,
    mode: 'league',
    settings: DEFAULT_CONFIG,
    createdAt,
    expiresAt: Date.now() + 1000000,
  });
}
beforeEach(async () => {
  await env.DB.batch(
    [
      'session_reports',
      'session_audit',
      'custom_uploads',
      'game_sessions',
      'prompts',
      'auth_sessions',
      'admin_actions',
      'businesses',
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
  for (const id of ['own', 'other'])
    await db
      .insert(businesses)
      .values({ id, name: id, username: id, passwordHash: 'unused', createdAt: 1 });
  await db.insert(authSessions).values({
    id: await digest('business-test'),
    role: 'business',
    ownerId: 'own',
    createdAt: 1,
    expiresAt: Date.now() + 1000000,
  });
});
it('requires business authentication for every new endpoint', async () => {
  for (const [path, method, data] of [
    ['sessions?status=active', 'GET'],
    ['sessions/x', 'GET'],
    ['prompts', 'GET'],
    ['prompts', 'POST', { text: 'Deneme' }],
    ['prompts/x', 'PATCH', { status: 'archived' }],
  ] as const)
    await failure(await api(path, method, data, ''), 401, 'UNAUTHENTICATED');
});
it('validates prompt writes and keeps admin blocking under edits and reactivation', async () => {
  for (const text of [
    'ab',
    ' '.repeat(4),
    'a'.repeat(161),
    '<b>Metin</b>',
    'https://example.com',
    'www.example.com',
    'örnek.com',
    '例子.中国',
    'ftp://localhost',
  ])
    await failure(await api('prompts', 'POST', { text }), 422, 'PROMPT_INVALID');
  const p = await create('  İŞLER  IŞIKLI  ');
  await db.update(prompts).set({ adminBlocked: true }).where(eq(prompts.id, p.id));
  for (const status of ['archived', 'active']) {
    const response = await api(`prompts/${p.id}`, 'PATCH', { status, text: 'Yeni durum' });
    expect(response.status).toBe(200);
    expect(businessPromptResponseSchema.parse(await response.json()).prompt).toMatchObject({
      status,
      adminBlocked: true,
    });
  }
  for (const data of [{}, { text: 'ab' }, { status: 'blocked' }, { adminBlocked: false }])
    await failure(await api(`prompts/${p.id}`, 'PATCH', data), 422, 'PROMPT_INVALID');
  expect((await list('prompts')).prompts[0]!.adminBlocked).toBe(true);
  await create('😀'.repeat(160));
});
it('enforces Turkish normalized duplicates including archived rows, edits and concurrent creates', async () => {
  const p = await create('İŞLER   IŞIKLI');
  await api(`prompts/${p.id}`, 'PATCH', { status: 'archived' });
  const duplicate = await api('prompts', 'POST', { text: '  işler \t ışıklı ' });
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toEqual({ error: { code: 'PROMPT_DUPLICATE', existingId: p.id } });
  const other = await create('Başka durum');
  const edited = await api(`prompts/${other.id}`, 'PATCH', { text: 'işler ışıklı' });
  expect(edited.status).toBe(409);
  expect(await edited.json()).toEqual({ error: { code: 'PROMPT_DUPLICATE', existingId: p.id } });
  const results = await Promise.all([
    api('prompts', 'POST', { text: 'Aynı anda' }),
    api('prompts', 'POST', { text: 'AYNI ANDA' }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  await db.insert(prompts).values({
    id: 'other',
    businessId: 'other',
    ownerType: 'business',
    text: 'Başka durum',
    normalizedText: 'başka durum',
    createdAt: 1,
    updatedAt: 1,
  });
});
it('searches Turkish text literally, filters, paginates tied timestamps and isolates businesses', async () => {
  for (const [id, text, status, businessId] of [
    ['a', 'İŞLER ışıklı', 'active', 'own'],
    ['b', 'İşler güzel', 'archived', 'own'],
    ['c', 'İşler %_ tamam', 'active', 'own'],
    ['d', 'İŞLER dışarı', 'active', 'other'],
  ] as const)
    await db.insert(prompts).values({
      id,
      text,
      status,
      businessId,
      ownerType: 'business',
      normalizedText: text.toLocaleLowerCase('tr-TR'),
      createdAt: 1,
      updatedAt: 1,
    });
  const first = await list('prompts?status=all&q=İŞLER&limit=2');
  expect(first.prompts.map((p) => p.id)).toEqual(['c', 'b']);
  const second = await list(
    `prompts?status=all&q=İŞLER&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
  );
  expect(second.prompts.map((p) => p.id)).toEqual(['a']);
  expect(second.nextCursor).toBeNull();
  expect((await list('prompts?status=archived')).prompts.map((p) => p.id)).toEqual(['b']);
  expect((await list('prompts?q=%25_')).prompts.map((p) => p.id)).toEqual(['c']);
  for (const data of [{ text: 'Yeni metin' }, { status: 'active' }])
    await failure(await api('prompts/d', 'PATCH', data), 404, 'NOT_FOUND');
  for (const path of [
    'prompts?limit=0',
    'prompts?status=bad',
    'prompts?cursor=bad',
    `prompts?cursor=${encodeURIComponent(first.nextCursor!)}`,
  ])
    await failure(await api(path), 400, 'INVALID_REQUEST');
});
it('lists active and paginated past sessions and protects details and cancellation', async () => {
  for (const [id, status] of [
    ['a', 'lobby'],
    ['b', 'running'],
    ['c', 'paused'],
    ['d', 'finished'],
    ['e', 'cancelled'],
    ['f', 'terminated'],
  ] as const)
    await session(id, status);
  await session('foreign', 'finished', 'other');
  const active = businessSessionsResponseSchema.parse(
    await (await api('sessions?status=active')).json(),
  );
  expect(active.sessions.map((s) => s.id)).toEqual(['c', 'b', 'a']);
  expect(active.sessions.every((s) => s.playerCount === null && s.champion === null)).toBe(true);
  const first = businessSessionsResponseSchema.parse(
    await (await api('sessions?status=past&limit=2')).json(),
  );
  expect(first.sessions.map((s) => s.id)).toEqual(['f', 'e']);
  const second = businessSessionsResponseSchema.parse(
    await (
      await api(`sessions?status=past&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`)
    ).json(),
  );
  expect(second.sessions.map((s) => s.id)).toEqual(['d']);
  expect(second.nextCursor).toBeNull();
  expect(
    businessSessionResponseSchema.parse(await (await api('sessions/a')).json()).report,
  ).toBeNull();
  for (const id of ['foreign', 'missing']) {
    await failure(await api(`sessions/${id}`), 404, 'NOT_FOUND');
    await failure(await api(`sessions/${id}/cancel`, 'POST', {}), 404, 'NOT_FOUND');
  }
  for (const path of [
    'sessions?status=bad',
    'sessions?status=past&limit=101',
    'sessions?status=past&cursor=bad',
  ])
    await failure(await api(path), 400, 'INVALID_REQUEST');
});
it('projects report summaries and anonymous names without leaking stored nicknames', async () => {
  await session('report', 'finished');
  const stored = createSession({ seed: 1 }, { now: 1, prompts: [], timing: DEFAULT_TIMING });
  // Use the actual persisted report shape, including eliminated players and jury ties.
  const participant = {
    status: 'active',
    connected: false,
    votingFromRound: 1,
    byeCount: 0,
    joinedAt: 1,
    needsNickname: false,
    withdrawn: false,
  } as const;
  stored.participants = {
    p: { ...participant, id: 'p', nickname: 'Gizli Şampiyon', role: 'player', eliminated: false },
    q: { ...participant, id: 'q', nickname: 'Gizli Oyuncu', role: 'voter', eliminated: true },
    v: { ...participant, id: 'v', nickname: 'Gizli Jüri', role: 'voter', eliminated: false },
  };
  stored.result = {
    champion: 'p',
    ranking: [
      { participantId: 'p', rank: 1, score: 5 },
      { participantId: 'q', rank: 2, score: 2 },
    ],
    jury: {
      harshest: [{ nickname: 'Gizli Jüri', average: 1 }],
      mostGenerous: [{ nickname: 'Gizli Oyuncu', average: 5 }],
    },
    reason: 'completed',
  };
  stored.rounds = [
    { players: ['p', 'q'], byes: [], submissions: { s: { hidden: true } } },
  ] as unknown as EngineState['rounds'];
  await db.insert(sessionReports).values({
    id: 'report',
    sessionId: 'report',
    summary: { participants: stored.participants, rounds: stored.rounds, result: stored.result },
    createdAt: 1,
  });
  const normal = businessSessionResponseSchema.parse(await (await api('sessions/report')).json());
  expect(normal.session).toMatchObject({
    playerCount: 2,
    spectatorCount: 1,
    champion: 'Gizli Şampiyon',
  });
  expect(normal.report).toMatchObject({
    rounds: 1,
    hiddenContentCount: 1,
    standings: [
      { rank: 1, nickname: 'Gizli Şampiyon', score: 5 },
      { rank: 2, nickname: 'Gizli Oyuncu', score: 2 },
    ],
  });
  await db
    .update(sessionReports)
    .set({ anonymizedAt: Date.now() })
    .where(eq(sessionReports.id, 'report'));
  const anonymous = businessSessionResponseSchema.parse(
    await (await api('sessions/report')).json(),
  );
  expect(anonymous.session.champion).toBe('Katılımcı 1');
  expect(anonymous.report!.juryAwards).toEqual([
    { title: 'En sert jüri', nickname: 'Katılımcı 3' },
    { title: 'En cömert jüri', nickname: 'Katılımcı 2' },
  ]);
  expect(JSON.stringify(anonymous)).not.toContain('Gizli');
  expect(await (await api('sessions?status=past')).text()).not.toContain('Gizli');
});
