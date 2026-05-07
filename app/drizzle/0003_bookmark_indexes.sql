CREATE INDEX IF NOT EXISTS `bookmarks_archived_at_idx` ON `bookmarks` (`archived_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookmarks_bookmarked_at_idx` ON `bookmarks` (`bookmarked_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookmarks_like_count_idx` ON `bookmarks` (`like_count`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookmarks_author_handle_idx` ON `bookmarks` (`author_handle`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookmark_folders_folder_id_idx` ON `bookmark_folders` (`folder_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookmark_tags_tag_id_idx` ON `bookmark_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookmark_tags_source_idx` ON `bookmark_tags` (`source`);
