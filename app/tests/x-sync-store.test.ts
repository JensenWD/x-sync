import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  BookmarkSyncStore,
  resolveSyncMode,
  shouldStopIncremental,
  SyncAlreadyRunningError,
  SyncCursorMismatchError,
  SyncReconciliationBlockedError,
} from '../src/lib/x-sync/store';
import type { ParsedTimelinePage, XBookmarkRecord } from '../src/lib/x-sync/types';

function createDatabase() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tweet_id TEXT NOT NULL UNIQUE,
      full_text TEXT NOT NULL DEFAULT '',
      author_name TEXT NOT NULL DEFAULT '',
      author_handle TEXT NOT NULL DEFAULT '',
      author_avatar TEXT,
      tweet_url TEXT NOT NULL DEFAULT '',
      media_urls TEXT,
      media_metadata TEXT,
      quoted_tweet TEXT,
      bookmarked_at INTEGER,
      synced_at INTEGER,
      remote_present INTEGER NOT NULL DEFAULT 1,
      removed_from_x_at INTEGER,
      hidden_at INTEGER,
      remote_order_run_id INTEGER,
      remote_order_position INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requested_mode TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      heartbeat_at INTEGER NOT NULL,
      finished_at INTEGER,
      pages_fetched INTEGER NOT NULL DEFAULT 0,
      bookmarks_fetched INTEGER NOT NULL DEFAULT 0,
      bookmarks_inserted INTEGER NOT NULL DEFAULT 0,
      bookmarks_existing INTEGER NOT NULL DEFAULT 0,
      remote_removed INTEGER NOT NULL DEFAULT 0,
      baseline_remote_count INTEGER NOT NULL DEFAULT 0,
      skipped_tweet_count INTEGER NOT NULL DEFAULT 0,
      reconciliation_fingerprint TEXT,
      stop_reason TEXT,
      error_code TEXT,
      error_message TEXT
    );
    CREATE TABLE sync_state (
      id INTEGER PRIMARY KEY,
      last_successful_run_id INTEGER,
      last_synced_at INTEGER,
      last_full_synced_at INTEGER,
      last_error TEXT,
      reconciliation_candidate_fingerprint TEXT,
      reconciliation_candidate_count INTEGER,
      reconciliation_candidate_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE sync_run_seen_tweets (
      run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
      tweet_id TEXT NOT NULL,
      remote_position INTEGER NOT NULL,
      PRIMARY KEY (run_id, tweet_id),
      UNIQUE (run_id, remote_position)
    );
    CREATE TABLE sync_run_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
      page_index INTEGER NOT NULL,
      request_cursor_key TEXT NOT NULL,
      request_cursor TEXT,
      next_cursor TEXT,
      raw_bookmark_count INTEGER NOT NULL,
      unique_bookmark_count INTEGER NOT NULL,
      known_page INTEGER NOT NULL DEFAULT 0,
      empty_page INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (run_id, request_cursor_key),
      UNIQUE (run_id, page_index)
    );
  `);
  return sqlite;
}

function bookmark(tweetId: string): XBookmarkRecord {
  return {
    tweetId,
    fullText: `Tweet ${tweetId}`,
    authorName: 'Author',
    authorHandle: 'author',
    authorAvatar: null,
    tweetUrl: `https://x.com/author/status/${tweetId}`,
    mediaUrls: null,
    mediaMetadata: null,
    quotedTweet: null,
    tweetCreatedAt: 100,
  };
}

function page(bookmarks: XBookmarkRecord[], nextCursor: string | null): ParsedTimelinePage {
  return {
    bookmarks,
    nextCursor,
    timelineFound: true,
    timelineEntryCount: bookmarks.length,
    skippedTweetCount: 0,
  };
}

test('auto mode chooses full initially, incremental while fresh, and full when stale', () => {
  assert.equal(resolveSyncMode('auto', 0, null, 1_000), 'full');
  assert.equal(resolveSyncMode('auto', 10, 900, 1_000), 'incremental');
  assert.equal(resolveSyncMode('auto', 10, 1, 700_000), 'full');
  assert.equal(resolveSyncMode('full', 10, 900, 1_000), 'full');
});

test('incremental sync stops only after two known pages', () => {
  assert.equal(shouldStopIncremental(1), false);
  assert.equal(shouldStopIncremental(2), true);
});

test('a durable running row prevents concurrent syncs', () => {
  const sqlite = createDatabase();
  const store = new BookmarkSyncStore(sqlite);
  const run = store.startRun('auto', 1_000);
  assert.equal(run.status, 'running');
  assert.throws(() => store.startRun('auto', 1_001), SyncAlreadyRunningError);
  sqlite.close();
});

test('full reconciliation archives unseen bookmarks without deleting rows', () => {
  const sqlite = createDatabase();
  sqlite.prepare(`INSERT INTO bookmarks (tweet_id) VALUES ('old-1'), ('old-2')`).run();
  const store = new BookmarkSyncStore(sqlite);
  const run = store.startRun('full', 1_000);
  store.recordBrowserPage(run.id, null, page([bookmark('old-1')], null), 1_001);
  const result = store.completeRun(run.id, 'end_of_timeline', 1_002);

  assert.equal(result.remote_removed, 1);
  assert.equal(result.total_bookmarks, 1);
  const rows = sqlite
    .prepare(`SELECT tweet_id, remote_present FROM bookmarks ORDER BY tweet_id`)
    .all() as { tweet_id: string; remote_present: number }[];
  assert.deepEqual(rows, [
    { tweet_id: 'old-1', remote_present: 1 },
    { tweet_id: 'old-2', remote_present: 0 },
  ]);
  sqlite.close();
});

test('incremental sync never archives bookmarks it did not scan', () => {
  const sqlite = createDatabase();
  sqlite.prepare(`INSERT INTO bookmarks (tweet_id) VALUES ('old-1'), ('old-2')`).run();
  sqlite
    .prepare(
      `INSERT INTO sync_state (id, last_full_synced_at, updated_at) VALUES (1, 900, 900)`,
    )
    .run();
  const store = new BookmarkSyncStore(sqlite);
  const run = store.startRun('incremental', 1_000);
  store.recordBrowserPage(run.id, null, page([bookmark('old-1')], 'next'), 1_001);
  const result = store.completeRun(run.id, 'known_boundary', 1_002);
  assert.equal(result.remote_removed, 0);
  assert.equal(result.total_bookmarks, 2);
  sqlite.close();
});

test('sync does not clear a local hide tombstone', () => {
  const sqlite = createDatabase();
  sqlite.prepare(`INSERT INTO bookmarks (tweet_id, hidden_at) VALUES ('hidden', 500)`).run();
  const store = new BookmarkSyncStore(sqlite);
  const run = store.startRun('full', 1_000);
  store.recordBrowserPage(run.id, null, page([bookmark('hidden')], null), 1_001);
  const result = store.completeRun(run.id, 'end_of_timeline', 1_002);
  const row = sqlite
    .prepare(`SELECT hidden_at, remote_present FROM bookmarks WHERE tweet_id = 'hidden'`)
    .get() as { hidden_at: number; remote_present: number };
  assert.equal(row.hidden_at, 500);
  assert.equal(row.remote_present, 1);
  assert.equal(result.total_bookmarks, 0);
  sqlite.close();
});

test('re-uploading the same browser page is idempotent', () => {
  const sqlite = createDatabase();
  const store = new BookmarkSyncStore(sqlite);
  const run = store.startRun('full', 1_000);
  const first = store.recordBrowserPage(
    run.id,
    null,
    page([bookmark('new-1')], 'cursor-2'),
    1_001,
  );
  const retried = store.recordBrowserPage(
    run.id,
    null,
    page([bookmark('new-1')], 'cursor-2'),
    1_002,
  );

  assert.equal(first.duplicateUpload, false);
  assert.equal(retried.duplicateUpload, true);
  assert.equal(retried.run.pages_fetched, 1);
  assert.equal(retried.run.bookmarks_inserted, 1);
  assert.equal(
    (sqlite.prepare(`SELECT COUNT(*) AS count FROM bookmarks`).get() as { count: number }).count,
    1,
  );
  sqlite.close();
});

test('browser pages must follow the cursor chain', () => {
  const sqlite = createDatabase();
  const store = new BookmarkSyncStore(sqlite);
  const run = store.startRun('full', 1_000);
  store.recordBrowserPage(run.id, null, page([bookmark('one')], 'expected'), 1_001);
  assert.throws(
    () => store.recordBrowserPage(run.id, 'wrong', page([bookmark('two')], null), 1_002),
    SyncCursorMismatchError,
  );
  sqlite.close();
});

test('seen rows survive store instances until a full run completes', () => {
  const sqlite = createDatabase();
  sqlite.prepare(`INSERT INTO bookmarks (tweet_id) VALUES ('keep'), ('archive')`).run();
  const firstStore = new BookmarkSyncStore(sqlite);
  const run = firstStore.startRun('full', 1_000);
  firstStore.recordBrowserPage(run.id, null, page([bookmark('keep')], null), 1_001);

  const restartedStore = new BookmarkSyncStore(sqlite);
  const result = restartedStore.completeRun(run.id, 'end_of_timeline', 1_002);
  assert.equal(result.remote_removed, 1);
  assert.equal(
    (
      sqlite
        .prepare(`SELECT COUNT(*) AS count FROM sync_run_seen_tweets WHERE run_id = ?`)
        .get(run.id) as { count: number }
    ).count,
    0,
  );
  sqlite.close();
});

test('a suspicious full-sync drop is quarantined and requires the same result twice', () => {
  const sqlite = createDatabase();
  const insert = sqlite.prepare('INSERT INTO bookmarks (tweet_id) VALUES (?)');
  for (let index = 0; index < 100; index += 1) insert.run(`old-${index}`);
  const observed = Array.from({ length: 10 }, (_, index) => bookmark(`old-${index}`));

  const firstStore = new BookmarkSyncStore(sqlite);
  const firstRun = firstStore.startRun('full', 1_000);
  firstStore.recordBrowserPage(firstRun.id, null, page(observed, null), 1_001);
  assert.throws(
    () => firstStore.completeRun(firstRun.id, 'end_of_timeline', 1_002),
    SyncReconciliationBlockedError,
  );
  assert.equal(firstStore.getRun(firstRun.id).status, 'quarantined');
  assert.equal(
    (sqlite.prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE remote_present = 1').get() as { count: number }).count,
    100,
  );

  const secondStore = new BookmarkSyncStore(sqlite);
  const secondRun = secondStore.startRun('full', 1_100);
  secondStore.recordBrowserPage(secondRun.id, null, page(observed, null), 1_101);
  const confirmed = secondStore.completeRun(secondRun.id, 'end_of_timeline', 1_102);
  assert.equal(confirmed.remote_removed, 90);
  assert.equal(confirmed.total_bookmarks, 10);
  sqlite.close();
});

test('failed sync pages do not rewrite the last successful remote ordering', () => {
  const sqlite = createDatabase();
  sqlite
    .prepare(
      `INSERT INTO bookmarks (tweet_id, remote_order_run_id, remote_order_position)
       VALUES ('old-1', 50, 0), ('old-2', 50, 1)`,
    )
    .run();
  const store = new BookmarkSyncStore(sqlite);
  const run = store.startRun('full', 1_000);
  store.recordBrowserPage(run.id, null, page([bookmark('old-2'), bookmark('new-1')], 'next'), 1_001);
  store.failRun(run.id, 'network_failed', 'network failed', 1_002);

  const rows = sqlite
    .prepare(
      `SELECT tweet_id, remote_order_run_id, remote_order_position
       FROM bookmarks ORDER BY tweet_id`,
    )
    .all() as { tweet_id: string; remote_order_run_id: number | null; remote_order_position: number | null }[];
  assert.deepEqual(rows, [
    { tweet_id: 'new-1', remote_order_run_id: null, remote_order_position: null },
    { tweet_id: 'old-1', remote_order_run_id: 50, remote_order_position: 0 },
    { tweet_id: 'old-2', remote_order_run_id: 50, remote_order_position: 1 },
  ]);
  sqlite.close();
});
