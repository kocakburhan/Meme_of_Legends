import { z } from 'zod';
import { promptTextSchema } from './business.js';
const id = z.string().min(1).max(200);
const time = z.number().int().nonnegative();
const nonempty = z.string().trim().min(1).max(200);
const patch = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(shape).refine((v) => Object.keys(v).length > 0);
const page = {
  cursor: z.string().max(4096).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
};
const search = z.string().max(200).default('');
const booleanFilter = z.enum(['true', 'false', 'all']).default('all');
export const adminBusinessesQuerySchema = z.strictObject({ q: search, active: booleanFilter });
export const adminCreateBusinessSchema = z.strictObject({
  name: nonempty,
  username: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((v) => v.normalize('NFC').toLocaleLowerCase('tr-TR')),
  credits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  password: z.string().min(12).max(128).optional(),
});
export const adminUpdateBusinessSchema = patch({
  creditsDelta: z
    .number()
    .int()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  unlimitedCredits: z.boolean().optional(),
  active: z.boolean().optional(),
  concurrentSessionLimit: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  lobbyLifetimeHours: z
    .number()
    .int()
    .positive()
    .max(Math.floor((Number.MAX_SAFE_INTEGER - Date.now()) / 3_600_000))
    .optional(),
});
export const adminPasswordSchema = z.strictObject({
  password: z.string().min(12).max(128).optional(),
});
export const adminCategoryCreateSchema = z.strictObject({
  name: nonempty,
  sortOrder: z.number().int().default(0),
});
export const adminCategoryUpdateSchema = patch({
  name: nonempty.optional(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});
export const adminPromptsQuerySchema = z.strictObject({
  ...page,
  q: search,
  status: z.enum(['active', 'archived', 'all']).default('all'),
});
export const adminBusinessPromptsQuerySchema = z.strictObject({
  ...page,
  q: search,
  businessId: id.optional(),
  blocked: booleanFilter,
});
export const adminPromptCreateSchema = z.strictObject({ text: promptTextSchema });
export const adminPromptUpdateSchema = patch({
  text: promptTextSchema.optional(),
  status: z.enum(['active', 'archived']).optional(),
});
export const adminPromptBlockSchema = z.strictObject({ adminBlocked: z.boolean() });
export const adminSessionsQuerySchema = z
  .strictObject({
    ...page,
    businessId: id.optional(),
    status: z
      .enum([
        'all',
        'active',
        'past',
        'lobby',
        'running',
        'paused',
        'finished',
        'cancelled',
        'terminated',
      ])
      .default('all'),
    from: z.coerce.number().int().nonnegative().optional(),
    to: z.coerce.number().int().nonnegative().optional(),
  })
  .refine((v) => v.from === undefined || v.to === undefined || v.from <= v.to);
export const adminLogsQuerySchema = z.strictObject({
  ...page,
  sessionId: id.optional(),
  targetId: id.optional(),
  code: id.optional(),
  source: id.optional(),
  action: id.optional(),
});
export const adminMemesQuerySchema = z.strictObject({
  ...page,
  q: search,
  categoryId: id.optional(),
  status: z.enum(['all', 'untagged', 'active', 'archived']).default('all'),
  order: z.enum(['newest', 'oldest']).default('newest'),
});
export const adminMemeMetaSchema = z
  .strictObject({
    mediaType: z.enum(['image', 'gif', 'video']),
    durationMs: z.number().int().positive().max(25_000).optional(),
    sourceUrl: z.url().max(2048).optional(),
    categoryId: id.optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.mediaType !== 'video' || v.durationMs !== undefined);
export const adminMemeUpdateSchema = patch({
  categoryId: id.nullable().optional(),
  description: z.string().trim().max(1000).optional(),
  status: z.enum(['untagged', 'active', 'archived']).optional(),
});
export const adminMemeCheckQuerySchema = z.strictObject({ sourceUrl: z.url().max(2048) });
export const adminBusinessSchema = z.strictObject({
  id,
  name: z.string(),
  username: z.string(),
  active: z.boolean(),
  credits: time,
  unlimitedCredits: z.boolean(),
  concurrentSessionLimit: time,
  lobbyLifetimeHours: time,
  createdAt: time,
});
export const adminUsageSchema = z.strictObject({
  sessionCount: time,
  activeSessionCount: time,
  consumedCredits: time,
  refundedCredits: time,
  lastGameAt: time.nullable(),
});
export const adminCategorySchema = z.strictObject({
  id,
  name: z.string(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});
export const adminPromptSchema = z.strictObject({
  id,
  ownerType: z.enum(['platform', 'business']),
  businessId: id.nullable(),
  text: z.string(),
  normalizedText: z.string(),
  status: z.enum(['active', 'archived']),
  adminBlocked: z.boolean(),
  createdAt: time,
  updatedAt: time,
});
export const adminMemeSchema = z.strictObject({
  id,
  categoryId: id.nullable(),
  description: z.string(),
  mediaType: z.enum(['image', 'gif', 'video']),
  r2Key: z.string(),
  coverKey: z.string().nullable(),
  durationMs: time.nullable(),
  sourceUrl: z.string().nullable(),
  status: z.enum(['untagged', 'active', 'archived']),
  createdAt: time,
  mediaUrl: z.string(),
  coverUrl: z.string().optional(),
});
export const adminSessionSchema = z.strictObject({
  id,
  businessId: id,
  roomCode: z.string(),
  status: z.enum(['lobby', 'running', 'paused', 'finished', 'cancelled', 'terminated']),
  mode: z.enum(['league', 'elimination', 'hybrid']),
  settings: z.record(z.string(), z.unknown()),
  createdAt: time,
  expiresAt: time,
  startedAt: time.nullable(),
  endedAt: time.nullable(),
  endReason: z.string().nullable(),
  creditConsumed: z.boolean(),
  creditCharged: z.boolean().nullable(),
  creditRefunded: z.boolean(),
  adminIntervention: z.boolean(),
});
export const adminActionSchema = z.strictObject({
  id,
  occurredAt: time,
  action: z.string(),
  targetId: z.string(),
  details: z.unknown(),
});
export const adminErrorSchema = z.strictObject({
  id,
  occurredAt: time,
  source: z.string(),
  sessionId: id.nullable(),
  code: z.string(),
  details: z.unknown(),
});
export const adminAuditSchema = z.strictObject({
  id,
  sessionId: id,
  occurredAt: time,
  type: z.string(),
  payload: z.unknown(),
});
const paginated = <K extends string, T extends z.ZodType>(key: K, schema: T) =>
  z
    .strictObject({ [key]: z.array(schema) } as { [P in K]: z.ZodArray<T> })
    .extend({ nextCursor: z.string().nullable() });
export const adminBusinessesResponseSchema = z.strictObject({
  businesses: z.array(adminBusinessSchema),
});
export const adminBusinessResponseSchema = z.strictObject({
  business: adminBusinessSchema,
  usage: adminUsageSchema.optional(),
});
export const adminBusinessCreatedResponseSchema = z.strictObject({
  business: adminBusinessSchema,
  credentials: z.strictObject({
    loginUrl: z.string(),
    username: z.string(),
    temporaryPassword: z.string(),
    summary: z.string(),
  }),
});
export const adminCategoriesResponseSchema = z.strictObject({
  categories: z.array(adminCategorySchema),
});
export const adminCategoryResponseSchema = z.strictObject({ category: adminCategorySchema });
export const adminPromptsResponseSchema = paginated('prompts', adminPromptSchema);
export const adminPromptResponseSchema = z.strictObject({ prompt: adminPromptSchema });
export const adminPromptHealthResponseSchema = z.strictObject({
  activeCount: time,
  lowThreshold: time,
  low: z.boolean(),
});
export const adminMemesResponseSchema = paginated('memes', adminMemeSchema);
export const adminMemeResponseSchema = z.strictObject({ meme: adminMemeSchema });
export const adminMemeCheckResponseSchema = z.strictObject({ existingId: id.nullable() });
export const adminSessionsResponseSchema = paginated('sessions', adminSessionSchema);
const reportParticipantSchema = z.strictObject({
  id,
  nickname: z.string(),
  role: z.enum(['player', 'voter']),
  status: z.enum(['pending', 'active', 'left', 'kicked']),
  eliminated: z.boolean(),
  withdrawn: z.boolean(),
});
const scoreSchema = z.strictObject({ average: z.number(), votes: z.number().int().nonnegative() });
const juryEntrySchema = z.strictObject({ nickname: z.string(), average: z.number() });
export const adminReportSchema = z.strictObject({
  participants: z.array(reportParticipantSchema),
  playerCount: time,
  spectatorCount: time,
  rounds: z.array(
    z.strictObject({
      no: time,
      kind: z.enum(['regular', 'overtime']),
      context: z.enum(['elimination', 'league', 'semifinal', 'final']),
      prompt: z.strictObject({ id, text: z.string(), owner: z.string() }),
      players: z.array(id),
      matches: z.array(z.tuple([id, id])),
      byes: z.array(id),
      locked: z.boolean(),
      scores: z.record(z.string(), scoreSchema),
      resolution: z.array(z.array(id)),
      submissions: z.array(
        z.strictObject({
          id,
          playerId: id,
          memeId: id.nullable(),
          customType: z.enum(['image', 'gif', 'youtube']).nullable(),
          hidden: z.boolean(),
          invalid: z.boolean(),
        }),
      ),
    }),
  ),
  result: z
    .strictObject({
      champion: id.nullable(),
      ranking: z.array(z.strictObject({ participantId: id, rank: z.number(), score: z.number() })),
      jury: z
        .strictObject({
          harshest: z.array(juryEntrySchema),
          mostGenerous: z.array(juryEntrySchema),
        })
        .nullable(),
      reason: z.enum(['completed', 'manager', 'empty', 'noPrompts', 'players']),
    })
    .nullable(),
});
export const adminSessionResponseSchema = z.strictObject({
  session: adminSessionSchema,
  business: adminBusinessSchema,
  report: adminReportSchema.nullable(),
  audit: z.array(adminAuditSchema),
  adminActions: z.array(adminActionSchema),
  errors: z.array(adminErrorSchema),
});
export const adminUsageResponseSchema = z.strictObject({
  businesses: z.array(z.strictObject({ business: adminBusinessSchema, usage: adminUsageSchema })),
});
export const adminActionsResponseSchema = paginated('actions', adminActionSchema);
export const adminErrorsResponseSchema = paginated('errors', adminErrorSchema);
export const adminImpersonateResponseSchema = z.strictObject({
  loginUrl: z.string(),
  expiresAt: time,
});
export const adminOkResponseSchema = z.strictObject({ ok: z.literal(true) });
export const adminPasswordResponseSchema = z.strictObject({ temporaryPassword: z.string() });
export const libraryMemeSchema = z.strictObject({
  id,
  title: z.string(),
  category: z.string().nullable(),
  mediaType: z.enum(['image', 'gif', 'video']),
  mediaUrl: z.string().optional(),
  coverUrl: z.string().optional(),
  durationMs: time.nullable().optional(),
});
export const libraryResponseSchema = z.strictObject({ memes: z.array(libraryMemeSchema) });
export type AdminMeme = z.infer<typeof adminMemeSchema>;
export type AdminBusiness = z.infer<typeof adminBusinessSchema>;
export type AdminSession = z.infer<typeof adminSessionSchema>;
export type AdminUsage = z.infer<typeof adminUsageSchema>;

export type AdminReport = z.infer<typeof adminReportSchema>;
