CREATE TABLE `sync_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`input_json` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`owner` text,
	`sync_run_id` integer,
	`progress_done` integer DEFAULT 0 NOT NULL,
	`progress_total` integer DEFAULT 0 NOT NULL,
	`result_json` text,
	`error_code` text,
	`error_message` text,
	`error_details_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_jobs_request_id_unique` ON `sync_jobs` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_jobs_one_active` ON `sync_jobs` ((1)) WHERE "sync_jobs"."status" IN ('queued', 'running');