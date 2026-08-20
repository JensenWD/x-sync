CREATE TABLE `library_revision_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
INSERT INTO library_revision_state (id, revision, updated_at)
VALUES (1, 1, unixepoch());--> statement-breakpoint
DROP TRIGGER IF EXISTS bookmarks_au_before;--> statement-breakpoint
DROP TRIGGER IF EXISTS bookmarks_au_after;--> statement-breakpoint
DROP TRIGGER IF EXISTS bookmarks_au;--> statement-breakpoint
CREATE TRIGGER bookmarks_au AFTER UPDATE OF full_text, author_name, author_handle ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, full_text, author_name, author_handle)
  VALUES ('delete', old.id, old.full_text, old.author_name, old.author_handle);
  INSERT INTO bookmarks_fts(rowid, full_text, author_name, author_handle)
  VALUES (new.id, new.full_text, new.author_name, new.author_handle);
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS bookmark_enrichments_ai;--> statement-breakpoint
DROP TRIGGER IF EXISTS bookmark_enrichments_ad;--> statement-breakpoint
DROP TRIGGER IF EXISTS bookmark_enrichments_au;--> statement-breakpoint
CREATE TRIGGER bookmark_enrichments_ai AFTER INSERT ON bookmark_enrichments BEGIN
  INSERT INTO bookmark_enrichments_fts(
    rowid, summary, topics_json, entities_json, link_text, media_text
  ) VALUES (
    new.bookmark_id, new.summary, new.topics_json, new.entities_json, new.link_text, new.media_text
  );
END;--> statement-breakpoint
CREATE TRIGGER bookmark_enrichments_ad AFTER DELETE ON bookmark_enrichments BEGIN
  INSERT INTO bookmark_enrichments_fts(
    bookmark_enrichments_fts, rowid, summary, topics_json, entities_json, link_text, media_text
  ) VALUES (
    'delete', old.bookmark_id, old.summary, old.topics_json, old.entities_json, old.link_text, old.media_text
  );
END;--> statement-breakpoint
CREATE TRIGGER bookmark_enrichments_au AFTER UPDATE OF summary, topics_json, entities_json, link_text, media_text ON bookmark_enrichments BEGIN
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
INSERT INTO bookmark_enrichments_fts(bookmark_enrichments_fts) VALUES ('rebuild');--> statement-breakpoint
CREATE TRIGGER library_revision_bookmarks_ai AFTER INSERT ON bookmarks BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmarks_ad AFTER DELETE ON bookmarks BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmarks_au AFTER UPDATE ON bookmarks BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_folders_ai AFTER INSERT ON folders BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_folders_ad AFTER DELETE ON folders BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_folders_au AFTER UPDATE ON folders BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_tags_ai AFTER INSERT ON tags BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_tags_ad AFTER DELETE ON tags BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_tags_au AFTER UPDATE ON tags BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmark_folders_ai AFTER INSERT ON bookmark_folders BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmark_folders_ad AFTER DELETE ON bookmark_folders BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmark_folders_au AFTER UPDATE ON bookmark_folders BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmark_tags_ai AFTER INSERT ON bookmark_tags BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmark_tags_ad AFTER DELETE ON bookmark_tags BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmark_tags_au AFTER UPDATE ON bookmark_tags BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_taxonomy_assignments_ai AFTER INSERT ON taxonomy_assignments BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_taxonomy_assignments_ad AFTER DELETE ON taxonomy_assignments BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_taxonomy_assignments_au AFTER UPDATE ON taxonomy_assignments BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmark_enrichments_ai AFTER INSERT ON bookmark_enrichments BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmark_enrichments_ad AFTER DELETE ON bookmark_enrichments BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER library_revision_bookmark_enrichments_au AFTER UPDATE ON bookmark_enrichments BEGIN
  UPDATE library_revision_state SET revision = revision + 1, updated_at = unixepoch() WHERE id = 1;
END;
