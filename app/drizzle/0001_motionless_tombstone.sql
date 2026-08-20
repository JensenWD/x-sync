CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requested_mode` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`heartbeat_at` integer NOT NULL,
	`finished_at` integer,
	`pages_fetched` integer DEFAULT 0 NOT NULL,
	`bookmarks_fetched` integer DEFAULT 0 NOT NULL,
	`bookmarks_inserted` integer DEFAULT 0 NOT NULL,
	`bookmarks_existing` integer DEFAULT 0 NOT NULL,
	`remote_removed` integer DEFAULT 0 NOT NULL,
	`stop_reason` text,
	`error_code` text,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `sync_runs_status_heartbeat_idx` ON `sync_runs` (`status`,`heartbeat_at`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_successful_run_id` integer,
	`last_synced_at` integer,
	`last_full_synced_at` integer,
	`last_error` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `remote_present` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `removed_from_x_at` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `hidden_at` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `remote_order_run_id` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `remote_order_position` integer;--> statement-breakpoint
CREATE INDEX `bookmarks_visibility_idx` ON `bookmarks` (`remote_present`,`hidden_at`);--> statement-breakpoint
CREATE INDEX `bookmarks_remote_order_idx` ON `bookmarks` (`remote_order_run_id`,`remote_order_position`);