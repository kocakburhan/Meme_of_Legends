import type { EngineState } from '@mol/engine';
import {
  businessPromptsQuerySchema,
  businessSessionsQuerySchema,
  createBusinessPromptRequestSchema,
  updateBusinessPromptRequestSchema,
  normalizePromptText,
  type BusinessPrompt,
  type SessionReport,
  type SessionSummary,
} from '@mol/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { z } from 'zod';
import { ApiFailure, body, json } from './auth';
import { gameSessions, prompts, sessionReports } from './db/schema';

type StoredReport = Pick<EngineState, 'participants' | 'rounds' | 'result'>;
function reportFields(summary: unknown, anonymizedAt: number | null) {
  if (!summary) return { report: null, playerCount: null, spectatorCount: null, champion: null };
  // Reports are written by the room from the final engine snapshot, never client input.
  const stored = summary as StoredReport;
  const participants = Object.values(stored.participants);
  const names = new Map(
    participants.map((p, i) => [
      p.id,
      anonymizedAt === null || /^Katılımcı [1-9]\d*$/u.test(p.nickname)
        ? p.nickname
        : `Katılımcı ${i + 1}`,
    ]),
  );
  const name = (id: string) => names.get(id) ?? 'Katılımcı';
  const juryName = (nickname: string) =>
    anonymizedAt === null
      ? nickname
      : name(participants.find((p) => p.nickname === nickname)?.id ?? '');
  const players = new Set(stored.rounds.flatMap((r) => [...r.players, ...r.byes]));
  participants
    .filter((p) => p.role === 'player' || p.eliminated || p.withdrawn)
    .forEach((p) => players.add(p.id));
  const report: SessionReport = {
    rounds: stored.rounds.length,
    standings: (stored.result?.ranking ?? []).map((r) => ({
      rank: r.rank,
      nickname: name(r.participantId),
      score: r.score,
    })),
    juryAwards: [
      ...(stored.result?.jury?.harshest ?? []).map((j) => ({
        title: 'En sert jüri',
        nickname: juryName(j.nickname),
      })),
      ...(stored.result?.jury?.mostGenerous ?? []).map((j) => ({
        title: 'En cömert jüri',
        nickname: juryName(j.nickname),
      })),
    ],
    hiddenContentCount: stored.rounds.reduce(
      (count, r) => count + Object.values(r.submissions).filter((s) => s.hidden).length,
      0,
    ),
  };
  return {
    report,
    playerCount: participants.filter((p) => players.has(p.id)).length,
    spectatorCount: participants.filter((p) => !players.has(p.id)).length,
    champion: stored.result?.champion ? name(stored.result.champion) : null,
  };
}
function summarize(row: {
  session: typeof gameSessions.$inferSelect;
  summary: unknown;
  anonymizedAt: number | null;
}) {
  const { report, ...counts } = reportFields(row.summary, row.anonymizedAt);
  const s = row.session;
  const session: SessionSummary = {
    id: s.id,
    roomCode: s.roomCode,
    status: s.status,
    mode: s.mode,
    createdAt: s.createdAt,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    endReason: s.endReason,
    ...counts,
  };
  return { session, report };
}
const cursorSchema = z.strictObject({
  time: z.number().int().nonnegative(),
  id: z.string().min(1),
  scope: z.string(),
});
function decodeCursor(value: string | undefined, scope: string) {
  if (!value) return null;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
          Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
        ),
      ),
    );
    if (parsed.scope !== scope) throw new Error('Cursor scope mismatch');
    return parsed;
  } catch {
    throw new ApiFailure(400, 'INVALID_REQUEST');
  }
}
function encodeCursor(row: { createdAt: number; id: string }, scope: string) {
  return btoa(
    String.fromCharCode(
      ...new TextEncoder().encode(JSON.stringify({ time: row.createdAt, id: row.id, scope })),
    ),
  );
}
function query<T>(request: Request, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new ApiFailure(400, 'INVALID_REQUEST');
  return parsed.data;
}
function publicPrompt(p: typeof prompts.$inferSelect): BusinessPrompt {
  return {
    id: p.id,
    text: p.text,
    status: p.status,
    adminBlocked: p.adminBlocked,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
async function promptInput<T>(request: Request, schema: z.ZodType<T>) {
  try {
    return await body(request, schema);
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'INVALID_REQUEST')
      throw new ApiFailure(422, 'PROMPT_INVALID');
    throw error;
  }
}

export async function businessDataRoute(
  request: Request,
  env: Cloudflare.Env,
  path: string,
  ownerId: string,
): Promise<Response | null> {
  const db = drizzle(env.DB);
  const sessions = () =>
    db
      .select({
        session: gameSessions,
        summary: sessionReports.summary,
        anonymizedAt: sessionReports.anonymizedAt,
      })
      .from(gameSessions)
      .leftJoin(sessionReports, eq(gameSessions.id, sessionReports.sessionId));
  if (path === '/api/business/sessions' && request.method === 'GET') {
    const input = query(request, businessSessionsQuerySchema);
    const scope = JSON.stringify([ownerId, 'sessions', input.status]);
    const cursor = decodeCursor(input.cursor, scope);
    const active = input.status === 'active';
    const rows = await sessions()
      .where(
        and(
          eq(gameSessions.businessId, ownerId),
          active
            ? sql`${gameSessions.status} IN ('lobby','running','paused')`
            : sql`${gameSessions.status} IN ('finished','cancelled','terminated')`,
          !active && cursor
            ? sql`(${gameSessions.createdAt}, ${gameSessions.id}) < (${cursor.time}, ${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(desc(gameSessions.createdAt), desc(gameSessions.id))
      .limit(active ? -1 : input.limit + 1);
    const page = active ? rows : rows.slice(0, input.limit);
    return json({
      sessions: page.map((r) => summarize(r).session),
      ...(active
        ? {}
        : {
            nextCursor:
              rows.length > input.limit ? encodeCursor(page.at(-1)!.session, scope) : null,
          }),
    });
  }
  const sessionMatch = /^\/api\/business\/sessions\/([^/]+)$/.exec(path);
  if (sessionMatch && request.method === 'GET') {
    const row = await sessions()
      .where(and(eq(gameSessions.businessId, ownerId), eq(gameSessions.id, sessionMatch[1]!)))
      .get();
    if (!row) throw new ApiFailure(404, 'NOT_FOUND');
    return json(summarize(row));
  }
  if (path === '/api/business/prompts' && request.method === 'GET') {
    const input = query(request, businessPromptsQuerySchema);
    const search = normalizePromptText(input.q);
    const scope = JSON.stringify([ownerId, 'prompts', input.status, search]);
    const cursor = decodeCursor(input.cursor, scope);
    const rows = await db
      .select()
      .from(prompts)
      .where(
        and(
          eq(prompts.businessId, ownerId),
          eq(prompts.ownerType, 'business'),
          input.status === 'all' ? undefined : eq(prompts.status, input.status),
          search ? sql`instr(${prompts.normalizedText}, ${search}) > 0` : undefined,
          cursor
            ? sql`(${prompts.createdAt}, ${prompts.id}) < (${cursor.time}, ${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(desc(prompts.createdAt), desc(prompts.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    return json({
      prompts: page.map(publicPrompt),
      nextCursor: rows.length > input.limit ? encodeCursor(page.at(-1)!, scope) : null,
    });
  }
  const promptMatch = /^\/api\/business\/prompts\/([^/]+)$/.exec(path);
  const creating = path === '/api/business/prompts' && request.method === 'POST';
  if (creating || (promptMatch && request.method === 'PATCH')) {
    const existing = creating
      ? undefined
      : await db
          .select()
          .from(prompts)
          .where(
            and(
              eq(prompts.id, promptMatch![1]!),
              eq(prompts.businessId, ownerId),
              eq(prompts.ownerType, 'business'),
            ),
          )
          .get();
    if (!creating && !existing) throw new ApiFailure(404, 'NOT_FOUND');
    const input = creating
      ? await promptInput(request, createBusinessPromptRequestSchema)
      : await promptInput(request, updateBusinessPromptRequestSchema);
    const normalizedText = normalizePromptText(input.text ?? existing!.text);
    try {
      const now = Date.now();
      const row = creating
        ? (
            await db
              .insert(prompts)
              .values({
                id: crypto.randomUUID(),
                ownerType: 'business',
                businessId: ownerId,
                text: input.text!,
                normalizedText,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
          )[0]!
        : (
            await db
              .update(prompts)
              .set({
                ...(input.text === undefined ? {} : { text: input.text, normalizedText }),
                ...('status' in input && input.status ? { status: input.status } : {}),
                updatedAt: now,
              })
              .where(and(eq(prompts.id, existing!.id), eq(prompts.businessId, ownerId)))
              .returning()
          )[0]!;
      return json({ prompt: publicPrompt(row) }, creating ? 201 : 200);
    } catch (error) {
      // The unique index also handles concurrent creates/edits, including archived rows.
      if (
        `${error} ${(error as Error).cause}`.includes(
          'prompts.business_id, prompts.normalized_text',
        )
      ) {
        const duplicate = await db
          .select({ id: prompts.id })
          .from(prompts)
          .where(and(eq(prompts.businessId, ownerId), eq(prompts.normalizedText, normalizedText)))
          .get();
        if (duplicate) throw new ApiFailure(409, 'PROMPT_DUPLICATE', { existingId: duplicate.id });
      }
      throw error;
    }
  }
  return null;
}
