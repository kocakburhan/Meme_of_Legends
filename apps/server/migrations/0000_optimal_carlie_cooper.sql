CREATE TABLE `admin_account` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "single_admin" CHECK("admin_account"."id" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_account_username_unique` ON `admin_account` (`username`);--> statement-breakpoint
CREATE TABLE `admin_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `auth_owner` ON `auth_sessions` (`role`,`owner_id`);--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`unlimited_credits` integer DEFAULT false NOT NULL,
	`concurrent_session_limit` integer DEFAULT 1 NOT NULL,
	`lobby_lifetime_hours` integer DEFAULT 24 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "nonnegative_credits" CHECK("businesses"."credits" >= 0),
	CONSTRAINT "positive_session_limit" CHECK("businesses"."concurrent_session_limit" >= 1),
	CONSTRAINT "positive_lobby_lifetime" CHECK("businesses"."lobby_lifetime_hours" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `businesses_username_unique` ON `businesses` (`username`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `game_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `error_log` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`source` text NOT NULL,
	`session_id` text,
	`code` text NOT NULL,
	`details` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `game_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `game_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`room_code` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`mode` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`end_reason` text,
	`credit_consumed` integer DEFAULT false NOT NULL,
	`credit_refunded` integer DEFAULT false NOT NULL,
	`admin_intervention` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_business_status` ON `game_sessions` (`business_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `active_room_code` ON `game_sessions` (`room_code`) WHERE "game_sessions"."status" IN ('lobby','running','paused');--> statement-breakpoint
CREATE TABLE `media_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`meme_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`meme_id`) REFERENCES `memes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memes` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	`description` text NOT NULL,
	`media_type` text NOT NULL,
	`r2_key` text NOT NULL,
	`cover_key` text,
	`duration_ms` integer,
	`source_url` text,
	`status` text DEFAULT 'untagged' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`business_id` text,
	`text` text NOT NULL,
	`normalized_text` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`admin_blocked` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prompt_owner" CHECK(("prompts"."owner_type" = 'platform' AND "prompts"."business_id" IS NULL) OR ("prompts"."owner_type" = 'business' AND "prompts"."business_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_prompt_unique` ON `prompts` (`business_id`,`normalized_text`);--> statement-breakpoint
CREATE TABLE `session_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `game_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	`anonymized_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `game_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_reports_session_id_unique` ON `session_reports` (`session_id`);