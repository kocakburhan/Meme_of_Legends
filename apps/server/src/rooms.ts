import { DEFAULT_CONFIG } from '@mol/engine';
import { joinRequestSchema, roomCodeSchema, sessionConfigSchema } from '@mol/shared';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { z } from 'zod';
import { ApiFailure, authenticate, body, json } from './auth';
import { publicBusiness } from './admin';
import { businesses, gameSessions } from './db/schema';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateRoomCode(): string {
  // 32 symbols divides 256 exactly: no modulo bias.
  return Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (byte) => alphabet[byte % alphabet.length],
  ).join('');
}
export function roomStub(env: Cloudflare.Env, code: string) {
  return env.ROOM.get(env.ROOM.idFromName(code));
}
export async function closeRoom(
  env: Cloudflare.Env,
  code: string,
  sessionId: string,
  reason = 'sessionEnded',
) {
  await roomStub(env, code).fetch(`https://room/close?reason=${reason}&sessionId=${sessionId}`, {
    method: 'POST',
  });
}
export async function expireLobbies(env: Cloudflare.Env) {
  const expired = await drizzle(env.DB)
    .update(gameSessions)
    .set({ status: 'cancelled', endedAt: Date.now(), endReason: 'lobbyExpired' })
    .where(and(eq(gameSessions.status, 'lobby'), sql`${gameSessions.expiresAt} <= ${Date.now()}`))
    .returning();
  for (const session of expired) await closeRoom(env, session.roomCode, session.id, 'roomExpired');
}
export async function businessRoute(
  request: Request,
  env: Cloudflare.Env,
  path: string,
): Promise<Response> {
  const auth = await authenticate(request, env, 'business');
  const db = drizzle(env.DB);
  if (path === '/api/business/me' && request.method === 'GET')
    return json({
      business: publicBusiness(
        (await db.select().from(businesses).where(eq(businesses.id, auth.ownerId)).get())!,
      ),
    });
  if (path === '/api/business/sessions' && request.method === 'POST') {
    const input = await body(
      request,
      z.strictObject({ settings: sessionConfigSchema.partial().optional() }),
    );
    const settings = { ...DEFAULT_CONFIG, ...input.settings };
    await expireLobbies(env);
    const now = Date.now();
    for (let attempt = 0; attempt < 8; attempt++) {
      const id = crypto.randomUUID(),
        code = generateRoomCode();
      try {
        // Single SQLite statement serializes concurrent requests, rechecking credits,
        // current account/session status and the active lobby/game limit at insertion.
        const result = await env.DB.prepare(
          `INSERT INTO game_sessions (id,business_id,room_code,status,mode,settings,created_at,expires_at)
          SELECT ?,id,?,'lobby',?,?,?,? + lobby_lifetime_hours * 3600000 FROM businesses
          WHERE id = ? AND active = 1 AND (credits > 0 OR unlimited_credits = 1)
          AND EXISTS (SELECT 1 FROM auth_sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?)
          AND (SELECT COUNT(*) FROM game_sessions WHERE business_id = businesses.id AND status IN ('lobby','running','paused')) < concurrent_session_limit`,
        )
          .bind(
            id,
            code,
            settings.mode,
            JSON.stringify(settings),
            now,
            now,
            auth.ownerId,
            auth.id,
            now,
          )
          .run();
        if (result.meta.changes) {
          const session = (await db
            .select()
            .from(gameSessions)
            .where(eq(gameSessions.id, id))
            .get())!;
          const initialized = await roomStub(env, code).fetch('https://room/initialize', {
            method: 'POST',
            body: JSON.stringify(session),
          });
          if (!initialized.ok) throw new ApiFailure(503, 'ROOM_INITIALIZATION_FAILED');
          return json({ session }, 201);
        }
        const account = await db
          .select()
          .from(businesses)
          .where(eq(businesses.id, auth.ownerId))
          .get();
        await authenticate(request, env, 'business');
        if (!account!.unlimitedCredits && account!.credits === 0)
          throw new ApiFailure(409, 'INSUFFICIENT_CREDITS');
        throw new ApiFailure(409, 'CONCURRENT_SESSION_LIMIT');
      } catch (error) {
        if (`${error} ${(error as Error).cause}`.includes('game_sessions.room_code')) continue;
        throw error;
      }
    }
    throw new ApiFailure(503, 'ROOM_CODE_UNAVAILABLE');
  }
  const match = /^\/api\/business\/sessions\/([^/]+)\/cancel$/.exec(path);
  if (match && request.method === 'POST') {
    await expireLobbies(env);
    const result = await db
      .update(gameSessions)
      .set({ status: 'cancelled', endedAt: Date.now(), endReason: 'managerCancelled' })
      .where(
        and(
          eq(gameSessions.id, match[1]!),
          eq(gameSessions.businessId, auth.ownerId),
          eq(gameSessions.status, 'lobby'),
        ),
      )
      .returning();
    if (!result.length) throw new ApiFailure(409, 'LOBBY_NOT_CANCELLABLE');
    await closeRoom(env, result[0]!.roomCode, result[0]!.id);
    return json({ ok: true });
  }
  throw new ApiFailure(404, 'NOT_FOUND');
}
export async function roomRoute(
  request: Request,
  env: Cloudflare.Env,
  code: string,
  join: boolean,
): Promise<Response> {
  if (!roomCodeSchema.safeParse(code).success) throw new ApiFailure(404, 'ROOM_NOT_FOUND');
  if (request.method !== (join ? 'POST' : 'GET')) throw new ApiFailure(405, 'METHOD_NOT_ALLOWED');
  await expireLobbies(env);
  const db = drizzle(env.DB);
  const room = await db
    .select({ session: gameSessions, businessName: businesses.name })
    .from(gameSessions)
    .innerJoin(businesses, eq(gameSessions.businessId, businesses.id))
    .where(
      and(
        eq(gameSessions.roomCode, code),
        sql`${gameSessions.status} IN ('lobby','running','paused')`,
      ),
    )
    .get();
  if (!room) throw new ApiFailure(404, 'ROOM_NOT_FOUND');
  if (!join)
    return json({
      code,
      businessName: room.businessName,
      started: room.session.status !== 'lobby',
    });
  const input = await body(request.clone(), joinRequestSchema);
  if (room.session.status !== 'lobby' && input.wants === 'player')
    throw new ApiFailure(409, 'GAME_ALREADY_STARTED');
  if (input.wants === 'voter' && !room.session.settings.acceptVoters)
    throw new ApiFailure(409, 'VOTERS_CLOSED');
  return roomStub(env, code).fetch(request);
}
