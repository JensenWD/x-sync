import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { bookmarkContentHash } from '../src/lib/bookmark-content';
import {
  applyTaxonomyProposals,
  createTaxonomyProposals,
  reviewTaxonomyProposals,
  rollbackTaxonomyEvents,
} from '../src/lib/agent-taxonomy';
import { semanticSearch, storeEnrichments } from '../src/lib/agent-enrichment';

function createDatabase() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tweet_id TEXT NOT NULL UNIQUE,
      full_text TEXT NOT NULL DEFAULT '', author_name TEXT NOT NULL DEFAULT '',
      author_handle TEXT NOT NULL DEFAULT '', author_avatar TEXT,
      tweet_url TEXT NOT NULL DEFAULT '', media_urls TEXT, media_metadata TEXT,
      quoted_tweet TEXT, bookmarked_at INTEGER, synced_at INTEGER,
      remote_present INTEGER NOT NULL DEFAULT 1, removed_from_x_at INTEGER,
      hidden_at INTEGER, remote_order_run_id INTEGER, remote_order_position INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, color TEXT,
      description TEXT, aliases TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      description TEXT, aliases TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE bookmark_folders (
      bookmark_id INTEGER NOT NULL, folder_id INTEGER NOT NULL,
      PRIMARY KEY (bookmark_id, folder_id)
    );
    CREATE TABLE bookmark_tags (
      bookmark_id INTEGER NOT NULL, tag_id INTEGER NOT NULL,
      PRIMARY KEY (bookmark_id, tag_id)
    );
    CREATE TABLE sync_state (
      id INTEGER PRIMARY KEY, last_successful_run_id INTEGER, last_synced_at INTEGER,
      last_full_synced_at INTEGER, last_error TEXT, updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL, status TEXT NOT NULL, agent_id TEXT NOT NULL, model TEXT,
      prompt_version TEXT, taxonomy_version TEXT, library_revision TEXT, input_json TEXT,
      proposed_count INTEGER NOT NULL DEFAULT 0, applied_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0, error_message TEXT, started_at INTEGER NOT NULL,
      heartbeat_at INTEGER NOT NULL, finished_at INTEGER, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE taxonomy_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL REFERENCES agent_runs(id),
      idempotency_key TEXT NOT NULL UNIQUE, bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id),
      kind TEXT NOT NULL, operation TEXT NOT NULL, target_id INTEGER NOT NULL,
      target_name TEXT NOT NULL, confidence REAL NOT NULL, rationale TEXT,
      content_hash TEXT NOT NULL, status TEXT NOT NULL, review_note TEXT,
      reviewed_at INTEGER, applied_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE taxonomy_assignments (
      bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id), kind TEXT NOT NULL,
      target_id INTEGER NOT NULL, source TEXT NOT NULL, agent_run_id INTEGER,
      confidence REAL, rationale TEXT, content_hash TEXT, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, PRIMARY KEY (bookmark_id, kind, target_id)
    );
    CREATE TABLE taxonomy_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, proposal_id INTEGER, agent_run_id INTEGER,
      bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id), kind TEXT NOT NULL,
      target_id INTEGER NOT NULL, operation TEXT NOT NULL, before_json TEXT,
      after_json TEXT, applied_at INTEGER NOT NULL, reverted_at INTEGER
    );
    CREATE TABLE bookmark_enrichments (
      bookmark_id INTEGER PRIMARY KEY REFERENCES bookmarks(id), agent_run_id INTEGER,
      content_hash TEXT NOT NULL, status TEXT NOT NULL, summary TEXT, topics_json TEXT,
      entities_json TEXT, link_text TEXT, media_text TEXT, embedding_model TEXT,
      embedding_dimensions INTEGER, embedding_json TEXT, model TEXT, prompt_version TEXT,
      error_message TEXT, processed_at INTEGER, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
      full_text, author_name, author_handle, content='bookmarks', content_rowid='id'
    );
    CREATE VIRTUAL TABLE bookmark_enrichments_fts USING fts5(
      summary, topics_json, entities_json, link_text, media_text,
      content='bookmark_enrichments', content_rowid='bookmark_id'
    );
    CREATE TRIGGER bookmark_enrichments_ai AFTER INSERT ON bookmark_enrichments BEGIN
      INSERT INTO bookmark_enrichments_fts(rowid, summary, topics_json, entities_json, link_text, media_text)
      VALUES (new.bookmark_id, new.summary, new.topics_json, new.entities_json, new.link_text, new.media_text);
    END;
    CREATE TRIGGER bookmark_enrichments_au BEFORE UPDATE ON bookmark_enrichments BEGIN
      INSERT INTO bookmark_enrichments_fts(bookmark_enrichments_fts, rowid, summary, topics_json, entities_json, link_text, media_text)
      VALUES ('delete', old.bookmark_id, old.summary, old.topics_json, old.entities_json, old.link_text, old.media_text);
      INSERT INTO bookmark_enrichments_fts(rowid, summary, topics_json, entities_json, link_text, media_text)
      VALUES (new.bookmark_id, new.summary, new.topics_json, new.entities_json, new.link_text, new.media_text);
    END;

    INSERT INTO bookmarks (id, tweet_id, full_text, author_name, author_handle, tweet_url)
      VALUES (1, '100', 'Local AI agents and memory', 'Alice', 'alice', 'https://x.com/alice/status/100'),
             (2, '200', 'Family documents', 'Bob', 'bob', 'https://x.com/bob/status/200');
    INSERT INTO bookmarks_fts(rowid, full_text, author_name, author_handle)
      SELECT id, full_text, author_name, author_handle FROM bookmarks;
    INSERT INTO tags (id, name) VALUES (1, 'manual'), (2, 'ai');
    INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (1, 1);
    INSERT INTO taxonomy_assignments
      (bookmark_id, kind, target_id, source, created_at, updated_at)
      VALUES (1, 'tag', 1, 'manual', 1, 1);
    INSERT INTO sync_state (id, last_successful_run_id) VALUES (1, 1);
  `);
  return sqlite;
}

function contentHash(sqlite: Database.Database, bookmarkId: number) {
  const row = sqlite
    .prepare(
      `SELECT tweet_id, full_text, author_name, author_handle, tweet_url,
              media_urls, media_metadata, quoted_tweet FROM bookmarks WHERE id = ?`,
    )
    .get(bookmarkId) as Parameters<typeof bookmarkContentHash>[0];
  return bookmarkContentHash(row);
}

test('agent taxonomy changes require review, protect manual work, and roll back', () => {
  const sqlite = createDatabase();
  const hash = contentHash(sqlite, 1);
  const created = createTaxonomyProposals(sqlite, {
    idempotency_key: 'taxonomy-run-1',
    agent_id: 'test-agent',
    model: 'test-model',
    proposals: [
      {
        bookmark_id: 1,
        kind: 'tag',
        operation: 'add',
        target_id: 2,
        confidence: 0.95,
        rationale: 'Explicitly discusses AI agents.',
        content_hash: hash,
      },
    ],
  });
  const proposalId = Number((created.proposals as { id: number }[])[0].id);
  reviewTaxonomyProposals(sqlite, { proposal_ids: [proposalId], status: 'approved' });
  const preview = applyTaxonomyProposals(sqlite, { proposal_ids: [proposalId] });
  assert.equal(preview.dry_run, true);
  assert.ok('can_apply' in preview);
  assert.equal(preview.can_apply, true);
  applyTaxonomyProposals(sqlite, { proposal_ids: [proposalId], dry_run: false });
  assert.equal(
    (sqlite.prepare("SELECT source FROM taxonomy_assignments WHERE bookmark_id = 1 AND kind = 'tag' AND target_id = 2").get() as { source: string }).source,
    'agent',
  );

  const eventId = (sqlite.prepare('SELECT id FROM taxonomy_events').get() as { id: number }).id;
  assert.equal(rollbackTaxonomyEvents(sqlite, { event_ids: [eventId] }).dry_run, true);
  rollbackTaxonomyEvents(sqlite, { event_ids: [eventId], dry_run: false });
  assert.equal(
    (sqlite.prepare('SELECT COUNT(*) AS count FROM bookmark_tags WHERE bookmark_id = 1 AND tag_id = 2').get() as { count: number }).count,
    0,
  );

  const manualRemoval = createTaxonomyProposals(sqlite, {
    idempotency_key: 'taxonomy-run-2',
    agent_id: 'test-agent',
    proposals: [
      {
        bookmark_id: 1,
        kind: 'tag',
        operation: 'remove',
        target_id: 1,
        confidence: 0.8,
        content_hash: hash,
      },
    ],
  });
  const removalId = Number((manualRemoval.proposals as { id: number }[])[0].id);
  reviewTaxonomyProposals(sqlite, { proposal_ids: [removalId], status: 'approved' });
  const blocked = applyTaxonomyProposals(sqlite, { proposal_ids: [removalId] });
  assert.ok('can_apply' in blocked);
  assert.equal(blocked.can_apply, false);
  assert.equal(blocked.plan[0].blocked, 'manual_assignment_protected');
  sqlite.close();
});

test('enrichments are optimistic, dry-run by default, and power semantic retrieval', () => {
  const sqlite = createDatabase();
  const hash = contentHash(sqlite, 1);
  const payload = {
    idempotency_key: 'enrichment-run-1',
    agent_id: 'test-agent',
    model: 'test-model',
    prompt_version: 'v1',
    items: [
      {
        bookmark_id: 1,
        content_hash: hash,
        status: 'complete',
        summary: 'A post about local artificial intelligence agents.',
        topics: ['AI', 'agents'],
        embedding: { model: 'test-embedding', values: [1, 0] },
      },
    ],
  };
  assert.equal(storeEnrichments(sqlite, payload).dry_run, true);
  assert.equal(
    (sqlite.prepare('SELECT COUNT(*) AS count FROM bookmark_enrichments').get() as { count: number }).count,
    0,
  );
  storeEnrichments(sqlite, { ...payload, dry_run: false });
  const result = semanticSearch(sqlite, {
    embedding_model: 'test-embedding',
    embedding: [0.9, 0.1],
    lexical_q: 'agents',
    limit: 5,
  });
  assert.equal(result.data[0].tweet_id, '100');
  assert.ok(result.data[0].semantic_score > 0.9);
  assert.equal(result.data[0].lexical_match, true);
  sqlite.close();
});
