import { z } from 'zod';

/** Same canonical form for duplicate checks and Turkish case-insensitive search. */
export function normalizePromptText(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('tr-TR');
}
export const promptTextSchema = z
  .string()
  .transform((text) => text.normalize('NFC').trim())
  .refine((text) => [...text].length >= 3 && [...text].length <= 160)
  .refine(
    (text) =>
      !/[<>]|(?:[a-z][a-z\d+.-]*:\/\/|https?:|mailto:|www\.|[\p{L}\p{N}-]+\.[\p{L}]{2,})/iu.test(
        text,
      ),
  );
export const createBusinessPromptRequestSchema = z.strictObject({ text: promptTextSchema });
export const updateBusinessPromptRequestSchema = z
  .strictObject({
    text: promptTextSchema.optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .refine((input) => input.text !== undefined || input.status !== undefined);
const cursor = z.string().max(2048).optional();
const limit = (fallback: number) => z.coerce.number().int().min(1).max(100).default(fallback);
export const businessSessionsQuerySchema = z.strictObject({
  status: z.enum(['active', 'past']),
  cursor,
  limit: limit(20),
});
export const businessPromptsQuerySchema = z.strictObject({
  q: z.string().max(160).default(''),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  cursor,
  limit: limit(50),
});
export const businessPromptSchema = z.strictObject({
  id: z.string(),
  text: z.string(),
  status: z.enum(['active', 'archived']),
  adminBlocked: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export const sessionSummarySchema = z.strictObject({
  id: z.string(),
  roomCode: z.string(),
  status: z.enum(['lobby', 'running', 'paused', 'finished', 'cancelled', 'terminated']),
  mode: z.enum(['elimination', 'league', 'hybrid']),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  endReason: z.string().nullable(),
  playerCount: z.number().int().nonnegative().nullable(),
  spectatorCount: z.number().int().nonnegative().nullable(),
  champion: z.string().nullable(),
});
export const sessionReportSchema = z.strictObject({
  rounds: z.number().int().nonnegative(),
  standings: z.array(
    z.strictObject({ rank: z.number().int().positive(), nickname: z.string(), score: z.number() }),
  ),
  juryAwards: z.array(z.strictObject({ title: z.string(), nickname: z.string() })),
  hiddenContentCount: z.number().int().nonnegative(),
});
export const businessSessionsResponseSchema = z.strictObject({
  sessions: z.array(sessionSummarySchema),
  nextCursor: z.string().nullable().optional(),
});
export const businessSessionResponseSchema = z.strictObject({
  session: sessionSummarySchema,
  report: sessionReportSchema.nullable(),
});
export const businessPromptsResponseSchema = z.strictObject({
  prompts: z.array(businessPromptSchema),
  nextCursor: z.string().nullable(),
});
export const businessPromptResponseSchema = z.strictObject({ prompt: businessPromptSchema });
export type BusinessPrompt = z.infer<typeof businessPromptSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionReport = z.infer<typeof sessionReportSchema>;
