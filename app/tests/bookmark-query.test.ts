import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  BookmarkQueryValidationError,
  bookmarkQueryFromSearchParams,
  getBookmarkQueryFacets,
  queryBookmarks,
} from '../src/lib/bookmark-query';

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
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE bookmark_folders (
      bookmark_id INTEGER NOT NULL,
      folder_id INTEGER NOT NULL,
      PRIMARY KEY (bookmark_id, folder_id)
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE bookmark_tags (
      bookmark_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (bookmark_id, tag_id)
    );
    CREATE TABLE sync_state (
      id INTEGER PRIMARY KEY,
      last_successful_run_id INTEGER
    );
    CREATE TABLE taxonomy_events (
      id INTEGER PRIMARY KEY,
      applied_at INTEGER
    );
    CREATE TABLE taxonomy_assignments (
      bookmark_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (bookmark_id, kind, target_id)
    );
    CREATE TABLE bookmark_enrichments (
      bookmark_id INTEGER PRIMARY KEY,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      topics_json TEXT,
      entities_json TEXT,
      link_text TEXT,
      media_text TEXT,
      embedding_model TEXT,
      embedding_dimensions INTEGER,
      embedding_json TEXT,
      model TEXT,
      prompt_version TEXT,
      processed_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
      full_text,
      author_name,
      author_handle,
      content='bookmarks',
      content_rowid='id',
      tokenize='porter unicode61'
    );
    CREATE VIRTUAL TABLE bookmark_enrichments_fts USING fts5(
      summary,
      topics_json,
      entities_json,
      link_text,
      media_text,
      content='bookmark_enrichments',
      content_rowid='bookmark_id',
      tokenize='porter unicode61'
    );

    INSERT INTO bookmarks (
      tweet_id, full_text, author_name, author_handle, author_avatar, tweet_url,
      media_urls, quoted_tweet, bookmarked_at, synced_at, remote_present,
      removed_from_x_at, hidden_at, remote_order_run_id, remote_order_position,
      created_at, updated_at
    ) VALUES
      ('100', 'AI agents can search a bookmark library', 'Alice Example', 'alice', NULL,
       'https://x.com/alice/status/100', '["https://img.test/100.jpg"]',
       '{"tweet_id":"99","full_text":"Quoted context"}', 2000, 3000, 1, NULL, NULL,
       10, 0, 2500, 3000),
      ('200', 'Family records and document organization', 'Bob Builder', 'bob', NULL,
       'https://x.com/bob/status/200', NULL, NULL, 1500, 3000, 1, NULL, NULL,
       10, 1, 2500, 3000),
      ('300', 'An old AI post removed upstream', 'Alice Example', 'alice', NULL,
       'https://x.com/alice/status/300', NULL, NULL, 1000, 2000, 0, 2100, NULL,
       8, 5, 1800, 2100),
      ('400', 'Secret agent notes', 'Carol', 'carol', NULL,
       'https://x.com/carol/status/400', NULL, NULL, 1200, 3000, 1, NULL, 2900,
       10, 2, 2500, 3000);

    INSERT INTO bookmarks_fts(rowid, full_text, author_name, author_handle)
      SELECT id, full_text, author_name, author_handle FROM bookmarks;

    INSERT INTO folders (id, name, color, created_at, updated_at) VALUES
      (1, 'Work', '#123456', 1, 1),
      (2, 'Personal', NULL, 1, 1);
    INSERT INTO bookmark_folders (bookmark_id, folder_id) VALUES (1, 1), (2, 2), (3, 1);

    INSERT INTO tags (id, name, created_at) VALUES
      (1, 'ai', 1),
      (2, 'coding', 1),
      (3, 'family', 1);
    INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES
      (1, 1), (1, 2), (2, 3), (3, 1);
    INSERT INTO sync_state (id, last_successful_run_id) VALUES (1, 10);
    INSERT INTO taxonomy_assignments (bookmark_id, kind, target_id, source) VALUES
      (1, 'tag', 1, 'manual'), (2, 'folder', 2, 'manual');
    INSERT INTO bookmark_enrichments (
      bookmark_id, content_hash, status, summary, topics_json, entities_json,
      link_text, media_text, model, prompt_version, processed_at, updated_at
    ) VALUES (
      2, 'hash', 'complete', 'Household knowledge management', '["knowledge"]',
      '[]', 'Document archive systems', NULL, 'test-model', 'v1', 3100, 3100
    );
    INSERT INTO bookmark_enrichments_fts(
      rowid, summary, topics_json, entities_json, link_text, media_text
    ) SELECT bookmark_id, summary, topics_json, entities_json, link_text, media_text
      FROM bookmark_enrichments;
  `);
  return sqlite;
}

test('full-text query returns structured metadata and excludes non-active rows by default', () => {
  const sqlite = createDatabase();
  const result = queryBookmarks(sqlite, { q: 'agent search' });

  assert.equal(result.meta.total, 1);
  assert.equal(result.data[0].tweet_id, '100');
  assert.equal(result.data[0].author.handle, 'alice');
  assert.equal(result.data[0].media_urls.length, 1);
  assert.deepEqual(result.data[0].folders.map((folder) => folder.name), ['Work']);
  assert.deepEqual(result.data[0].tags.map((tag) => tag.name), ['ai', 'coding']);
  assert.equal(result.data[0].sync.remote_present, true);
  assert.equal(result.data[0].trust.classification, 'untrusted_external_content');
  assert.equal(result.data[0].content_hash.length, 64);
  assert.equal(result.data[0].tweet_created_at_iso, '1970-01-01T00:33:20.000Z');
  sqlite.close();
});

test('enrichment search and agent work-queue filters are composable', () => {
  const sqlite = createDatabase();
  const enriched = queryBookmarks(sqlite, { q: 'knowledge management' });
  assert.deepEqual(enriched.data.map((bookmark) => bookmark.tweet_id), ['200']);
  assert.equal(enriched.data[0].enrichment?.model, 'test-model');
  assert.deepEqual(enriched.data[0].score_provenance.matched_sources, ['enrichment']);

  const queue = queryBookmarks(sqlite, {
    enrichment_status: ['missing'],
    untagged: true,
    unfoldered: true,
  });
  assert.deepEqual(queue.data.map((bookmark) => bookmark.tweet_id), []);
  sqlite.close();
});

test('folder, author, and all-tag filters compose with each other', () => {
  const sqlite = createDatabase();
  const result = queryBookmarks(sqlite, {
    authors: ['@ALICE'],
    folder_ids: [1],
    tags_all: ['AI', 'coding'],
  });

  assert.deepEqual(result.data.map((bookmark) => bookmark.tweet_id), ['100']);
  sqlite.close();
});

test('facets count active bookmarks rather than archived associations', () => {
  const sqlite = createDatabase();
  const facets = getBookmarkQueryFacets(sqlite);
  assert.equal(facets.folders.find((folder) => folder.name === 'Work')?.bookmark_count, 1);
  assert.equal(facets.tags.find((tag) => tag.name === 'ai')?.bookmark_count, 1);
  sqlite.close();
});

test('visibility, media, quote, date, exact IDs, and pagination are explicit', () => {
  const sqlite = createDatabase();
  const removed = queryBookmarks(sqlite, { status: 'removed', tags_any: ['ai'] });
  assert.deepEqual(removed.data.map((bookmark) => bookmark.tweet_id), ['300']);

  const mediaQuote = queryBookmarks(sqlite, {
    has_media: true,
    has_quote: true,
    tweet_created_after: 1900,
    tweet_ids: ['100', '200'],
  });
  assert.deepEqual(mediaQuote.data.map((bookmark) => bookmark.tweet_id), ['100']);

  const page = queryBookmarks(sqlite, { limit: 1, offset: 1, sort: 'tweet_newest' });
  assert.equal(page.meta.total, 2);
  assert.equal(page.meta.has_more, false);
  assert.equal(page.meta.next_offset, null);
  assert.deepEqual(page.data.map((bookmark) => bookmark.tweet_id), ['200']);
  sqlite.close();
});

test('GET parameters accept repeated and comma-separated filters', () => {
  const parsed = bookmarkQueryFromSearchParams(
    new URLSearchParams(
      'q=agent&author=alice,bob&folder=Work&tag=ai&tag=coding&tag_all=research&limit=10',
    ),
  );
  assert.deepEqual(parsed.authors, ['alice', 'bob']);
  assert.deepEqual(parsed.tags_any, ['ai', 'coding']);
  assert.deepEqual(parsed.tags_all, ['research']);
  assert.equal(parsed.limit, '10');
});

test('GET parameters reject unknown names instead of silently widening a query', () => {
  assert.throws(
    () => bookmarkQueryFromSearchParams(new URLSearchParams('folder_nam=Research')),
    (error: unknown) =>
      error instanceof BookmarkQueryValidationError && error.field === 'folder_nam',
  );
});

test('invalid filters fail closed with the offending field', () => {
  const sqlite = createDatabase();
  assert.throws(
    () => queryBookmarks(sqlite, { limit: 101 }),
    (error) => error instanceof BookmarkQueryValidationError && error.field === 'limit',
  );
  assert.throws(
    () => queryBookmarks(sqlite, { q: '!!!' }),
    (error) => error instanceof BookmarkQueryValidationError && error.field === 'q',
  );
  assert.throws(
    () => queryBookmarks(sqlite, { typo_filter: true } as never),
    (error) => error instanceof BookmarkQueryValidationError && error.field === 'typo_filter',
  );
  sqlite.close();
});
