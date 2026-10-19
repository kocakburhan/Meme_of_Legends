import { env, exports } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { DEFAULT_CONFIG, DEFAULT_TIMING, createSession } from '@mol/engine';
import * as S from '@mol/shared';
import {
  adminActions,
  authSessions,
  businesses,
  errorLog,
  gameSessions,
  memes,
  prompts,
  sessionAudit,
  sessionReports,
} from '../src/db/schema';
import { digest } from '../src/security';
import { MAX_MEDIA_BYTES } from '../src/media';
const db = drizzle(env.DB);
const admin = 'mol_admin_session=admin-test';
async function api(path: string, method = 'GET', data?: unknown, cookie = admin) {
  return exports.default.fetch(`https://example.com/api/admin/${path}`, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function read(response: Response, status = 200) {
  expect(response.status).toBe(status);
  return response.json() as Promise<Record<string, unknown>>;
}
async function failure(response: Response, status: number, code: string) {
  expect(await read(response, status)).toMatchObject({ error: { code } });
}
async function category() {
  return S.adminCategoryResponseSchema.parse(
    await read(await api('categories', 'POST', { name: 'Tepkiler' }), 201),
  ).category;
}
async function session(id: string, consumed = false) {
  const row = {
    id,
    businessId: 'cafe',
    roomCode: id.toUpperCase(),
    status: 'lobby' as const,
    mode: 'league' as const,
    settings: DEFAULT_CONFIG,
    createdAt: 100,
    expiresAt: Date.now() + 100000,
    creditConsumed: consumed,
  };
  await db.insert(gameSessions).values(row);
  const stub = env.ROOM.get(env.ROOM.idFromName(row.roomCode));
  expect(
    (
      await stub.fetch('https://room/initialize', {
        method: 'POST',
        body: JSON.stringify(
          (await db.select().from(gameSessions).where(eq(gameSessions.id, id)).get())!,
        ),
      })
    ).status,
  ).toBe(204);
  return row;
}
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
async function upload(
  meta: unknown = { mediaType: 'image' },
  file: Blob = new Blob([png], { type: 'image/png' }),
  cover?: Blob,
  cookie = admin,
) {
  const form = new FormData();
  form.set('meta', JSON.stringify(meta));
  form.set('file', file, 'test');
  if (cover) form.set('cover', cover, 'cover');
  return exports.default.fetch('https://example.com/api/admin/memes', {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
}
beforeEach(async () => {
  await env.DB.batch(
    [
      'error_log',
      'session_reports',
      'session_audit',
      'custom_uploads',
      'game_sessions',
      'media_jobs',
      'memes',
      'categories',
      'prompts',
      'auth_sessions',
      'admin_actions',
      'businesses',
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await db.insert(businesses).values({
    id: 'cafe',
    name: 'Kafe',
    username: 'cafe',
    passwordHash: 'unused',
    createdAt: 1,
    credits: 2,
  });
  for (const role of ['admin', 'business'] as const)
    await db.insert(authSessions).values({
      id: await digest(`${role}-test`),
      role,
      ownerId: role === 'admin' ? '1' : 'cafe',
      createdAt: 1,
      expiresAt: Date.now() + 1000000,
    });
});
const endpoints: [string, string, unknown?][] = [
  ['businesses', 'GET'],
  ['businesses', 'POST', {}],
  ['businesses/cafe', 'GET'],
  ['businesses/cafe', 'PATCH', {}],
  ['businesses/cafe/password', 'POST', {}],
  ['businesses/cafe/impersonate', 'POST'],
  ['usage', 'GET'],
  ['sessions', 'GET'],
  ['sessions/id', 'GET'],
  ['sessions/id/terminate', 'POST'],
  ['sessions/id/refund', 'POST'],
  ['errors', 'GET'],
  ['actions', 'GET'],
  ['categories', 'GET'],
  ['categories', 'POST', {}],
  ['categories/id', 'PATCH', {}],
  ['prompts', 'GET'],
  ['prompts', 'POST', {}],
  ['prompts/id', 'PATCH', {}],
  ['prompts/health', 'GET'],
  ['business-prompts', 'GET'],
  ['business-prompts/id', 'PATCH', {}],
  ['memes', 'GET'],
  ['memes', 'POST', {}],
  ['memes/check?sourceUrl=https://example.com', 'GET'],
  ['memes/id', 'PATCH', {}],
];
it.each(endpoints)('protects %s %s with admin authentication', async (path, method, data) => {
  for (const auth of ['', 'mol_business_session=business-test'])
    await failure(await api(path, method, data, auth), 401, 'UNAUTHENTICATED');
});
it('filters businesses, provides usage, preserves credential path and validates writes', async () => {
  const created = S.adminBusinessCreatedResponseSchema.parse(
    await read(
      await api('businesses', 'POST', { name: 'Pasif', username: 'pasif', credits: 0 }),
      201,
    ),
  );
  expect(created.credentials.loginUrl).toBe('https://example.com/isletme/giris');
  await read(await api(`businesses/${created.business.id}`, 'PATCH', { active: false }));
  expect(
    S.adminBusinessesResponseSchema
      .parse(await read(await api('businesses?q=KAFE&active=true')))
      .businesses.map((b) => b.id),
  ).toEqual(['cafe']);
  const s = await session('usage', true);
  await db.update(gameSessions).set({ startedAt: 200 }).where(eq(gameSessions.id, s.id));
  const detail = S.adminBusinessResponseSchema.parse(await read(await api('businesses/cafe')));
  expect(detail.usage).toEqual({
    sessionCount: 1,
    activeSessionCount: 1,
    consumedCredits: 1,
    refundedCredits: 0,
    lastGameAt: 200,
  });
  S.adminUsageResponseSchema.parse(await read(await api('usage')));
  await failure(await api('businesses/cafe', 'PATCH', {}), 400, 'INVALID_REQUEST');
  await failure(await api('businesses?active=invalid'), 400, 'INVALID_REQUEST');
});
it('impersonates for fifteen minutes without replacing the admin cookie and records the login', async () => {
  const response = await api('businesses/cafe/impersonate', 'POST');
  const result = S.adminImpersonateResponseSchema.parse(await read(response));
  expect(result.expiresAt - Date.now()).toBeGreaterThan(890000);
  expect(response.headers.get('set-cookie')).toContain('mol_business_session=');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=43200');
  expect(response.headers.get('set-cookie')).not.toContain('mol_admin_session=');
  const responseCookie = response.headers.get('set-cookie')!.split(';')[0]!;
  expect(
    (
      await exports.default.fetch('https://example.com/api/business/me', {
        headers: { cookie: `${admin}; ${responseCookie}` },
      })
    ).status,
  ).toBe(200);
  expect((await api('businesses')).status).toBe(200);
  expect((await db.select().from(adminActions)).at(-1)?.action).toBe('businessImpersonated');
  await db.update(businesses).set({ active: false }).where(eq(businesses.id, 'cafe'));
  await failure(await api('businesses/cafe/impersonate', 'POST'), 409, 'BUSINESS_INACTIVE');
});
it('refunds a consumed credit exactly once even for concurrent requests', async () => {
  await session('refund', true);
  const responses = await Promise.all([
    api('sessions/refund/refund', 'POST'),
    api('sessions/refund/refund', 'POST'),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await db.select().from(businesses).where(eq(businesses.id, 'cafe')).get())!.credits).toBe(
    3,
  );
  expect(
    (await db.select().from(adminActions)).filter((a) => a.action === 'sessionRefunded'),
  ).toHaveLength(1);
  await session('free');
  await failure(await api('sessions/free/refund', 'POST'), 409, 'CREDIT_NOT_CONSUMED');
});
it('terminates through the room, closes it and creates a final report and one audit record', async () => {
  const s = await session('terminate');
  await read(await api(`sessions/${s.id}/terminate`, 'POST'));
  await read(await api(`sessions/${s.id}/terminate`, 'POST'));
  const row = await db.select().from(gameSessions).where(eq(gameSessions.id, s.id)).get();
  expect(row).toMatchObject({
    status: 'terminated',
    endReason: 'adminTerminated',
    adminIntervention: true,
  });
  expect(
    (await db.select().from(adminActions)).filter((a) => a.action === 'sessionTerminated'),
  ).toHaveLength(1);
  const detail = S.adminSessionResponseSchema.parse(await read(await api(`sessions/${s.id}`)));
  expect(detail.report).not.toBeNull();
  expect(detail.audit.length).toBeGreaterThan(0);
  expect((await exports.default.fetch(`https://example.com/api/rooms/${s.roomCode}`)).status).toBe(
    404,
  );
  await db
    .update(gameSessions)
    .set({ status: 'finished', endReason: 'completed' })
    .where(eq(gameSessions.id, s.id));
  await failure(await api(`sessions/${s.id}/terminate`, 'POST'), 409, 'SESSION_NOT_ACTIVE');
});
it('paginates sessions with equal timestamps, date/business/status filters and scoped cursors', async () => {
  await session('pagea');
  await session('pageb');
  await session('pagec');
  const first = S.adminSessionsResponseSchema.parse(
    await read(await api('sessions?businessId=cafe&status=active&from=100&to=100&limit=1')),
  );
  expect(first.sessions).toHaveLength(1);
  const next = String(first.nextCursor);
  const second = S.adminSessionsResponseSchema.parse(
    await read(
      await api(
        `sessions?businessId=cafe&status=active&from=100&to=100&limit=2&cursor=${encodeURIComponent(next)}`,
      ),
    ),
  );
  expect(second.sessions).toHaveLength(2);
  expect(second.sessions[0]).not.toEqual(first.sessions[0]);
  expect(second.nextCursor).toBeNull();
  await failure(
    await api(`sessions?status=past&cursor=${encodeURIComponent(next)}`),
    400,
    'INVALID_REQUEST',
  );
  await failure(await api('sessions?from=200&to=100'), 400, 'INVALID_REQUEST');
  S.adminSessionResponseSchema.parse(await read(await api('sessions/pagea')));
});
it('creates, reorders, renames, archives and restores categories with audited writes', async () => {
  const c = await category();
  await read(
    await api(`categories/${c.id}`, 'PATCH', { name: 'Yeni', sortOrder: -1, archived: true }),
  );
  let list = S.adminCategoriesResponseSchema.parse(await read(await api('categories')));
  expect(list.categories[0]).toMatchObject({ name: 'Yeni', sortOrder: -1, archived: true });
  await read(await api(`categories/${c.id}`, 'PATCH', { archived: false }));
  list = S.adminCategoriesResponseSchema.parse(await read(await api('categories')));
  expect(list.categories[0]!.archived).toBe(false);
  await failure(await api(`categories/${c.id}`, 'PATCH', {}), 400, 'INVALID_REQUEST');
  await failure(await api('categories', 'POST', { name: '' }), 400, 'INVALID_REQUEST');
  expect(await db.select().from(adminActions)).toHaveLength(3);
});
it('normalizes platform prompts, deduplicates archives, paginates and reports low pool count', async () => {
  const p = S.adminPromptResponseSchema.parse(
    await read(await api('prompts', 'POST', { text: 'İŞTE   Bugün' }), 201),
  ).prompt;
  await read(await api(`prompts/${p.id}`, 'PATCH', { status: 'archived' }));
  await failure(await api('prompts', 'POST', { text: 'işte bugün' }), 409, 'PROMPT_DUPLICATE');
  await failure(await api(`prompts/${p.id}`, 'PATCH', { text: '<x>' }), 422, 'PROMPT_INVALID');
  await failure(
    await api('prompts', 'POST', { text: 'https://example.com' }),
    422,
    'PROMPT_INVALID',
  );
  await read(await api(`prompts/${p.id}`, 'PATCH', { text: 'Yeni bir gün', status: 'active' }));
  await read(await api('prompts', 'POST', { text: 'Başka bir gün' }), 201);
  const first = S.adminPromptsResponseSchema.parse(
    await read(await api('prompts?q=gün&status=active&limit=1')),
  );
  expect(first.prompts).toHaveLength(1);
  expect(
    S.adminPromptsResponseSchema.parse(
      await read(
        await api(
          `prompts?q=gün&status=active&limit=1&cursor=${encodeURIComponent(String(first.nextCursor))}`,
        ),
      ),
    ).prompts,
  ).toHaveLength(1);
  expect(S.adminPromptHealthResponseSchema.parse(await read(await api('prompts/health')))).toEqual({
    activeCount: 2,
    lowThreshold: 30,
    low: true,
  });
});
it('filters and blocks business prompts without editing their text or colliding with platform prompts', async () => {
  await db.insert(prompts).values({
    id: 'bp',
    ownerType: 'business',
    businessId: 'cafe',
    text: 'Kafede bugün',
    normalizedText: S.normalizePromptText('Kafede bugün'),
    createdAt: 1,
    updatedAt: 1,
  });
  await read(await api('prompts', 'POST', { text: 'Kafede bugün' }), 201);
  await read(await api('business-prompts/bp', 'PATCH', { adminBlocked: true }));
  expect(
    S.adminPromptsResponseSchema.parse(
      await read(await api('business-prompts?businessId=cafe&q=KAFEDE&blocked=true')),
    ).prompts,
  ).toHaveLength(1);
  await failure(
    await api('business-prompts/bp', 'PATCH', { text: 'Değiştir' }),
    400,
    'INVALID_REQUEST',
  );
  await read(await api('business-prompts/bp', 'PATCH', { adminBlocked: false }));
  expect(
    S.adminPromptsResponseSchema.parse(await read(await api('business-prompts?blocked=true')))
      .prompts,
  ).toHaveLength(0);
});
it('uploads, tags and archives media, checks duplicates including archives, and records each successful write', async () => {
  const c = await category();
  const m = S.adminMemeResponseSchema.parse(
    await read(await upload({ mediaType: 'image', sourceUrl: 'https://example.com/meme' }), 201),
  ).meme;
  expect(m.status).toBe('untagged');
  expect(m.r2Key).toBe(`memes/${m.id}/media.png`);
  expect(await env.MEDIA.head(m.r2Key)).not.toBeNull();
  await failure(
    await api(`memes/${m.id}`, 'PATCH', { status: 'active' }),
    422,
    'MEME_TAGS_REQUIRED',
  );
  await failure(
    await api(`memes/${m.id}`, 'PATCH', { categoryId: 'missing' }),
    422,
    'CATEGORY_NOT_FOUND',
  );
  await read(
    await api(`memes/${m.id}`, 'PATCH', {
      categoryId: c.id,
      description: 'Tepki',
      status: 'active',
    }),
  );
  expect(
    S.adminMemesResponseSchema.parse(
      await read(await api(`memes?status=active&categoryId=${c.id}&q=tepki`)),
    ).memes,
  ).toHaveLength(1);
  await read(await api(`memes/${m.id}`, 'PATCH', { status: 'archived' }));
  await failure(
    await upload({ mediaType: 'image', sourceUrl: 'https://example.com/meme' }),
    409,
    'MEME_DUPLICATE',
  );
  expect(await read(await api('memes/check?sourceUrl=https://example.com/meme'))).toEqual({
    existingId: m.id,
  });
  expect(await read(await api('memes/check?sourceUrl=https://example.com/other'))).toEqual({
    existingId: null,
  });
  const active = S.adminMemeResponseSchema.parse(
    await read(await upload({ mediaType: 'image', categoryId: c.id, description: 'Yeni' }), 201),
  ).meme;
  expect(active.status).toBe('active');
  const untagged = S.adminMemeResponseSchema.parse(await read(await upload(), 201)).meme;
  expect(
    S.adminMemesResponseSchema.parse(
      await read(await api('memes?status=untagged&order=oldest&limit=1')),
    ).memes[0],
  ).toMatchObject({ id: untagged.id });
});
it('validates multipart metadata, MIME, signatures, video duration/codecs, cover type and file size', async () => {
  await failure(await upload({ mediaType: 'gif' }), 422, 'MEDIA_INVALID');
  await failure(
    await upload({ mediaType: 'image' }, new Blob(['fake'], { type: 'image/png' })),
    422,
    'MEDIA_INVALID',
  );
  await failure(
    await upload({ mediaType: 'image' }, new Blob([png], { type: 'image/jpeg' })),
    422,
    'MEDIA_INVALID',
  );
  await failure(await upload({ mediaType: 'video', durationMs: 25001 }), 422, 'MEDIA_INVALID');
  await failure(await upload({ mediaType: 'video' }), 422, 'MEDIA_INVALID');
  await failure(
    await upload({ mediaType: 'image' }, undefined, new Blob([png], { type: 'image/png' })),
    422,
    'MEDIA_INVALID',
  );
  await failure(
    await upload(
      { mediaType: 'image' },
      new Blob([new Uint8Array(MAX_MEDIA_BYTES + 1)], { type: 'image/png' }),
    ),
    422,
    'MEDIA_INVALID',
  );
  await failure(await api('memes', 'POST', {}), 422, 'MEDIA_INVALID');
  expect(await db.select().from(memes)).toHaveLength(0);
});
it('accepts GIF, JPEG, WebP and H.264 MP4 with a cover, but rejects other video codecs', async () => {
  for (const [mediaType, type, bytes] of [
    ['gif', 'image/gif', new TextEncoder().encode('GIF89a123')],
    ['image', 'image/jpeg', new Uint8Array([255, 216, 255, 1])],
    ['image', 'image/webp', new TextEncoder().encode('RIFF1234WEBP1234')],
  ] as const)
    expect((await upload({ mediaType }, new Blob([bytes], { type }))).status).toBe(201);
  const box = (kind: string, data: Uint8Array) => {
    const result = new Uint8Array(data.length + 8);
    new DataView(result.buffer).setUint32(0, result.length);
    result.set(new TextEncoder().encode(kind), 4);
    result.set(data, 8);
    return result;
  };
  const mp4 = (codec: string) => {
    const stsd = new Uint8Array(16);
    new DataView(stsd.buffer).setUint32(4, 1);
    stsd.set(box(codec, new Uint8Array()), 8);
    const ftyp = box('ftyp', new TextEncoder().encode('isom0000'));
    const moov = box('moov', box('trak', box('mdia', box('minf', box('stbl', box('stsd', stsd))))));
    return new Blob([ftyp, moov], { type: 'video/mp4' });
  };
  const cover = new Blob([new Uint8Array([255, 216, 255, 1])], { type: 'image/jpeg' });
  const m = S.adminMemeResponseSchema.parse(
    await read(await upload({ mediaType: 'video', durationMs: 25000 }, mp4('avc1'), cover), 201),
  ).meme;
  expect(m.coverUrl).toBe(`/media/memes/${m.id}/cover.jpg`);
  await failure(
    await upload({ mediaType: 'video', durationMs: 10 }, mp4('hvc1')),
    422,
    'MEDIA_INVALID',
  );
});
it('serves public media with ETags, byte and suffix ranges, HEAD, cache headers and prefix restrictions', async () => {
  const m = S.adminMemeResponseSchema.parse(await read(await upload(), 201)).meme;
  const get = (headers: Record<string, string> = {}, method = 'GET') =>
    exports.default.fetch(`https://example.com${m.mediaUrl}`, { method, headers });
  const full = await get();
  expect(full.status).toBe(200);
  expect(full.headers.get('content-type')).toBe('image/png');
  expect(full.headers.get('cache-control')).toContain('immutable');
  expect(new Uint8Array(await full.arrayBuffer())).toEqual(png);
  const partial = await get({ range: 'bytes=1-3' });
  expect(partial.status).toBe(206);
  expect(partial.headers.get('content-range')).toBe(`bytes 1-3/${png.length}`);
  expect(new Uint8Array(await partial.arrayBuffer())).toEqual(png.slice(1, 4));
  const suffix = await get({ range: 'bytes=-3' });
  expect(suffix.status).toBe(206);
  expect((await suffix.arrayBuffer()).byteLength).toBe(3);
  expect((await get({ range: 'bytes=500-' })).status).toBe(416);
  expect((await get({ 'if-none-match': full.headers.get('etag')! })).status).toBe(304);
  expect((await get({ range: 'bytes=0-1', 'if-range': '"other"' })).status).toBe(200);
  const head = await get({}, 'HEAD');
  expect(head.headers.get('content-length')).toBe(String(png.length));
  expect(await head.text()).toBe('');
  expect((await exports.default.fetch('https://example.com/media/private/secret')).status).toBe(
    404,
  );
  expect(
    (await exports.default.fetch('https://example.com/media/memes/missing/media.png')).status,
  ).toBe(404);
});
it('returns real library media URLs, covers and duration using the shared schema', async () => {
  const c = await category();
  const m = S.adminMemeResponseSchema.parse(
    await read(await upload({ mediaType: 'image', categoryId: c.id, description: 'Görsel' }), 201),
  ).meme;
  const s = await session('ABC234');
  const response = await exports.default.fetch(
    `https://example.com/api/rooms/${s.roomCode}/library`,
  );
  expect(response.status).toBe(200);
  expect(S.libraryResponseSchema.parse(await response.json()).memes[0]).toMatchObject({
    id: m.id,
    mediaUrl: m.mediaUrl,
    durationMs: null,
  });
});
it('lists error and admin logs with pagination and filters, and redacts report private data after seven days', async () => {
  await session('report');
  const engine = createSession(
    { seed: 1, config: DEFAULT_CONFIG },
    { now: 1, prompts: [], timing: DEFAULT_TIMING },
  );
  engine.participants.p = {
    id: 'p',
    nickname: 'Gizli ad',
    role: 'player',
    status: 'active',
    connected: false,
    votingFromRound: 0,
    byeCount: 0,
    joinedAt: 1,
    needsNickname: false,
    eliminated: false,
    withdrawn: false,
  };
  await db
    .update(gameSessions)
    .set({ status: 'finished', endedAt: 1 })
    .where(eq(gameSessions.id, 'report'));
  await db.insert(sessionReports).values({
    id: 'report',
    sessionId: 'report',
    createdAt: 1,
    summary: { participants: engine.participants, rounds: [], result: null },
  });
  await db.insert(sessionAudit).values({
    id: 'audit',
    sessionId: 'report',
    occurredAt: 1,
    type: 'kicked',
    payload: { participantId: 'p', action: 'kick', nickname: 'Gizli ad', videoId: 'private-video' },
  });
  for (const id of ['ea', 'eb'])
    await db.insert(errorLog).values({
      id,
      sessionId: 'report',
      occurredAt: 100,
      source: 'media',
      code: 'LOAD_FAILED',
      details: { url: 'private' },
    });
  const detail = S.adminSessionResponseSchema.parse(await read(await api('sessions/report')));
  expect(detail.audit[0]!.payload).toMatchObject({ participantId: 'p', action: 'kick' });
  expect(JSON.stringify(detail)).not.toContain('Gizli ad');
  expect(JSON.stringify(detail)).not.toContain('private-video');
  expect(JSON.stringify(detail)).toContain('Katılımcı 1');
  const first = S.adminErrorsResponseSchema.parse(
    await read(await api('errors?source=media&code=LOAD_FAILED&sessionId=report&limit=1')),
  );
  expect(first.errors).toHaveLength(1);
  expect(first.nextCursor).not.toBeNull();
  expect(
    S.adminErrorsResponseSchema.parse(
      await read(
        await api(
          `errors?source=media&code=LOAD_FAILED&sessionId=report&limit=1&cursor=${encodeURIComponent(String(first.nextCursor))}`,
        ),
      ),
    ).errors,
  ).toHaveLength(1);
  await category();
  await category();
  const logs = S.adminActionsResponseSchema.parse(
    await read(await api('actions?action=categoryCreated&limit=1')),
  );
  expect(logs.actions).toHaveLength(1);
  expect(logs.nextCursor).not.toBeNull();
  await failure(await api('actions?cursor=broken'), 400, 'INVALID_REQUEST');
});

it('deduplicates simultaneous uploads atomically and removes the losing R2 object', async () => {
  const before = new Set((await env.MEDIA.list({ prefix: 'memes/' })).objects.map((o) => o.key));
  const responses = await Promise.all([
    upload({ mediaType: 'image', sourceUrl: 'https://example.com/race' }),
    upload({ mediaType: 'image', sourceUrl: 'https://example.com/race' }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  const rows = await db.select().from(memes);
  expect(rows).toHaveLength(1);
  const objects = await env.MEDIA.list({ prefix: `memes/` });
  expect(objects.objects.filter((o) => !before.has(o.key)).map((o) => o.key)).toEqual([
    rows[0]!.r2Key,
  ]);
  expect(
    (await db.select().from(adminActions)).filter((a) => a.action === 'memeUploaded'),
  ).toHaveLength(1);
});
it.each([
  ['categories/missing', 'PATCH', { name: 'Yeni' }],
  ['prompts/missing', 'PATCH', { status: 'archived' }],
  ['business-prompts/missing', 'PATCH', { adminBlocked: true }],
  ['memes/missing', 'PATCH', { status: 'archived' }],
  ['sessions/missing', 'GET', undefined],
] as const)('returns 404 for missing records at %s', async (path, method, data) => {
  await failure(await api(path, method, data), 404, 'NOT_FOUND');
});
it.each([
  'memes?status=bad',
  'prompts?status=bad',
  'business-prompts?blocked=bad',
  'errors?limit=0',
  'sessions?limit=101',
])('rejects invalid list query %s', async (path) => {
  await failure(await api(path), 400, 'INVALID_REQUEST');
});
