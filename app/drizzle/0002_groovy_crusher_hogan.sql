CREATE TABLE `sync_run_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`page_index` integer NOT NULL,
	`request_cursor_key` text NOT NULL,
	`request_cursor` text,
	`next_cursor` text,
	`raw_bookmark_count` integer NOT NULL,
	`unique_bookmark_count` integer NOT NULL,
	`known_page` integer DEFAULT false NOT NULL,
	`empty_page` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `sync_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_run_pages_cursor_idx` ON `sync_run_pages` (`run_id`,`request_cursor_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_run_pages_order_idx` ON `sync_run_pages` (`run_id`,`page_index`);--> statement-breakpoint
CREATE TABLE `sync_run_seen_tweets` (
	`run_id` integer NOT NULL,
	`tweet_id` text NOT NULL,
	`remote_position` integer NOT NULL,
	PRIMARY KEY(`run_id`, `tweet_id`),
	FOREIGN KEY (`run_id`) REFERENCES `sync_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_run_seen_position_idx` ON `sync_run_seen_tweets` (`run_id`,`remote_position`);--> statement-breakpoint
DROP TABLE `x_credentials`;