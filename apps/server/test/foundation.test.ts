import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import {
  adminAccount,
  authSessions,
  businesses,
  gameSessions,
  adminActions,
} from '../src/db/schema';
import {
  hashPassword,
  verifyPassword,
  verifyParticipantToken,
  signParticipantToken,
} from '../src/security';
import worker from '../src/index';

const db = drizzle(env.DB);
const password = 'Test-password-123!';
const passwordHash = await hashPassword(password);
async function api(
  path: string,
  method = 'GET',
  data?: unknown,
  cookie?: string,
  headers?: Record<string, string>,
) {
  return exports.default.fetch(`https://example.com${path}`, {
    method,
    headers: {
      ...(data === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function content<T = Record<string, unknown>>(r: Response): Promise<T> {
  return r.json() as Promise<T>;
}
async function error(r: Response, status: number, code: string) {
  expect(r.status).toBe(status);
  expect(await r.json()).toEqual({ error: { code } });
}
async function login(role: 'admin' | 'business' = 'admin', username = 'admin', pass = password) {
  const r = await api(`/api/auth/${role}/login`, 'POST', { username, password: pass });
  expect(r.status).toBe(200);
  expect(r.headers.get('set-cookie')).toContain('HttpOnly');
  expect(r.headers.get('set-cookie')).toContain('Secure');
  expect(r.headers.get('set-cookie')).toContain('SameSite=Strict');
  return r.headers.get('set-cookie')!.split(';')[0]!;
}
interface Created {
  business: { id: string; credits: number; unlimitedCredits: boolean };
  credentials: { temporaryPassword: string; summary: string };
}
async function create(cookie: string, username = 'cafe', credits = 2) {
  const r = await api(
    '/api/admin/businesses',
    'POST',
    { name: 'Kafe', username, credits, password },
    cookie,
  );
  expect(r.status).toBe(201);
  return content<Created>(r);
}
async function lobby(cookie: string, settings?: Record<string, unknown>) {
  const r = await api('/api/business/sessions', 'POST', settings ? { settings } : {}, cookie);
  expect(r.status).toBe(201);
  return (await content<{ session: typeof gameSessions.$inferSelect }>(r)).session;
}
beforeEach(async () => {
  await env.DB.batch(
    [
      'DELETE FROM admin_actions',
      'DELETE FROM auth_sessions',
      'DELETE FROM game_sessions',
      'DELETE FROM businesses',
      'DELETE FROM admin_account',
    ].map((q) => env.DB.prepare(q)),
  );
  await db
    .insert(adminAccount)
    .values({ id: 1, username: 'admin', passwordHash, createdAt: Date.now() });
});
describe('passwords and authentication', () => {
  it('salts hashes, verifies correct passwords and rejects malformed hashes', async () => {
    const other = await hashPassword(password);
    expect(other).not.toBe(passwordHash);
    expect(await verifyPassword(password, other)).toBe(true);
    expect(await verifyPassword('wrong', other)).toBe(false);
    expect(await verifyPassword(password, 'invalid')).toBe(false);
    await expect(
      db.insert(adminAccount).values({ id: 2, username: 'other', passwordHash, createdAt: 1 }),
    ).rejects.toThrow();
  });
  it('rejects unauthenticated, wrong-role and expired access; logs out', async () => {
    await error(await api('/api/admin/businesses'), 401, 'UNAUTHENTICATED');
    await error(
      await api('/api/auth/admin/login', 'POST', { username: 'admin', password: 'wrong' }),
      401,
      'INVALID_CREDENTIALS',
    );
    const admin = await login();
    await create(admin);
    const business = await login('business', 'cafe');
    await error(
      await api('/api/admin/businesses', 'GET', undefined, business),
      401,
      'UNAUTHENTICATED',
    );
    await error(await api('/api/business/me', 'GET', undefined, admin), 401, 'UNAUTHENTICATED');
    await api('/api/auth/admin/logout', 'POST', {}, admin);
    await error(
      await api('/api/admin/businesses', 'GET', undefined, admin),
      401,
      'UNAUTHENTICATED',
    );
    await db.update(authSessions).set({ expiresAt: 1 });
    await error(await api('/api/business/me', 'GET', undefined, business), 401, 'UNAUTHENTICATED');
  });
  it('keeps the password-changing device and revokes all others', async () => {
    const admin = await login();
    await create(admin);
    const a = await login('business', 'cafe'),
      b = await login('business', 'cafe');
    await error(
      await api(
        '/api/auth/business/password',
        'POST',
        { currentPassword: 'wrong', newPassword: 'New-password-123!' },
        a,
      ),
      401,
      'INVALID_CREDENTIALS',
    );
    expect(
      (
        await api(
          '/api/auth/business/password',
          'POST',
          { currentPassword: password, newPassword: 'New-password-123!' },
          a,
        )
      ).status,
    ).toBe(200);
    expect((await api('/api/business/me', 'GET', undefined, a)).status).toBe(200);
    await error(await api('/api/business/me', 'GET', undefined, b), 401, 'UNAUTHENTICATED');
    await error(
      await api('/api/auth/business/login', 'POST', { username: 'cafe', password }),
      401,
      'INVALID_CREDENTIALS',
    );
    await login('business', 'cafe', 'New-password-123!');
    await api('/api/auth/business/logout', 'POST', {}, a);
    await error(await api('/api/business/me', 'GET', undefined, a), 401, 'UNAUTHENTICATED');
  });
  it('rejects cross-origin writes and invalid JSON', async () => {
    await error(
      await api('/api/auth/admin/login', 'POST', { username: 'admin', password }, undefined, {
        origin: 'https://evil.example',
      }),
      403,
      'INVALID_ORIGIN',
    );
    await error(await api('/api/auth/admin/login', 'POST'), 415, 'JSON_REQUIRED');
    const r = await exports.default.fetch('https://example.com/api/auth/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    await error(r, 400, 'INVALID_REQUEST');
  });
});
describe('admin and credits', () => {
  it('creates credentials, lists safe accounts, rejects duplicate usernames and audits changes', async () => {
    const admin = await login();
    const r = await api(
      '/api/admin/businesses',
      'POST',
      { name: 'Kafe', username: ' KAFE ', credits: 3 },
      admin,
    );
    expect(r.status).toBe(201);
    const created = await content<Created>(r);
    expect(created.credentials.summary).toContain(created.credentials.temporaryPassword);
    await login('business', 'kafe', created.credentials.temporaryPassword);
    const list = await api('/api/admin/businesses', 'GET', undefined, admin);
    expect(JSON.stringify(await list.json())).not.toContain('passwordHash');
    await error(
      await api(
        '/api/admin/businesses',
        'POST',
        { name: 'Other', username: 'kafe', credits: 0 },
        admin,
      ),
      409,
      'USERNAME_TAKEN',
    );
    const path = `/api/admin/businesses/${created.business.id}`;
    expect(
      (
        await api(
          path,
          'PATCH',
          { creditsDelta: 4, concurrentSessionLimit: 2, lobbyLifetimeHours: 1 },
          admin,
        )
      ).status,
    ).toBe(200);
    await error(await api(path, 'PATCH', { creditsDelta: -8 }, admin), 409, 'INSUFFICIENT_CREDITS');
    expect((await db.select().from(businesses).get())!.credits).toBe(7);
    expect((await db.select().from(adminActions)).length).toBe(2);
    expect(JSON.stringify(await db.select().from(adminActions))).not.toContain(
      created.credentials.temporaryPassword,
    );
  });
  it('reset revokes every device without ending games; deactivation cancels only lobbies', async () => {
    const admin = await login(),
      created = await create(admin);
    const a = await login('business', 'cafe'),
      b = await login('business', 'cafe');
    const session = await lobby(a);
    const path = `/api/admin/businesses/${created.business.id}`;
    expect(
      (await api(`${path}/password`, 'POST', { password: 'Reset-password-123!' }, admin)).status,
    ).toBe(200);
    for (const cookie of [a, b])
      await error(await api('/api/business/me', 'GET', undefined, cookie), 401, 'UNAUTHENTICATED');
    expect((await db.select().from(gameSessions).get())!.status).toBe('lobby');
    const c = await login('business', 'cafe', 'Reset-password-123!');
    await db.update(gameSessions).set({ status: 'running' }).where(eq(gameSessions.id, session.id));
    await api(path, 'PATCH', { concurrentSessionLimit: 2 }, admin);
    const other = await lobby(c);
    await api(path, 'PATCH', { active: false }, admin);
    await error(await api('/api/business/me', 'GET', undefined, c), 401, 'UNAUTHENTICATED');
    await error(
      await api('/api/auth/business/login', 'POST', {
        username: 'cafe',
        password: 'Reset-password-123!',
      }),
      401,
      'INVALID_CREDENTIALS',
    );
    const rows = await db.select().from(gameSessions);
    expect(rows.find((s) => s.id === other.id)!.status).toBe('cancelled');
    expect(rows.find((s) => s.id === session.id)!.status).toBe('running');
    await api(path, 'PATCH', { active: true }, admin);
    await login('business', 'cafe', 'Reset-password-123!');
  });
});
describe('lobbies and participant tokens', () => {
  it('enforces zero credits, unlimited credits, simultaneous limits and ownership without consuming a credit', async () => {
    const admin = await login(),
      created = await create(admin, 'cafe', 0);
    const business = await login('business', 'cafe');
    await error(
      await api('/api/business/sessions', 'POST', {}, business),
      409,
      'INSUFFICIENT_CREDITS',
    );
    await api(
      `/api/admin/businesses/${created.business.id}`,
      'PATCH',
      { unlimitedCredits: true },
      admin,
    );
    const results = await Promise.all([
      api('/api/business/sessions', 'POST', {}, business),
      api('/api/business/sessions', 'POST', {}, business),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const session = (await db.select().from(gameSessions).get())!;
    expect(session.roomCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(session.settings.mode).toBe('hybrid');
    expect((await db.select().from(businesses).get())!.credits).toBe(0);
    await create(admin, 'other');
    const other = await login('business', 'other');
    await error(
      await api(`/api/business/sessions/${session.id}/cancel`, 'POST', {}, other),
      404,
      'NOT_FOUND',
    );
    expect(
      (await api(`/api/business/sessions/${session.id}/cancel`, 'POST', {}, business)).status,
    ).toBe(200);
    await error(await api(`/api/rooms/${session.roomCode}`), 404, 'ROOM_NOT_FOUND');
    await lobby(business);
  });
  it('allows configured concurrency and expires lobbies both on access and scheduled invocation', async () => {
    const admin = await login(),
      created = await create(admin);
    const business = await login('business', 'cafe');
    await api(
      `/api/admin/businesses/${created.business.id}`,
      'PATCH',
      { concurrentSessionLimit: 2 },
      admin,
    );
    const a = await lobby(business),
      b = await lobby(business);
    await error(
      await api('/api/business/sessions', 'POST', {}, business),
      409,
      'CONCURRENT_SESSION_LIMIT',
    );
    await db
      .update(gameSessions)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(gameSessions.id, a.id));
    await error(await api(`/api/rooms/${a.roomCode}`), 404, 'ROOM_NOT_FOUND');
    await db
      .update(gameSessions)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(gameSessions.id, b.id));
    await worker.scheduled({} as ScheduledController, env);
    expect((await db.select().from(gameSessions)).every((s) => s.status === 'cancelled')).toBe(
      true,
    );
    await lobby(business);
  });
  it('joins with signed scoped tokens, rejects tampering, expiry and invalid nicknames', async () => {
    const admin = await login();
    await create(admin);
    const business = await login('business', 'cafe'),
      session = await lobby(business);
    const room = await api(`/api/rooms/${session.roomCode}`);
    expect(await room.json()).toEqual({
      code: session.roomCode,
      businessName: 'Kafe',
      started: false,
    });
    const r = await api(`/api/rooms/${session.roomCode}/join`, 'POST', {
      nickname: 'Şakacı 😂',
      wants: 'player',
    });
    expect(r.status).toBe(201);
    const joined = await content<{ token: string; participantId: string }>(r);
    const claims = (await verifyParticipantToken(joined.token, env.TOKEN_SECRET))!;
    expect(claims.participantId).toBe(joined.participantId);
    expect(claims.sessionId).toBe(session.id);
    expect(claims.roomCode).toBe(session.roomCode);
    expect(await verifyParticipantToken(joined.token + 'x', env.TOKEN_SECRET)).toBeNull();
    expect(
      await verifyParticipantToken(joined.token, 'another-secret-at-least-32-characters'),
    ).toBeNull();
    expect(
      await verifyParticipantToken(joined.token, env.TOKEN_SECRET, claims.expiresAt),
    ).toBeNull();
    const future = await signParticipantToken(
      { ...claims, issuedAt: claims.issuedAt + 100000 },
      env.TOKEN_SECRET,
    );
    expect(await verifyParticipantToken(future, env.TOKEN_SECRET)).toBeNull();
    for (const nickname of ['x', 'x'.repeat(21), 'https://site.com', '<script>', 'a\nb'])
      await error(
        await api(`/api/rooms/${session.roomCode}/join`, 'POST', { nickname, wants: 'player' }),
        400,
        'INVALID_REQUEST',
      );
    await db.update(gameSessions).set({ status: 'running' }).where(eq(gameSessions.id, session.id));
    await error(
      await api(`/api/rooms/${session.roomCode}/join`, 'POST', {
        nickname: 'Ali',
        wants: 'player',
      }),
      409,
      'GAME_ALREADY_STARTED',
    );
    expect(
      (
        await api(`/api/rooms/${session.roomCode}/join`, 'POST', {
          nickname: 'Ali',
          wants: 'voter',
        })
      ).status,
    ).toBe(201);
    await db
      .update(gameSessions)
      .set({ settings: { ...session.settings, acceptVoters: false } })
      .where(eq(gameSessions.id, session.id));
    await error(
      await api(`/api/rooms/${session.roomCode}/join`, 'POST', { nickname: 'Ali', wants: 'voter' }),
      409,
      'VOTERS_CLOSED',
    );
    await db
      .update(gameSessions)
      .set({ status: 'finished' })
      .where(eq(gameSessions.id, session.id));
    await error(
      await api(`/api/rooms/${session.roomCode}/join`, 'POST', { nickname: 'Ali', wants: 'voter' }),
      404,
      'ROOM_NOT_FOUND',
    );
  });
});
