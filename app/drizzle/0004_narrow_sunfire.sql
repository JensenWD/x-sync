CREATE TABLE `agent_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idempotency_key` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`agent_id` text NOT NULL,
	`model` text,
	`prompt_version` text,
	`taxonomy_version` text,
	`library_revision` text,
	`input_json` text,
	`proposed_count` integer DEFAULT 0 NOT NULL,
	`applied_count` integer DEFAULT 0 NOT NULL,
	`rejected_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`heartbeat_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_idempotency_key_unique` ON `agent_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `agent_runs_status_idx` ON `agent_runs` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `bookmark_enrichments` (
	`bookmark_id` integer PRIMARY KEY NOT NULL,
	`content_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`summary` text,
	`topics_json` text,
	`entities_json` text,
	`link_text` text,
	`media_text` text,
	`embedding_model` text,
	`embedding_dimensions` integer,
	`embedding_json` text,
	`model` text,
	`prompt_version` text,
	`error_message` text,
	`processed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmark_enrichments_status_idx` ON `bookmark_enrichments` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `taxonomy_assignments` (
	`bookmark_id` integer NOT NULL,
	`kind` text NOT NULL,
	`target_id` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`agent_run_id` integer,
	`confidence` real,
	`rationale` text,
	`content_hash` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`bookmark_id`, `kind`, `target_id`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `taxonomy_assignments_source_idx` ON `taxonomy_assignments` (`source`,`kind`);--> statement-breakpoint
CREATE TABLE `taxonomy_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` integer,
	`agent_run_id` integer,
	`bookmark_id` integer NOT NULL,
	`kind` text NOT NULL,
	`target_id` integer NOT NULL,
	`operation` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`applied_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reverted_at` integer,
	FOREIGN KEY (`proposal_id`) REFERENCES `taxonomy_proposals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `taxonomy_events_bookmark_idx` ON `taxonomy_events` (`bookmark_id`,`applied_at`);--> statement-breakpoint
CREATE TABLE `taxonomy_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`bookmark_id` integer NOT NULL,
	`kind` text NOT NULL,
	`operation` text NOT NULL,
	`target_id` integer NOT NULL,
	`target_name` text NOT NULL,
	`confidence` real NOT NULL,
	`rationale` text,
	`content_hash` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`review_note` text,
	`reviewed_at` integer,
	`applied_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `taxonomy_proposals_idempotency_key_unique` ON `taxonomy_proposals` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `taxonomy_proposals_status_idx` ON `taxonomy_proposals` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `taxonomy_proposals_bookmark_idx` ON `taxonomy_proposals` (`bookmark_id`,`status`);--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `media_metadata` text;--> statement-breakpoint
ALTER TABLE `folders` ADD `description` text;--> statement-breakpoint
ALTER TABLE `folders` ADD `aliases` text;--> statement-breakpoint
CREATE UNIQUE INDEX `folders_name_ci_unique` ON `folders` (lower("name"));--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `baseline_remote_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `skipped_tweet_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `reconciliation_fingerprint` text;--> statement-breakpoint
ALTER TABLE `sync_state` ADD `reconciliation_candidate_fingerprint` text;--> statement-breakpoint
ALTER TABLE `sync_state` ADD `reconciliation_candidate_count` integer;--> statement-breakpoint
ALTER TABLE `sync_state` ADD `reconciliation_candidate_at` integer;--> statement-breakpoint
ALTER TABLE `tags` ADD `description` text;--> statement-breakpoint
ALTER TABLE `tags` ADD `aliases` text;--> statement-breakpoint
INSERT OR IGNORE INTO taxonomy_assignments
  (bookmark_id, kind, target_id, source, created_at, updated_at)
SELECT bookmark_id, 'folder', folder_id, 'manual', unixepoch(), unixepoch()
FROM bookmark_folders;--> statement-breakpoint
INSERT OR IGNORE INTO taxonomy_assignments
  (bookmark_id, kind, target_id, source, created_at, updated_at)
SELECT bookmark_id, 'tag', tag_id, 'manual', unixepoch(), unixepoch()
FROM bookmark_tags;--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
  full_text,
  author_name,
  author_handle,
  content='bookmarks',
  content_rowid='id',
  tokenize='porter unicode61'
);--> statement-breakpoint
DROP TRIGGER IF EXISTS bookmarks_ai;--> statement-breakpoint
DROP TRIGGER IF EXISTS bookmarks_ad;--> statement-breakpoint
DROP TRIGGER IF EXISTS bookmarks_au_before;--> statement-breakpoint
DROP TRIGGER IF EXISTS bookmarks_au_after;--> statement-breakpoint
CREATE TRIGGER bookmarks_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(rowid, full_text, author_name, author_handle)
  VALUES (new.id, new.full_text, new.author_name, new.author_handle);
END;--> statement-breakpoint
CREATE TRIGGER bookmarks_ad AFTER DELETE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, full_text, author_name, author_handle)
  VALUES ('delete', old.id, old.full_text, old.author_name, old.author_handle);
END;--> statement-breakpoint
CREATE TRIGGER bookmarks_au_before BEFORE UPDATE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, full_text, author_name, author_handle)
  VALUES ('delete', old.id, old.full_text, old.author_name, old.author_handle);
END;--> statement-breakpoint
CREATE TRIGGER bookmarks_au_after AFTER UPDATE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(rowid, full_text, author_name, author_handle)
  VALUES (new.id, new.full_text, new.author_name, new.author_handle);
END;--> statement-breakpoint
INSERT INTO bookmarks_fts(bookmarks_fts) VALUES ('rebuild');--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS bookmark_enrichments_fts USING fts5(
  summary,
  topics_json,
  entities_json,
  link_text,
  media_text,
  content='bookmark_enrichments',
  content_rowid='bookmark_id',
  tokenize='porter unicode61'
);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS bookmark_enrichments_ai AFTER INSERT ON bookmark_enrichments BEGIN
  INSERT INTO bookmark_enrichments_fts(
    rowid, summary, topics_json, entities_json, link_text, media_text
  ) VALUES (
    new.bookmark_id, new.summary, new.topics_json, new.entities_json, new.link_text, new.media_text
  );
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS bookmark_enrichments_ad AFTER DELETE ON bookmark_enrichments BEGIN
  INSERT INTO bookmark_enrichments_fts(
    bookmark_enrichments_fts, rowid, summary, topics_json, entities_json, link_text, media_text
  ) VALUES (
    'delete', old.bookmark_id, old.summary, old.topics_json, old.entities_json, old.link_text, old.media_text
  );
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS bookmark_enrichments_au BEFORE UPDATE ON bookmark_enrichments BEGIN
  INSERT INTO bookmark_enrichments_fts(
    bookmark_enrichments_fts, rowid, summary, topics_json, entities_json, link_text, media_text
  ) VALUES (
    'delete', old.bookmark_id, old.summary, old.topics_json, old.entities_json, old.link_text, old.media_text
  );
  INSERT INTO bookmark_enrichments_fts(
    rowid, summary, topics_json, entities_json, link_text, media_text
  ) VALUES (
    new.bookmark_id, new.summary, new.topics_json, new.entities_json, new.link_text, new.media_text
  );
END;--> statement-breakpoint
INSERT INTO bookmark_enrichments_fts(bookmark_enrichments_fts) VALUES ('rebuild');
