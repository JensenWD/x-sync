import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
};

export const xCredentials = sqliteTable('x_credentials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  authToken: text('auth_token').notNull(),
  ct0: text('ct0').notNull(),
  userId: text('user_id'),
  screenName: text('screen_name'),
  ...timestamps,
});

export const bookmarks = sqliteTable('bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tweetId: text('tweet_id').notNull().unique(),
  fullText: text('full_text').notNull().default(''),
  authorName: text('author_name').notNull().default(''),
  authorHandle: text('author_handle').notNull().default(''),
  authorAvatar: text('author_avatar'),
  tweetUrl: text('tweet_url').notNull().default(''),
  mediaUrls: text('media_urls'), // JSON array
  quotedTweet: text('quoted_tweet'), // JSON object
  bookmarkedAt: integer('bookmarked_at'), // Unix timestamp
  syncedAt: integer('synced_at'), // Unix timestamp
  ...timestamps,
});

export const folders = sqliteTable('folders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  color: text('color'),
  ...timestamps,
});

export const bookmarkFolders = sqliteTable(
  'bookmark_folders',
  {
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    folderId: integer('folder_id')
      .notNull()
      .references(() => folders.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.bookmarkId, t.folderId] })],
);

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const bookmarkTags = sqliteTable(
  'bookmark_tags',
  {
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.bookmarkId, t.tagId] })],
);
