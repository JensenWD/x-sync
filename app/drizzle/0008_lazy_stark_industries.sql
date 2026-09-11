CREATE TABLE `community_notes` (
	`note_id` text PRIMARY KEY NOT NULL,
	`tweet_id` text NOT NULL,
	`summary` text NOT NULL,
	`classification` text,
	`trustworthy_sources` integer,
	`is_media_note` integer DEFAULT false NOT NULL,
	`is_collaborative_note` integer DEFAULT false NOT NULL,
	`current_status` text DEFAULT 'NEEDS_MORE_RATINGS' NOT NULL,
	`note_created_at` integer,
	`status_updated_at` integer,
	`source_snapshot_date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `community_notes_tweet_status_idx` ON `community_notes` (`tweet_id`,`current_status`);--> statement-breakpoint
CREATE INDEX `community_notes_status_idx` ON `community_notes` (`current_status`);--> statement-breakpoint
CREATE TABLE `community_notes_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`snapshot_date` text,
	`last_checked_at` integer,
	`last_refreshed_at` integer,
	`tracked_hash` text,
	`notes_imported` integer DEFAULT 0 NOT NULL,
	`helpful_notes` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `replied_to_tweet` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `matched_media_notes` text;--> statement-breakpoint
CREATE TRIGGER library_revision_community_notes_ai AFTER INSERT ON community_notes BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_community_notes_ad AFTER DELETE ON community_notes BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_community_notes_au AFTER UPDATE ON community_notes BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;
