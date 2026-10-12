CREATE TABLE `write_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`access_ok` integer DEFAULT 1 NOT NULL,
	`revision_ok` integer DEFAULT 1 NOT NULL,
	`balance_ok` integer DEFAULT 1 NOT NULL,
	`init_ok` integer DEFAULT 1 NOT NULL,
	`link_ok` integer DEFAULT 1 NOT NULL,
	`photo_ok` integer DEFAULT 1 NOT NULL,
	`last_admin_ok` integer DEFAULT 1 NOT NULL,
	`correction_ok` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "cash_denied" CHECK("write_guards"."access_ok"=1),
	CONSTRAINT "cash_stale" CHECK("write_guards"."revision_ok"=1),
	CONSTRAINT "cash_overdraft" CHECK("write_guards"."balance_ok"=1),
	CONSTRAINT "cash_uninitialized" CHECK("write_guards"."init_ok"=1),
	CONSTRAINT "cash_linked" CHECK("write_guards"."link_ok"=1),
	CONSTRAINT "cash_photo" CHECK("write_guards"."photo_ok"=1),
	CONSTRAINT "cash_lastAdmin" CHECK("write_guards"."last_admin_ok"=1),
	CONSTRAINT "cash_correctionSinceCount" CHECK("write_guards"."correction_ok"=1)
);
