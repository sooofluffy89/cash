CREATE TABLE `audit` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`request_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_id_unique` ON `audit` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_request_id_unique` ON `audit` (`request_id`);--> statement-breakpoint
CREATE TABLE `cash` (
	`id` integer PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`initialized` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`weekday` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`kind` text NOT NULL,
	`delta` integer NOT NULL,
	`expected` integer NOT NULL,
	`counted` integer,
	`difference` integer,
	`balance_after` integer NOT NULL,
	`expected_revision` integer NOT NULL,
	`reason` text NOT NULL,
	`note` text NOT NULL,
	`linked_id` text,
	`photo_id` text,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_id_unique` ON `entries` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_request_id_unique` ON `entries` (`request_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	`entry_id` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_key_unique` ON `media` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_entry_id_unique` ON `media` (`entry_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`subject` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_subject_unique` ON `users` (`subject`);