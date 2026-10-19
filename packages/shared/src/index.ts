import { z } from 'zod';
import type { Command, SessionConfig, View } from '@mol/engine';
export type { View, Command } from '@mol/engine';

const id = z.string().min(1).max(200);
export const roomCodeSchema = z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
export const nicknameSchema = z.string().refine((value) => {
  const n = value;
  return (
    Array.from(n).length >= 2 &&
    Array.from(n).length <= 20 &&
    /^[\p{L}\p{N}\p{M}\p{Zs}\p{Extended_Pictographic}\p{Emoji_Component}]+$/u.test(n) &&
    /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(n) &&
    !/(https?:|www\.|\w+\.\w+)/iu.test(n)
  );
}, 'INVALID_NICKNAME');
export const joinRequestSchema = z.strictObject({
  nickname: nicknameSchema,
  wants: z.enum(['player', 'voter']),
});
// Responses of the taslak HTTP surface (protocol.md §2); validated before use.
export const roomInfoSchema = z.strictObject({
  code: roomCodeSchema,
  businessName: z.string().nullable(),
  started: z.boolean(),
});
export type RoomInfo = z.infer<typeof roomInfoSchema>;
export const joinResponseSchema = z.strictObject({
  participantId: id,
  token: z.string().min(1),
});
export type JoinResponse = z.infer<typeof joinResponseSchema>;
export const sessionConfigSchema = z.strictObject({
  mode: z.enum(['elimination', 'league', 'hybrid']),
  leagueRounds: z.number().int().min(1).max(50),
  selectionSeconds: z.number().int().min(30).max(240),
  reviewSeconds: z.number().int().min(15).max(120),
  customContent: z.boolean(),
  playerApproval: z.boolean(),
  voterApproval: z.boolean(),
  acceptVoters: z.boolean(),
}) satisfies z.ZodType<SessionConfig>;
export const mediaRefSchema = z.discriminatedUnion('source', [
  z.strictObject({
    source: z.literal('system'),
    memeId: id,
    mediaType: z.enum(['image', 'gif', 'video']),
    durationMs: z.number().int().min(0).max(25000).optional(),
  }),
  z.strictObject({
    source: z.literal('upload'),
    uploadId: id,
    mediaType: z.enum(['image', 'gif']),
  }),
  z
    .strictObject({
      source: z.literal('youtube'),
      videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().positive(),
    })
    .refine((v) => v.endMs > v.startMs && v.endMs - v.startMs <= 25000),
]);
// Command contains grouped discriminants, so distribute before selecting role subsets.
type ExpandCommand<C = Command> = C extends { type: infer T extends string }
  ? { [K in T]: Omit<C, 'type'> & { type: K } }[T]
  : never;
type ParticipantKind =
  'join' | 'select' | 'confirm' | 'rate' | 'finishReview' | 'leaveToVoter' | 'changeNickname';
type SystemKind = 'tick' | 'connection' | 'restore';
export type ParticipantCommand = StripIdentity<Extract<ExpandCommand, { type: ParticipantKind }>>;
type StripIdentity<C> = C extends unknown ? Omit<C, 'participantId'> : never;
export type ManagerCommand = Exclude<ExpandCommand, { type: ParticipantKind | SystemKind }>;
export type ClientCommand = ParticipantCommand | ManagerCommand;
const simple = <T extends string>(type: T) => z.strictObject({ type: z.literal(type) });
export const participantCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('join'), ...joinRequestSchema.shape }),
  z.strictObject({ type: z.literal('select'), media: mediaRefSchema }),
  simple('confirm'),
  simple('finishReview'),
  simple('leaveToVoter'),
  z.strictObject({
    type: z.literal('rate'),
    submissionId: id,
    score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  }),
  z.strictObject({ type: z.literal('changeNickname'), nickname: nicknameSchema }),
]) satisfies z.ZodType<ParticipantCommand>;
export const managerCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('updateSettings'), patch: sessionConfigSchema.partial() }),
  ...(
    [
      'approveParticipant',
      'rejectParticipant',
      'rejectCustom',
      'moveToVoter',
      'kick',
      'resetNickname',
    ] as const
  ).map((type) => z.strictObject({ type: z.literal(type), participantId: id })),
  ...(
    [
      'start',
      'pause',
      'resume',
      'replacePrompt',
      'hideCurrent',
      'closeReview',
      'skipResults',
      'endGame',
    ] as const
  ).map(simple),
  z.strictObject({
    type: z.literal('addTime'),
    seconds: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  }),
]) satisfies z.ZodType<ManagerCommand>;
export const clientCommandSchema = z.union([participantCommandSchema, managerCommandSchema]);
export const shellActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('approveTakeover'), requestId: id }),
  z.strictObject({ kind: z.literal('rejectTakeover'), requestId: id }),
  z.strictObject({ kind: z.literal('createDisplayPairCode') }),
  z.strictObject({ kind: z.literal('rematch') }),
]);
export type ShellAction = z.infer<typeof shellActionSchema>;
export const managerShellInfoSchema = z.strictObject({
  pendingTakeovers: z.array(
    z.strictObject({
      requestId: id,
      participantId: id,
      nickname: z.string(),
      requestedAt: z.number().int().nonnegative(),
    }),
  ),
  displayPairCode: z
    .strictObject({ code: z.string().regex(/^\d{6}$/), expiresAt: z.number().int().nonnegative() })
    .nullable(),
  displayConnected: z.boolean(),
});
export type ManagerShellInfo = z.infer<typeof managerShellInfoSchema>;
// Poll the same POST endpoint using the opaque receipt returned by the initial request.
export const takeoverRequestSchema = z.union([
  z.strictObject({ nickname: nicknameSchema }),
  z.strictObject({ requestId: id, receipt: id }),
]);
export const displayPairRequestSchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) });
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('cmd'), clientMsgId: id, cmd: clientCommandSchema }),
  z.strictObject({ type: z.literal('ping'), t: z.number().finite() }),
  z.strictObject({ type: z.literal('shell'), clientMsgId: id, action: shellActionSchema }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type TakeoverRequest = z.infer<typeof takeoverRequestSchema>;
export const takeoverResponseSchema = z.union([
  z.strictObject({ status: z.literal('pending'), requestId: id, receipt: id }),
  z.strictObject({ status: z.enum(['pending', 'rejected']) }),
  z.strictObject({ status: z.literal('approved'), participantId: id, token: z.string().min(1) }),
]);
export type TakeoverResponse = z.infer<typeof takeoverResponseSchema>;
export const displayPairResponseSchema = z.strictObject({
  token: z.string().min(1),
  roomCode: roomCodeSchema,
});
export type DisplayPairResponse = z.infer<typeof displayPairResponseSchema>;
// Public cues carry no engine event payload or participant identity.
export const publicCueSchema = z.strictObject({
  type: z.enum(['revealStep', 'drawPerformed', 'eliminated']),
  roundNo: z.number().int().positive(),
});
export type PublicCue = z.infer<typeof publicCueSchema>;
export type ServerMessage =
  | { type: 'view'; seq: number; serverNow: number; view: View; shell?: ManagerShellInfo }
  | { type: 'ack'; clientMsgId: string; ok: boolean; reason?: string }
  | { type: 'cue'; serverNow: number; cue: PublicCue }
  | { type: 'pong'; t: number; serverNow: number }
  | { type: 'recovery'; serverNow: number; resumesAt: number }
  | { type: 'closed'; reason: 'kicked' | 'superseded' | 'sessionEnded' | 'roomExpired' };
export interface ApiError {
  error: { code: string };
}
export const participantTokenClaimsSchema = z.strictObject({
  kind: z.literal('participant'),
  nonce: id.optional(),
  participantId: id,
  sessionId: id,
  roomCode: roomCodeSchema,
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});
export type ParticipantTokenClaims = z.infer<typeof participantTokenClaimsSchema>;

export const displayTokenClaimsSchema = z.strictObject({
  kind: z.literal('display'),
  sessionId: id,
  roomCode: roomCodeSchema,
  nonce: id,
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});
export type DisplayTokenClaims = z.infer<typeof displayTokenClaimsSchema>;

const timestamp = z.number().int().nonnegative();
const scoreSchema = z.strictObject({
  average: z.number().finite(),
  votes: z.number().int().nonnegative(),
});
const promptSchema = z.strictObject({ id, text: z.string(), owner: z.string() });
const rankingSchema = z.strictObject({
  participantId: id,
  rank: z.number().int().positive(),
  score: z.number().finite(),
});
const juryEntrySchema = z.strictObject({ nickname: z.string(), average: z.number().finite() });
const submissionViewSchema = z.strictObject({
  id,
  media: mediaRefSchema.nullable(),
  hidden: z.boolean(),
  playerId: id.optional(),
  score: scoreSchema.optional(),
  ownScore: z.number().int().min(1).max(5).optional(),
  canRate: z.boolean().optional(),
  ratingProgress: z
    .strictObject({
      received: z.number().int().nonnegative(),
      eligible: z.number().int().nonnegative(),
    })
    .optional(),
});
const phaseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('lobby') }),
  z.strictObject({
    kind: z.literal('selection'),
    roundNo: z.number().int().positive(),
    endsAt: timestamp,
    promptReplaceUntil: timestamp,
  }),
  z.strictObject({
    kind: z.literal('presentation'),
    roundNo: z.number().int().positive(),
    index: z.number().int().nonnegative(),
    lastCallAt: timestamp,
    endsAt: timestamp,
  }),
  ...(['review', 'results', 'draw'] as const).map((kind) =>
    z.strictObject({
      kind: z.literal(kind),
      roundNo: z.number().int().positive(),
      endsAt: timestamp,
    }),
  ),
  z.strictObject({
    kind: z.literal('reveal'),
    roundNo: z.number().int().positive(),
    step: z.number().int().nonnegative(),
    nextStepAt: timestamp,
  }),
  z.strictObject({ kind: z.literal('finished') }),
]);
export const viewSchema = z.strictObject({
  status: z.enum(['lobby', 'running', 'paused', 'finished', 'terminated']),
  phase: phaseSchema,
  config: sessionConfigSchema,
  // M3b (onaylı): presentation position and the participant's own submission id.
  presentation: z
    .strictObject({
      index: z.number().int().nonnegative(),
      total: z.number().int().positive(),
      submissionId: id,
    })
    .optional(),
  ownSubmissionId: id.nullable().optional(),
  participants: z.array(
    z.strictObject({
      id,
      nickname: z.string(),
      role: z.enum(['player', 'voter']),
      ready: z.boolean(),
      status: z.enum(['pending', 'active', 'left', 'kicked']).optional(),
      connected: z.boolean().optional(),
      joinedAt: timestamp.optional(),
      needsNickname: z.boolean().optional(),
    }),
  ),
  spectatorCount: z.number().int().nonnegative(),
  prompt: promptSchema.nullable(),
  matches: z.array(z.tuple([id, id])),
  byes: z.array(id),
  submissions: z.array(submissionViewSchema),
  ownSubmission: z
    .strictObject({
      id,
      playerId: id,
      media: mediaRefSchema.nullable(),
      confirmed: z.boolean(),
      invalid: z.boolean(),
      hidden: z.boolean(),
      compensation: z.boolean(),
      customType: z.enum(['image', 'gif', 'youtube']).nullable(),
    })
    .nullable()
    .optional(),
  promptPreview: promptSchema.nullable().optional(),
  review: z
    .strictObject({
      finished: z.number().int().nonnegative(),
      eligible: z.number().int().nonnegative(),
    })
    .optional(),
  isFinalRound: z.boolean().optional(),
  result: z
    .strictObject({
      champion: id.nullable(),
      ranking: z.array(rankingSchema),
      jury: z
        .strictObject({
          harshest: z.array(juryEntrySchema),
          mostGenerous: z.array(juryEntrySchema),
        })
        .nullable(),
      reason: z.enum(['completed', 'players', 'manager', 'empty', 'noPrompts']),
    })
    .nullable(),
  stage: z.strictObject({
    context: z.enum(['elimination', 'league', 'semifinal', 'final']),
    round: z.number().int().nonnegative(),
    contenders: z.array(id).optional(),
  }),
  table: z.array(rankingSchema),
  completedRounds: z.array(
    z.strictObject({ no: z.number().int().positive(), submissions: z.array(submissionViewSchema) }),
  ),
}) satisfies z.ZodType<View>;
export const serverMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('view'),
    seq: z.number().int().nonnegative(),
    serverNow: timestamp,
    view: viewSchema,
    shell: managerShellInfoSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('ack'),
    clientMsgId: id,
    ok: z.boolean(),
    reason: z.string().optional(),
  }),
  z.strictObject({ type: z.literal('cue'), serverNow: timestamp, cue: publicCueSchema }),
  z.strictObject({ type: z.literal('pong'), t: z.number().finite(), serverNow: timestamp }),
  z.strictObject({ type: z.literal('recovery'), serverNow: timestamp, resumesAt: timestamp }),
  z.strictObject({
    type: z.literal('closed'),
    reason: z.enum(['kicked', 'superseded', 'sessionEnded', 'roomExpired']),
  }),
]) satisfies z.ZodType<ServerMessage>;

export * from './business.js';
export * from './admin.js';

export const customUploadResponseSchema = z.strictObject({
  uploadId: id,
  mediaType: z.enum(['image', 'gif']),
  previewUrl: z.string().min(1),
});
export const youtubeRequestSchema = z.strictObject({ url: z.string().min(1).max(2048) });
export const youtubeResponseSchema = z.strictObject({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  durationMs: z.number().int().positive().nullable(),
});
export const mediaErrorRequestSchema = z.strictObject({ submissionId: id });
