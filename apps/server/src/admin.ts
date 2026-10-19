import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as S from '@mol/shared';
import { adminContentRoute } from './admin-content';
import { adminReportsRoute, usage } from './admin-reports';
import { audit, query } from './admin-common';
import { adminActions, authSessions, businesses, gameSessions } from './db/schema';
import { ApiFailure, authenticate, body, json } from './auth';
import { hashPassword, randomSecret } from './security';
export function publicBusiness(account: typeof businesses.$inferSelect) {
  const { passwordHash: _passwordHash, ...value } = account;
  return value;
}
export async function adminRoute(
  request: Request,
  env: Cloudflare.Env,
  path: string,
): Promise<Response> {
  await authenticate(request, env, 'admin');
  const db = drizzle(env.DB);
  const response =
    (await adminContentRoute(request, env, path)) ?? (await adminReportsRoute(request, env, path));
  if (response) return response;
  if (path === '/api/admin/businesses') {
    if (request.method === 'GET') {
      const input = query(request, S.adminBusinessesQuerySchema);
      return json({
        businesses: (
          await db
            .select()
            .from(businesses)
            .where(
              and(
                input.active === 'all' ? undefined : eq(businesses.active, input.active === 'true'),
              ),
            )
            .orderBy(businesses.createdAt, businesses.id)
        )
          .filter(
            (b) =>
              !input.q ||
              S.normalizePromptText(b.name + ' ' + b.username).includes(
                S.normalizePromptText(input.q),
              ),
          )
          .map(publicBusiness),
      });
    }
    if (request.method !== 'POST') throw new ApiFailure(405, 'METHOD_NOT_ALLOWED');
    const input = await body(request, S.adminCreateBusinessSchema);
    const password = input.password ?? randomSecret(18);
    const id = crypto.randomUUID();
    const values = {
      id,
      name: input.name,
      username: input.username,
      credits: input.credits,
      passwordHash: await hashPassword(password),
      createdAt: Date.now(),
    };
    try {
      await db.batch([
        db.insert(businesses).values(values),
        db.insert(adminActions).values(
          audit('businessCreated', id, {
            name: input.name,
            username: input.username,
            credits: input.credits,
          }),
        ),
      ]);
    } catch (error) {
      if (String(error).includes('UNIQUE') || String((error as Error).cause).includes('UNIQUE'))
        throw new ApiFailure(409, 'USERNAME_TAKEN');
      throw error;
    }
    const loginUrl = new URL('/isletme/giris', request.url).href;
    return json(
      {
        business: publicBusiness(
          (await db.select().from(businesses).where(eq(businesses.id, id)).get())!,
        ),
        credentials: {
          loginUrl,
          username: input.username,
          temporaryPassword: password,
          summary: `Giriş adresi: ${loginUrl}\nKullanıcı adı: ${input.username}\nGeçici şifre: ${password}`,
        },
      },
      201,
    );
  }
  const match = /^\/api\/admin\/businesses\/([^/]+)(\/password)?$/.exec(path);
  if (!match) throw new ApiFailure(404, 'NOT_FOUND');
  const id = match[1]!;
  const account = await db.select().from(businesses).where(eq(businesses.id, id)).get();
  if (!account) throw new ApiFailure(404, 'BUSINESS_NOT_FOUND');
  const revoke = db
    .update(authSessions)
    .set({ revokedAt: Date.now() })
    .where(
      and(
        eq(authSessions.role, 'business'),
        eq(authSessions.ownerId, id),
        isNull(authSessions.revokedAt),
      ),
    );
  if (match[2]) {
    if (request.method !== 'POST') throw new ApiFailure(405, 'METHOD_NOT_ALLOWED');
    const input = await body(request, S.adminPasswordSchema);
    const password = input.password ?? randomSecret(18);
    await db.batch([
      db
        .update(businesses)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(businesses.id, id)),
      revoke,
      db.insert(adminActions).values(audit('passwordReset', id, {})),
    ]);
    return json({ temporaryPassword: password });
  }
  if (request.method === 'GET')
    return json({ business: publicBusiness(account), usage: await usage(env, id) });
  if (request.method !== 'PATCH') throw new ApiFailure(405, 'METHOD_NOT_ALLOWED');
  const input = await body(request, S.adminUpdateBusinessSchema);
  const { creditsDelta, ...patch } = input;
  // A constraint violation rolls back the whole batch, including the audit record.
  try {
    await db.batch([
      db
        .update(businesses)
        .set({
          ...patch,
          ...(creditsDelta === undefined
            ? {}
            : { credits: sql`${businesses.credits} + ${creditsDelta}` }),
        })
        .where(eq(businesses.id, id)),
      ...(input.active === false
        ? [
            revoke,
            db
              .update(gameSessions)
              .set({ status: 'cancelled', endedAt: Date.now(), endReason: 'businessInactive' })
              .where(and(eq(gameSessions.businessId, id), eq(gameSessions.status, 'lobby'))),
          ]
        : []),
      db.insert(adminActions).values(audit('businessUpdated', id, input)),
    ]);
  } catch (error) {
    if (`${error} ${(error as Error).cause}`.includes('nonnegative_credits'))
      throw new ApiFailure(409, 'INSUFFICIENT_CREDITS');
    throw error;
  }
  if (input.active === false) {
    const cancelled = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.businessId, id), eq(gameSessions.status, 'cancelled')));
    for (const session of cancelled) {
      await env.ROOM.get(env.ROOM.idFromName(session.roomCode)).fetch(
        `https://room/close?sessionId=${session.id}`,
        { method: 'POST' },
      );
    }
  }
  return json({
    business: publicBusiness(
      (await db.select().from(businesses).where(eq(businesses.id, id)).get())!,
    ),
  });
}
