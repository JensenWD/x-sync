ALTER TABLE `bookmarks` ADD `links` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `conversation_id` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `like_count` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `reply_count` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `retweet_count` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `quote_count` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `bookmark_count` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `impression_count` integer;--> statement-breakpoint
CREATE INDEX `bookmarks_like_count_idx` ON `bookmarks` (`like_count`);