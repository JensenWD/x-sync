import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  ManualTaxonomyError,
  assignManual,
  unassignManual,
  upsertTagByName,
} from '../src/lib/manual-taxonomy';

function createDatabase() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE bookmarks (id INTEGER PRIMARY KEY AUTOINCREMENT, tweet_id TEXT NOT NULL UNIQUE);
    CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()));
    CREATE TABLE folders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE bookmark_tags (bookmark_id INTEGER NOT NULL, tag_id INTEGER NOT NULL,
      PRIMARY KEY (bookmark_id, tag_id));
    CREATE TABLE bookmark_folders (bookmark_id INTEGER NOT NULL, folder_id INTEGER NOT NULL,
      PRIMARY KEY (bookmark_id, folder_id));
    CREATE TABLE taxonomy_assignments (
      bookmark_id INTEGER NOT NULL, kind TEXT NOT NULL, target_id INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual', agent_run_id INTEGER, confidence REAL,
      rationale TEXT, content_hash TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (bookmark_id, kind, target_id));
    INSERT INTO bookmarks (id, tweet_id) VALUES (1, 'a'), (2, 'b'), (3, 'c');
    INSERT INTO folders (id, name) VALUES (7, 'Read soon');
  `);
  return sqlite;
}

test('one call files a whole selection and records each as a manual assignment', () => {
  const sqlite = createDatabase();
  assignManual(sqlite, 'folder', 7, [1, 2, 3]);

  assert.equal(
    (sqlite.prepare('SELECT COUNT(*) c FROM bookmark_folders WHERE folder_id = 7').get() as { c: number }).c,
    3,
  );
  const assignments = sqlite
    .prepare("SELECT source FROM taxonomy_assignments WHERE kind = 'folder' AND target_id = 7")
    .all() as { source: string }[];
  assert.equal(assignments.length, 3);
  assert.ok(assignments.every((row) => row.source === 'manual'));
});

test('a person assigning over an agent guess clears the agent provenance', () => {
  const sqlite = createDatabase();
  sqlite
    .prepare(
      `INSERT INTO taxonomy_assignments
        (bookmark_id, kind, target_id, source, agent_run_id, confidence, rationale, content_hash)
       VALUES (1, 'folder', 7, 'agent', 42, 0.6, 'looked relevant', 'abc')`,
    )
    .run();

  assignManual(sqlite, 'folder', 7, [1]);

  const row = sqlite
    .prepare("SELECT * FROM taxonomy_assignments WHERE bookmark_id = 1 AND kind = 'folder'")
    .get() as Record<string, unknown>;
  assert.equal(row.source, 'manual');
  assert.equal(row.agent_run_id, null);
  assert.equal(row.confidence, null);
  assert.equal(row.rationale, null);
  assert.equal(row.content_hash, null);
});

test('a missing bookmark rejects the whole batch instead of filing part of it', () => {
  const sqlite = createDatabase();
  assert.throws(
    () => assignManual(sqlite, 'folder', 7, [1, 999]),
    (error: unknown) => {
      assert.ok(error instanceof ManualTaxonomyError);
      assert.equal(error.status, 404);
      assert.deepEqual(error.detail, { bookmark_ids: [999] });
      return true;
    },
  );
  assert.equal(
    (sqlite.prepare('SELECT COUNT(*) c FROM bookmark_folders').get() as { c: number }).c,
    0,
  );
});

test('re-applying the same tag is idempotent, and removing it clears both tables', () => {
  const sqlite = createDatabase();
  const tag = upsertTagByName(sqlite, 'ai');
  assert.equal(upsertTagByName(sqlite, 'ai').id, tag.id);

  assignManual(sqlite, 'tag', tag.id, [1, 2]);
  assignManual(sqlite, 'tag', tag.id, [1, 2]);
  assert.equal(
    (sqlite.prepare('SELECT COUNT(*) c FROM bookmark_tags').get() as { c: number }).c,
    2,
  );

  unassignManual(sqlite, 'tag', tag.id, 1);
  assert.equal(
    (sqlite.prepare('SELECT COUNT(*) c FROM bookmark_tags').get() as { c: number }).c,
    1,
  );
  assert.equal(
    (sqlite.prepare("SELECT COUNT(*) c FROM taxonomy_assignments WHERE kind = 'tag'").get() as { c: number }).c,
    1,
  );
});
