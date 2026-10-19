import * as S from '@mol/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ApiFailure, body, json } from './auth';
import { adminActions, categories, memes, prompts } from './db/schema';
import { audit, cursorPage, query, uniqueFailure } from './admin-common';
import { uploadMeme, publicMeme } from './media';
export const LOW_PROMPT_THRESHOLD = 30;
export async function adminContentRoute(
  request: Request,
  env: Cloudflare.Env,
  path: string,
): Promise<Response | null> {
  const db = drizzle(env.DB);
  if (path === '/api/admin/categories' && request.method === 'GET')
    return json({
      categories: await db
        .select()
        .from(categories)
        .orderBy(asc(categories.sortOrder), asc(categories.id)),
    });
  const categoryMatch = /^\/api\/admin\/categories\/([^/]+)$/.exec(path);
  const creatingCategory = path === '/api/admin/categories' && request.method === 'POST';
  if (creatingCategory || (categoryMatch && request.method === 'PATCH')) {
    const id = categoryMatch?.[1] ?? crypto.randomUUID();
    if (
      !creatingCategory &&
      !(await db.select().from(categories).where(eq(categories.id, id)).get())
    )
      throw new ApiFailure(404, 'NOT_FOUND');
    const input = creatingCategory
      ? await body(request, S.adminCategoryCreateSchema)
      : await body(request, S.adminCategoryUpdateSchema);
    await db.batch([
      creatingCategory
        ? db.insert(categories).values({ id, name: input.name!, ...input })
        : db.update(categories).set(input).where(eq(categories.id, id)),
      db
        .insert(adminActions)
        .values(audit(creatingCategory ? 'categoryCreated' : 'categoryUpdated', id, input)),
    ]);
    return json(
      { category: await db.select().from(categories).where(eq(categories.id, id)).get() },
      creatingCategory ? 201 : 200,
    );
  }
  if (path === '/api/admin/prompts/health' && request.method === 'GET') {
    const row = await db
      .select({ count: sql<number>`count(*)` })
      .from(prompts)
      .where(
        and(
          eq(prompts.ownerType, 'platform'),
          eq(prompts.status, 'active'),
          eq(prompts.adminBlocked, false),
        ),
      )
      .get();
    return json({
      activeCount: row!.count,
      lowThreshold: LOW_PROMPT_THRESHOLD,
      low: row!.count < LOW_PROMPT_THRESHOLD,
    });
  }
  if (
    ['/api/admin/prompts', '/api/admin/business-prompts'].includes(path) &&
    request.method === 'GET'
  ) {
    const business = path.endsWith('business-prompts');
    const input = business
      ? query(request, S.adminBusinessPromptsQuerySchema)
      : query(request, S.adminPromptsQuerySchema);
    const { after, next } = cursorPage(request, input.cursor);
    const rows = await db
      .select()
      .from(prompts)
      .where(
        and(
          eq(prompts.ownerType, business ? 'business' : 'platform'),
          'businessId' in input && input.businessId
            ? eq(prompts.businessId, input.businessId)
            : undefined,
          'blocked' in input && input.blocked !== 'all'
            ? eq(prompts.adminBlocked, input.blocked === 'true')
            : undefined,
          'status' in input && input.status !== 'all'
            ? eq(prompts.status, input.status)
            : undefined,
          input.q
            ? sql`instr(${prompts.normalizedText}, ${S.normalizePromptText(input.q)}) > 0`
            : undefined,
          after
            ? sql`(${prompts.createdAt}, ${prompts.id}) < (${after.time}, ${after.id})`
            : undefined,
        ),
      )
      .orderBy(desc(prompts.createdAt), desc(prompts.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    return json({
      prompts: page,
      nextCursor: rows.length > input.limit ? next(page.at(-1)!, page.at(-1)!.createdAt) : null,
    });
  }
  const businessPromptMatch = /^\/api\/admin\/business-prompts\/([^/]+)$/.exec(path);
  if (businessPromptMatch && request.method === 'PATCH') {
    const id = businessPromptMatch[1]!;
    const existing = await db
      .select()
      .from(prompts)
      .where(and(eq(prompts.id, id), eq(prompts.ownerType, 'business')))
      .get();
    if (!existing) throw new ApiFailure(404, 'NOT_FOUND');
    const input = await body(request, S.adminPromptBlockSchema);
    await db.batch([
      db
        .update(prompts)
        .set({ ...input, updatedAt: Date.now() })
        .where(eq(prompts.id, id)),
      db.insert(adminActions).values(audit('businessPromptBlocked', id, input)),
    ]);
    return json({ prompt: await db.select().from(prompts).where(eq(prompts.id, id)).get() });
  }
  const promptMatch = /^\/api\/admin\/prompts\/([^/]+)$/.exec(path);
  const creatingPrompt = path === '/api/admin/prompts' && request.method === 'POST';
  if (creatingPrompt || (promptMatch && request.method === 'PATCH')) {
    const id = promptMatch?.[1] ?? crypto.randomUUID();
    const existing = await db
      .select()
      .from(prompts)
      .where(and(eq(prompts.id, id), eq(prompts.ownerType, 'platform')))
      .get();
    if (!creatingPrompt && !existing) throw new ApiFailure(404, 'NOT_FOUND');
    let input;
    try {
      input = creatingPrompt
        ? await body(request, S.adminPromptCreateSchema)
        : await body(request, S.adminPromptUpdateSchema);
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'INVALID_REQUEST')
        throw new ApiFailure(422, 'PROMPT_INVALID');
      throw error;
    }
    const normalizedText = S.normalizePromptText(input.text ?? existing!.text);
    const now = Date.now();
    try {
      await db.batch([
        creatingPrompt
          ? db
              .insert(prompts)
              .values({
                id,
                ownerType: 'platform',
                text: input.text!,
                normalizedText,
                createdAt: now,
                updatedAt: now,
              })
          : db
              .update(prompts)
              .set({ ...input, normalizedText, updatedAt: now })
              .where(eq(prompts.id, id)),
        db
          .insert(adminActions)
          .values(
            audit(creatingPrompt ? 'platformPromptCreated' : 'platformPromptUpdated', id, input),
          ),
      ]);
    } catch (error) {
      if (uniqueFailure(error)) {
        const duplicate = await db
          .select()
          .from(prompts)
          .where(and(eq(prompts.ownerType, 'platform'), eq(prompts.normalizedText, normalizedText)))
          .get();
        if (duplicate) throw new ApiFailure(409, 'PROMPT_DUPLICATE', { existingId: duplicate.id });
      }
      throw error;
    }
    return json(
      { prompt: await db.select().from(prompts).where(eq(prompts.id, id)).get() },
      creatingPrompt ? 201 : 200,
    );
  }
  if (path === '/api/admin/memes/check' && request.method === 'GET') {
    const input = query(request, S.adminMemeCheckQuerySchema);
    return json({
      existingId:
        (await db.select().from(memes).where(eq(memes.sourceUrl, input.sourceUrl)).get())?.id ??
        null,
    });
  }
  if (path === '/api/admin/memes' && request.method === 'POST') return uploadMeme(request, env);
  if (path === '/api/admin/memes' && request.method === 'GET') {
    const input = query(request, S.adminMemesQuerySchema);
    const { after, next } = cursorPage(request, input.cursor);
    const oldest = input.order === 'oldest';
    const rows = await db
      .select()
      .from(memes)
      .where(
        and(
          input.status === 'all' ? undefined : eq(memes.status, input.status),
          input.categoryId ? eq(memes.categoryId, input.categoryId) : undefined,
          input.q ? sql`instr(lower(${memes.description}), lower(${input.q})) > 0` : undefined,
          after
            ? oldest
              ? sql`(${memes.createdAt},${memes.id}) > (${after.time},${after.id})`
              : sql`(${memes.createdAt},${memes.id}) < (${after.time},${after.id})`
            : undefined,
        ),
      )
      .orderBy(
        oldest ? asc(memes.createdAt) : desc(memes.createdAt),
        oldest ? asc(memes.id) : desc(memes.id),
      )
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    return json({
      memes: page.map(publicMeme),
      nextCursor: rows.length > input.limit ? next(page.at(-1)!, page.at(-1)!.createdAt) : null,
    });
  }
  const memeMatch = /^\/api\/admin\/memes\/([^/]+)$/.exec(path);
  if (memeMatch && request.method === 'PATCH') {
    const id = memeMatch[1]!;
    const existing = await db.select().from(memes).where(eq(memes.id, id)).get();
    if (!existing) throw new ApiFailure(404, 'NOT_FOUND');
    const input = await body(request, S.adminMemeUpdateSchema);
    const next = { ...existing, ...input };
    if (next.status === 'active' && (!next.categoryId || !next.description.trim()))
      throw new ApiFailure(422, 'MEME_TAGS_REQUIRED');
    if (
      next.categoryId &&
      !(await db.select().from(categories).where(eq(categories.id, next.categoryId)).get())
    )
      throw new ApiFailure(422, 'CATEGORY_NOT_FOUND');
    await db.batch([
      db.update(memes).set(input).where(eq(memes.id, id)),
      db.insert(adminActions).values(audit('memeUpdated', id, input)),
    ]);
    return json({
      meme: publicMeme((await db.select().from(memes).where(eq(memes.id, id)).get())!),
    });
  }
  return null;
}
