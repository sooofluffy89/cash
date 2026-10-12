CREATE TABLE `count_closures` (
	`count_id` text PRIMARY KEY NOT NULL,
	`closing_count_id` text NOT NULL,
	`resolution_id` text,
	`closed_by` text NOT NULL,
	`closed_name` text NOT NULL,
	`closed_role` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`count_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closing_count_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolution_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `audit` ADD `actor_role` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `actor_role` text;