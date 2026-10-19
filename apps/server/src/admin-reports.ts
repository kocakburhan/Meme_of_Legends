import * as S from '@mol/shared';
import type { EngineState } from '@mol/engine';
import { and, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ApiFailure, cookie, json } from './auth';
import {
  adminActions,
  authSessions,
  businesses,
  errorLog,
  gameSessions,
  sessionAudit,
  sessionReports,
} from './db/schema';
import { audit, cursorPage, query } from './admin-common';
import { publicBusiness } from './admin';
import { digest, randomSecret } from './security';
export const IMPERSONATION_LIFETIME_MS = 12 * 60 * 60 * 1000;
export async function usage(env: Cloudflare.Env, businessId: string) {
  const result = await env.DB.prepare(
    `SELECT count(*) AS sessionCount,
    coalesce(sum(status IN ('lobby','running','paused')),0) AS activeSessionCount,
    coalesce(sum(coalesce(credit_charged,credit_consumed)),0) AS consumedCredits, coalesce(sum(credit_refunded),0) AS refundedCredits,
    max(started_at) AS lastGameAt FROM game_sessions WHERE business_id=?`,
  )
    .bind(businessId)
    .first<S.AdminUsage>();
  return result!;
}
type StoredReport = Pick<EngineState, 'participants' | 'rounds' | 'result'>;
/** Only system media IDs and custom media types leave the report boundary. */
export function publicReport(summary: unknown, anonymize: boolean): S.AdminReport | null {
  if (!summary) return null;
  const stored = summary as StoredReport;
  const participants = Object.values(stored.participants);
  const name = (id: string) =>
    anonymize
      ? `Katılımcı ${participants.findIndex((p) => p.id === id) + 1}`
      : (stored.participants[id]?.nickname ?? 'Katılımcı');
  return {
    participants: participants.map((p) => ({
      id: p.id,
      nickname: name(p.id),
      role: p.role,
      status: p.status,
      eliminated: p.eliminated,
      withdrawn: p.withdrawn,
    })),
    playerCount: participants.filter((p) => p.role === 'player' || p.eliminated || p.withdrawn)
      .length,
    spectatorCount: participants.filter((p) => p.role === 'voter' && !p.eliminated && !p.withdrawn)
      .length,
    rounds: stored.rounds.map((r) => ({
      no: r.no,
      kind: r.kind,
      context: r.context,
      prompt: r.prompt,
      players: r.players,
      matches: r.matches,
      byes: r.byes,
      locked: r.locked,
      scores: r.scores,
      resolution: r.resolution,
      submissions: Object.values(r.submissions).map((s) => ({
        id: s.id,
        playerId: s.playerId,
        memeId: s.media?.source === 'system' ? s.media.memeId : null,
        customType: s.customType,
        hidden: s.hidden,
        invalid: s.invalid,
      })),
    })),
    result: stored.result
      ? {
          ...stored.result,
          jury: stored.result.jury
            ? {
                harshest: stored.result.jury.harshest.map((j) => ({
                  ...j,
                  nickname: anonymize
                    ? name(participants.find((p) => p.nickname === j.nickname)?.id ?? '')
                    : j.nickname,
                })),
                mostGenerous: stored.result.jury.mostGenerous.map((j) => ({
                  ...j,
                  nickname: anonymize
                    ? name(participants.find((p) => p.nickname === j.nickname)?.id ?? '')
                    : j.nickname,
                })),
              }
            : null,
        }
      : null,
  };
}
export async function adminReportsRoute(
  request: Request,
  env: Cloudflare.Env,
  path: string,
): Promise<Response | null> {
  const db = drizzle(env.DB);
  if (path === '/api/admin/usage' && request.method === 'GET') {
    const accounts = await db.select().from(businesses).orderBy(businesses.id);
    return json({
      businesses: await Promise.all(
        accounts.map(async (account) => ({
          business: publicBusiness(account),
          usage: await usage(env, account.id),
        })),
      ),
    });
  }
  if (path === '/api/admin/sessions' && request.method === 'GET') {
    const input = query(request, S.adminSessionsQuerySchema);
    const { after, next } = cursorPage(request, input.cursor);
    const rows = await db
      .select()
      .from(gameSessions)
      .where(
        and(
          input.businessId ? eq(gameSessions.businessId, input.businessId) : undefined,
          input.status === 'all'
            ? undefined
            : input.status === 'active'
              ? sql`${gameSessions.status} IN ('lobby','running','paused')`
              : input.status === 'past'
                ? sql`${gameSessions.status} IN ('finished','cancelled','terminated')`
                : eq(gameSessions.status, input.status),
          input.from === undefined ? undefined : sql`${gameSessions.createdAt} >= ${input.from}`,
          input.to === undefined ? undefined : sql`${gameSessions.createdAt} <= ${input.to}`,
          after
            ? sql`(${gameSessions.createdAt},${gameSessions.id}) < (${after.time},${after.id})`
            : undefined,
        ),
      )
      .orderBy(desc(gameSessions.createdAt), desc(gameSessions.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    return json({
      sessions: page,
      nextCursor: rows.length > input.limit ? next(page.at(-1)!, page.at(-1)!.createdAt) : null,
    });
  }
  const sessionMatch = /^\/api\/admin\/sessions\/([^/]+)(?:\/(terminate|refund))?$/.exec(path);
  if (sessionMatch) {
    const id = sessionMatch[1]!;
    const session = await db.select().from(gameSessions).where(eq(gameSessions.id, id)).get();
    if (!session) throw new ApiFailure(404, 'NOT_FOUND');
    const action = sessionMatch[2];
    if (!action && request.method === 'GET') {
      const business = (await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, session.businessId))
        .get())!;
      const report = await db
        .select()
        .from(sessionReports)
        .where(eq(sessionReports.sessionId, id))
        .get();
      let summary = report?.summary;
      if (!summary && ['lobby', 'running', 'paused'].includes(session.status)) {
        const response = await env.ROOM.get(env.ROOM.idFromName(session.roomCode)).fetch(
          `https://room/admin-report?sessionId=${encodeURIComponent(id)}`,
        );
        if (response.ok) summary = await response.json();
      }
      const anonymize =
        !!report?.anonymizedAt ||
        (session.endedAt !== null && session.endedAt <= Date.now() - 7 * 24 * 60 * 60 * 1000);
      // Audit payloads may contain private media, nicknames or arbitrary client details.
      // Expose event type/time and safe identifiers only, with no URLs or free text.
      const rawAudit = await db
        .select()
        .from(sessionAudit)
        .where(eq(sessionAudit.sessionId, id))
        .orderBy(sessionAudit.occurredAt, sessionAudit.id);
      const safeKeys = new Set([
        'type',
        'participantId',
        'submissionId',
        'roundNo',
        'reason',
        'mediaType',
        'action',
        'compensation',
        'count',
        'phase',
      ]);
      const safePayload = (value: unknown) =>
        value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).filter(([key]) => safeKeys.has(key)))
          : {};
      return json({
        session,
        business: publicBusiness(business),
        report: publicReport(summary, anonymize),
        audit: rawAudit.map((row) => ({ ...row, payload: safePayload(row.payload) })),
        adminActions: await db
          .select()
          .from(adminActions)
          .where(eq(adminActions.targetId, id))
          .orderBy(adminActions.occurredAt, adminActions.id),
        errors: (
          await db
            .select()
            .from(errorLog)
            .where(eq(errorLog.sessionId, id))
            .orderBy(errorLog.occurredAt, errorLog.id)
        ).map((row) => ({ ...row, details: safePayload(row.details) })),
      });
    }
    if (action === 'refund' && request.method === 'POST') {
      // All statements are serialized in one D1 transaction; changes() gates the
      // credit increment and log on the compare-and-swap of the refund flag.
      const now = Date.now(),
        logId = crypto.randomUUID();
      const result = await env.DB.batch([
        env.DB.prepare(
          `UPDATE game_sessions SET credit_refunded=1,admin_intervention=1 WHERE id=? AND coalesce(credit_charged,credit_consumed)=1 AND credit_refunded=0`,
        ).bind(id),
        env.DB.prepare(
          `INSERT INTO admin_actions (id,occurred_at,action,target_id,details) SELECT ?,?,'sessionRefunded',?,'{}' WHERE changes()=1`,
        ).bind(logId, now, id),
        env.DB.prepare(
          `UPDATE businesses SET credits=credits+1 WHERE id=? AND EXISTS (SELECT 1 FROM admin_actions WHERE id=?)`,
        ).bind(session.businessId, logId),
      ]);
      if (!result[0]!.meta.changes) {
        const current = await db.select().from(gameSessions).where(eq(gameSessions.id, id)).get();
        throw new ApiFailure(
          409,
          current?.creditRefunded ? 'CREDIT_ALREADY_REFUNDED' : 'CREDIT_NOT_CONSUMED',
        );
      }
      return json({ ok: true });
    }
    if (action === 'terminate' && request.method === 'POST') {
      if (
        !['lobby', 'running', 'paused'].includes(session.status) &&
        session.endReason !== 'adminTerminated'
      )
        throw new ApiFailure(409, 'SESSION_NOT_ACTIVE');
      const response = await env.ROOM.get(env.ROOM.idFromName(session.roomCode)).fetch(
        `https://room/close?reason=adminTerminated&sessionId=${encodeURIComponent(id)}`,
        { method: 'POST' },
      );
      if (!response.ok) throw new ApiFailure(409, 'ROOM_UNAVAILABLE');
      return json({ ok: true });
    }
    throw new ApiFailure(405, 'METHOD_NOT_ALLOWED');
  }
  const impersonate = /^\/api\/admin\/businesses\/([^/]+)\/impersonate$/.exec(path);
  if (impersonate && request.method === 'POST') {
    const id = impersonate[1]!;
    const account = await db.select().from(businesses).where(eq(businesses.id, id)).get();
    if (!account) throw new ApiFailure(404, 'BUSINESS_NOT_FOUND');
    if (!account.active) throw new ApiFailure(409, 'BUSINESS_INACTIVE');
    const token = randomSecret(),
      now = Date.now(),
      expiresAt = now + IMPERSONATION_LIFETIME_MS;
    await db.batch([
      db.insert(authSessions).values({
        id: await digest(token),
        role: 'business',
        ownerId: id,
        createdAt: now,
        expiresAt,
      }),
      db.insert(adminActions).values(audit('businessImpersonated', id, { expiresAt })),
    ]);
    return json({ loginUrl: new URL('/isletme', request.url).href, expiresAt }, 200, {
      'Set-Cookie': cookie(request, 'business', token, IMPERSONATION_LIFETIME_MS / 1000),
    });
  }
  if (['/api/admin/errors', '/api/admin/actions'].includes(path) && request.method === 'GET') {
    const input = query(request, S.adminLogsQuerySchema);
    const { after, next } = cursorPage(request, input.cursor);
    if (path.endsWith('/errors')) {
      const rows = await db
        .select()
        .from(errorLog)
        .where(
          and(
            input.sessionId ? eq(errorLog.sessionId, input.sessionId) : undefined,
            input.code ? eq(errorLog.code, input.code) : undefined,
            input.source ? eq(errorLog.source, input.source) : undefined,
            after
              ? sql`(${errorLog.occurredAt},${errorLog.id}) < (${after.time},${after.id})`
              : undefined,
          ),
        )
        .orderBy(desc(errorLog.occurredAt), desc(errorLog.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return json({
        errors: page.map((row) => ({ ...row, details: {} })),
        nextCursor: rows.length > input.limit ? next(page.at(-1)!, page.at(-1)!.occurredAt) : null,
      });
    }
    const rows = await db
      .select()
      .from(adminActions)
      .where(
        and(
          input.targetId ? eq(adminActions.targetId, input.targetId) : undefined,
          input.action ? eq(adminActions.action, input.action) : undefined,
          after
            ? sql`(${adminActions.occurredAt},${adminActions.id}) < (${after.time},${after.id})`
            : undefined,
        ),
      )
      .orderBy(desc(adminActions.occurredAt), desc(adminActions.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    return json({
      actions: page,
      nextCursor: rows.length > input.limit ? next(page.at(-1)!, page.at(-1)!.occurredAt) : null,
    });
  }
  return null;
}
