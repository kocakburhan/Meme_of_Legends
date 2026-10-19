import { and, eq, gt, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { z } from 'zod';
import { adminAccount, authSessions, businesses } from './db/schema';
import { digest, hashPassword, randomSecret, verifyPassword } from './security';
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export type Role = 'admin' | 'business';
export const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .transform((v) => v.normalize('NFC').toLocaleLowerCase('tr-TR'));
export const passwordSchema = z.string().min(12).max(128);
export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: { existingId: string },
  ) {
    super(code);
  }
}
export function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(value), { status, headers: h });
}
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase().endsWith('/json'))
    throw new ApiFailure(415, 'JSON_REQUIRED');
  try {
    return schema.parse(await request.json());
  } catch {
    throw new ApiFailure(400, 'INVALID_REQUEST');
  }
}
function cookieName(role: Role) {
  return `mol_${role}_session`;
}
function cookie(request: Request, role: Role, token: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(role)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
function readCookie(request: Request, role: Role): string | null {
  const prefix = `${cookieName(role)}=`;
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}
export async function authenticate(request: Request, env: Cloudflare.Env, role: Role) {
  const token = readCookie(request, role);
  if (!token) throw new ApiFailure(401, 'UNAUTHENTICATED');
  const db = drizzle(env.DB);
  const session = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.id, await digest(token)),
        eq(authSessions.role, role),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, Date.now()),
      ),
    )
    .get();
  if (!session) throw new ApiFailure(401, 'UNAUTHENTICATED');
  if (role === 'business') {
    const business = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, session.ownerId))
      .get();
    if (!business?.active) throw new ApiFailure(401, 'UNAUTHENTICATED');
  }
  return session;
}
export async function authRoute(
  request: Request,
  env: Cloudflare.Env,
  role: Role,
  action: string,
): Promise<Response> {
  const db = drizzle(env.DB);
  if (action === 'login') {
    const input = await body(
      request,
      z.strictObject({ username: usernameSchema, password: z.string().min(1).max(128) }),
    );
    const account =
      role === 'admin'
        ? await db
            .select()
            .from(adminAccount)
            .where(eq(adminAccount.username, input.username))
            .get()
        : await db.select().from(businesses).where(eq(businesses.username, input.username)).get();
    if (
      !account ||
      !(await verifyPassword(input.password, account.passwordHash)) ||
      ('active' in account && !account.active)
    )
      throw new ApiFailure(401, 'INVALID_CREDENTIALS');
    const token = randomSecret();
    const now = Date.now();
    const sessionId = await digest(token);
    // INSERT ... SELECT rechecks password/status after PBKDF2, preventing a concurrent
    // reset/deactivation from creating an authenticated session with old credentials.
    const table = role === 'admin' ? 'admin_account' : 'businesses';
    const result = await env.DB.prepare(
      `INSERT INTO auth_sessions (id,role,owner_id,created_at,expires_at)
      SELECT ?,?,?,?,? FROM ${table} WHERE id = ? AND password_hash = ? ${role === 'business' ? 'AND active = 1' : ''}`,
    )
      .bind(
        sessionId,
        role,
        String(account.id),
        now,
        now + SESSION_LIFETIME_MS,
        account.id,
        account.passwordHash,
      )
      .run();
    if (!result.meta.changes) throw new ApiFailure(401, 'INVALID_CREDENTIALS');
    return json({ ok: true }, 200, {
      'Set-Cookie': cookie(request, role, token, SESSION_LIFETIME_MS / 1000),
    });
  }
  if (action === 'logout') {
    const token = readCookie(request, role);
    if (token)
      await db
        .update(authSessions)
        .set({ revokedAt: Date.now() })
        .where(and(eq(authSessions.id, await digest(token)), eq(authSessions.role, role)));
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, role, '', 0) });
  }
  if (role === 'business' && action === 'password') {
    const session = await authenticate(request, env, role);
    const input = await body(
      request,
      z.strictObject({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }),
    );
    const account = (await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, session.ownerId))
      .get())!;
    if (!(await verifyPassword(input.currentPassword, account.passwordHash)))
      throw new ApiFailure(401, 'INVALID_CREDENTIALS');
    const nextHash = await hashPassword(input.newPassword);
    // Use an atomic batch and guard both statements with the authenticated session.
    // Revocation precedes the compare-and-swap while the old hash is still current.
    const results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE auth_sessions SET revoked_at = ? WHERE role = 'business' AND owner_id = ? AND id != ? AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM businesses WHERE id = ? AND active = 1 AND password_hash = ?)
        AND EXISTS (SELECT 1 FROM auth_sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?)`,
      ).bind(
        Date.now(),
        account.id,
        session.id,
        account.id,
        account.passwordHash,
        session.id,
        Date.now(),
      ),
      env.DB.prepare(
        `UPDATE businesses SET password_hash = ? WHERE id = ? AND active = 1 AND password_hash = ?
        AND EXISTS (SELECT 1 FROM auth_sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?)`,
      ).bind(nextHash, account.id, account.passwordHash, session.id, Date.now()),
    ]);
    if (!results[1]!.meta.changes) throw new ApiFailure(401, 'UNAUTHENTICATED');
    return json({ ok: true });
  }
  throw new ApiFailure(404, 'NOT_FOUND');
}
