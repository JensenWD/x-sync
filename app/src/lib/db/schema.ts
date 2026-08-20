import {
  sqliteTable,
  text,
  integer,
  real,
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
    mediaMetadata: text('media_metadata'), // JSON array with type/key/url metadata
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

export const folders = sqliteTable(
  'folders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    color: text('color'),
    description: text('description'),
    aliases: text('aliases'), // JSON array
    ...timestamps,
  },
  (t) => [uniqueIndex('folders_name_ci_unique').on(sql`lower(${t.name})`)],
);

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
  description: text('description'),
  aliases: text('aliases'), // JSON array
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
    baselineRemoteCount: integer('baseline_remote_count').notNull().default(0),
    skippedTweetCount: integer('skipped_tweet_count').notNull().default(0),
    reconciliationFingerprint: text('reconciliation_fingerprint'),
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
  reconciliationCandidateFingerprint: text('reconciliation_candidate_fingerprint'),
  reconciliationCandidateCount: integer('reconciliation_candidate_count'),
  reconciliationCandidateAt: integer('reconciliation_candidate_at'),
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

export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('running'),
    agentId: text('agent_id').notNull(),
    model: text('model'),
    promptVersion: text('prompt_version'),
    taxonomyVersion: text('taxonomy_version'),
    libraryRevision: text('library_revision'),
    inputJson: text('input_json'),
    proposedCount: integer('proposed_count').notNull().default(0),
    appliedCount: integer('applied_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    errorMessage: text('error_message'),
    startedAt: integer('started_at').notNull().default(sql`(unixepoch())`),
    heartbeatAt: integer('heartbeat_at').notNull().default(sql`(unixepoch())`),
    finishedAt: integer('finished_at'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [index('agent_runs_status_idx').on(t.status, t.updatedAt)],
);

export const taxonomyProposals = sqliteTable(
  'taxonomy_proposals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    operation: text('operation').notNull(),
    targetId: integer('target_id').notNull(),
    targetName: text('target_name').notNull(),
    confidence: real('confidence').notNull(),
    rationale: text('rationale'),
    contentHash: text('content_hash').notNull(),
    status: text('status').notNull().default('proposed'),
    reviewNote: text('review_note'),
    reviewedAt: integer('reviewed_at'),
    appliedAt: integer('applied_at'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    index('taxonomy_proposals_status_idx').on(t.status, t.createdAt),
    index('taxonomy_proposals_bookmark_idx').on(t.bookmarkId, t.status),
  ],
);

export const taxonomyAssignments = sqliteTable(
  'taxonomy_assignments',
  {
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    targetId: integer('target_id').notNull(),
    source: text('source').notNull().default('manual'),
    agentRunId: integer('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    confidence: real('confidence'),
    rationale: text('rationale'),
    contentHash: text('content_hash'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.bookmarkId, t.kind, t.targetId] }),
    index('taxonomy_assignments_source_idx').on(t.source, t.kind),
  ],
);

export const taxonomyEvents = sqliteTable(
  'taxonomy_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    proposalId: integer('proposal_id').references(() => taxonomyProposals.id, {
      onDelete: 'set null',
    }),
    agentRunId: integer('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    targetId: integer('target_id').notNull(),
    operation: text('operation').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    appliedAt: integer('applied_at').notNull().default(sql`(unixepoch())`),
    revertedAt: integer('reverted_at'),
  },
  (t) => [index('taxonomy_events_bookmark_idx').on(t.bookmarkId, t.appliedAt)],
);

export const bookmarkEnrichments = sqliteTable(
  'bookmark_enrichments',
  {
    bookmarkId: integer('bookmark_id')
      .primaryKey()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    agentRunId: integer('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    contentHash: text('content_hash').notNull(),
    status: text('status').notNull().default('pending'),
    summary: text('summary'),
    topicsJson: text('topics_json'),
    entitiesJson: text('entities_json'),
    linkText: text('link_text'),
    mediaText: text('media_text'),
    embeddingModel: text('embedding_model'),
    embeddingDimensions: integer('embedding_dimensions'),
    embeddingJson: text('embedding_json'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    errorMessage: text('error_message'),
    processedAt: integer('processed_at'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [index('bookmark_enrichments_status_idx').on(t.status, t.updatedAt)],
);
