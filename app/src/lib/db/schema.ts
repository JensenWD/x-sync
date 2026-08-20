import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
};

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tweetId: text('tweet_id').notNull().unique(),
    fullText: text('full_text').notNull().default(''),
    authorName: text('author_name').notNull().default(''),
    authorHandle: text('author_handle').notNull().default(''),
    authorAvatar: text('author_avatar'),
    tweetUrl: text('tweet_url').notNull().default(''),
    mediaUrls: text('media_urls'), // JSON array
    quotedTweet: text('quoted_tweet'), // JSON object
    bookmarkedAt: integer('bookmarked_at'), // Tweet publication time; X does not expose save time
    syncedAt: integer('synced_at'), // Last time this bookmark was observed on X
    remotePresent: integer('remote_present', { mode: 'boolean' }).notNull().default(true),
    removedFromXAt: integer('removed_from_x_at'),
    hiddenAt: integer('hidden_at'), // Local-only removal tombstone; sync never clears it
    remoteOrderRunId: integer('remote_order_run_id'),
    remoteOrderPosition: integer('remote_order_position'),
    ...timestamps,
  },
  (t) => [
    index('bookmarks_visibility_idx').on(t.remotePresent, t.hiddenAt),
    index('bookmarks_remote_order_idx').on(t.remoteOrderRunId, t.remoteOrderPosition),
  ],
);

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

export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    requestedMode: text('requested_mode').notNull(),
    mode: text('mode').notNull(),
    status: text('status').notNull(),
    startedAt: integer('started_at').notNull(),
    heartbeatAt: integer('heartbeat_at').notNull(),
    finishedAt: integer('finished_at'),
    pagesFetched: integer('pages_fetched').notNull().default(0),
    bookmarksFetched: integer('bookmarks_fetched').notNull().default(0),
    bookmarksInserted: integer('bookmarks_inserted').notNull().default(0),
    bookmarksExisting: integer('bookmarks_existing').notNull().default(0),
    remoteRemoved: integer('remote_removed').notNull().default(0),
    stopReason: text('stop_reason'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
  },
  (t) => [index('sync_runs_status_heartbeat_idx').on(t.status, t.heartbeatAt)],
);

// Scratch state for an in-progress browser-assisted sync. Keeping this in SQLite
// makes page uploads idempotent and prevents a Next.js process restart from
// silently losing the set used for full reconciliation.
export const syncRunSeenTweets = sqliteTable(
  'sync_run_seen_tweets',
  {
    runId: integer('run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'cascade' }),
    tweetId: text('tweet_id').notNull(),
    remotePosition: integer('remote_position').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.tweetId] }),
    uniqueIndex('sync_run_seen_position_idx').on(t.runId, t.remotePosition),
  ],
);

export const syncRunPages = sqliteTable(
  'sync_run_pages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'cascade' }),
    pageIndex: integer('page_index').notNull(),
    requestCursorKey: text('request_cursor_key').notNull(),
    requestCursor: text('request_cursor'),
    nextCursor: text('next_cursor'),
    rawBookmarkCount: integer('raw_bookmark_count').notNull(),
    uniqueBookmarkCount: integer('unique_bookmark_count').notNull(),
    knownPage: integer('known_page', { mode: 'boolean' }).notNull().default(false),
    emptyPage: integer('empty_page', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('sync_run_pages_cursor_idx').on(t.runId, t.requestCursorKey),
    uniqueIndex('sync_run_pages_order_idx').on(t.runId, t.pageIndex),
  ],
);

export const syncState = sqliteTable('sync_state', {
  id: integer('id').primaryKey(),
  lastSuccessfulRunId: integer('last_successful_run_id'),
  lastSyncedAt: integer('last_synced_at'),
  lastFullSyncedAt: integer('last_full_synced_at'),
  lastError: text('last_error'),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
});

export const xOAuthCredentials = sqliteTable('x_oauth_credentials', {
  id: integer('id').primaryKey(),
  userId: text('user_id').notNull(),
  username: text('username').notNull(),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
  tokenType: text('token_type').notNull().default('bearer'),
  scope: text('scope').notNull(),
  accessTokenExpiresAt: integer('access_token_expires_at').notNull(),
  connectedAt: integer('connected_at').notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
});
