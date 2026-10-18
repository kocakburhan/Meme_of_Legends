import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';
import type { SessionConfig } from '@mol/engine';
const id = () => text('id').primaryKey();
const createdAt = () => integer('created_at').notNull();
export const adminAccount = sqliteTable(
  'admin_account',
  {
    id: integer('id').primaryKey(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: createdAt(),
  },
  (t) => [check('single_admin', sql`${t.id} = 1`)],
);
export const businesses = sqliteTable(
  'businesses',
  {
    id: id(),
    name: text('name').notNull(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    credits: integer('credits').notNull().default(0),
    unlimitedCredits: integer('unlimited_credits', { mode: 'boolean' }).notNull().default(false),
    concurrentSessionLimit: integer('concurrent_session_limit').notNull().default(1),
    lobbyLifetimeHours: integer('lobby_lifetime_hours').notNull().default(24),
    createdAt: createdAt(),
  },
  (t) => [
    check('nonnegative_credits', sql`${t.credits} >= 0`),
    check('positive_session_limit', sql`${t.concurrentSessionLimit} >= 1`),
    check('positive_lobby_lifetime', sql`${t.lobbyLifetimeHours} >= 1`),
  ],
);
export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: id(),
    role: text('role', { enum: ['admin', 'business'] }).notNull(),
    ownerId: text('owner_id').notNull(),
    createdAt: createdAt(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('auth_owner').on(t.role, t.ownerId)],
);
export const gameSessions = sqliteTable(
  'game_sessions',
  {
    id: id(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    roomCode: text('room_code').notNull(),
    status: text('status', {
      enum: ['lobby', 'running', 'paused', 'finished', 'cancelled', 'terminated'],
    })
      .notNull()
      .default('lobby'),
    mode: text('mode', { enum: ['elimination', 'league', 'hybrid'] }).notNull(),
    settings: text('settings', { mode: 'json' }).$type<SessionConfig>().notNull(),
    createdAt: createdAt(),
    expiresAt: integer('expires_at').notNull(),
    startedAt: integer('started_at'),
    endedAt: integer('ended_at'),
    endReason: text('end_reason'),
    creditConsumed: integer('credit_consumed', { mode: 'boolean' }).notNull().default(false),
    creditRefunded: integer('credit_refunded', { mode: 'boolean' }).notNull().default(false),
    adminIntervention: integer('admin_intervention', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('sessions_business_status').on(t.businessId, t.status),
    uniqueIndex('active_room_code')
      .on(t.roomCode)
      .where(sql`${t.status} IN ('lobby','running','paused')`),
  ],
);
export const sessionReports = sqliteTable('session_reports', {
  id: id(),
  sessionId: text('session_id')
    .notNull()
    .unique()
    .references(() => gameSessions.id),
  summary: text('summary', { mode: 'json' }).notNull(),
  createdAt: createdAt(),
  anonymizedAt: integer('anonymized_at'),
});
export const sessionAudit = sqliteTable('session_audit', {
  id: id(),
  sessionId: text('session_id')
    .notNull()
    .references(() => gameSessions.id),
  occurredAt: integer('occurred_at').notNull(),
  type: text('type').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
});
export const categories = sqliteTable('categories', {
  id: id(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
});
export const memes = sqliteTable('memes', {
  id: id(),
  categoryId: text('category_id').references(() => categories.id),
  description: text('description').notNull(),
  mediaType: text('media_type', { enum: ['image', 'gif', 'video'] }).notNull(),
  r2Key: text('r2_key').notNull(),
  coverKey: text('cover_key'),
  durationMs: integer('duration_ms'),
  sourceUrl: text('source_url'),
  status: text('status', { enum: ['untagged', 'active', 'archived'] })
    .notNull()
    .default('untagged'),
  createdAt: createdAt(),
});
export const mediaJobs = sqliteTable('media_jobs', {
  id: id(),
  type: text('type', { enum: ['link', 'bulk'] }).notNull(),
  input: text('input', { mode: 'json' }).notNull(),
  status: text('status').notNull(),
  error: text('error'),
  memeId: text('meme_id').references(() => memes.id),
  createdAt: createdAt(),
});
export const prompts = sqliteTable(
  'prompts',
  {
    id: id(),
    ownerType: text('owner_type', { enum: ['platform', 'business'] }).notNull(),
    businessId: text('business_id').references(() => businesses.id),
    text: text('text').notNull(),
    normalizedText: text('normalized_text').notNull(),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    adminBlocked: integer('admin_blocked', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('business_prompt_unique').on(t.businessId, t.normalizedText),
    check(
      'prompt_owner',
      sql`(${t.ownerType} = 'platform' AND ${t.businessId} IS NULL) OR (${t.ownerType} = 'business' AND ${t.businessId} IS NOT NULL)`,
    ),
  ],
);
export const customUploads = sqliteTable('custom_uploads', {
  id: id(),
  sessionId: text('session_id')
    .notNull()
    .references(() => gameSessions.id),
  r2Key: text('r2_key').notNull(),
  createdAt: createdAt(),
  deletedAt: integer('deleted_at'),
});
export const adminActions = sqliteTable('admin_actions', {
  id: id(),
  occurredAt: integer('occurred_at').notNull(),
  action: text('action').notNull(),
  targetId: text('target_id').notNull(),
  details: text('details', { mode: 'json' }).notNull(),
});
export const errorLog = sqliteTable('error_log', {
  id: id(),
  occurredAt: integer('occurred_at').notNull(),
  source: text('source').notNull(),
  sessionId: text('session_id').references(() => gameSessions.id),
  code: text('code').notNull(),
  details: text('details', { mode: 'json' }).notNull(),
});
