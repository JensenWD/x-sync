import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  collectTrackedCommunityNoteIds,
  replaceCommunityNotes,
  type PublicCommunityNote,
} from '../src/lib/community-notes/store';

function database() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE bookmarks (
      id INTEGER PRIMARY KEY,
      tweet_id TEXT NOT NULL,
      quoted_tweet TEXT,
      replied_to_tweet TEXT,
      matched_media_notes TEXT,
      remote_present INTEGER NOT NULL DEFAULT 1,
      hidden_at INTEGER
    );
    CREATE TABLE community_notes (
      note_id TEXT PRIMARY KEY, tweet_id TEXT NOT NULL, summary TEXT NOT NULL,
      classification TEXT, trustworthy_sources INTEGER, is_media_note INTEGER NOT NULL DEFAULT 0,
      is_collaborative_note INTEGER NOT NULL DEFAULT 0, current_status TEXT NOT NULL,
      note_created_at INTEGER, status_updated_at INTEGER, source_snapshot_date TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE community_notes_state (
      id INTEGER PRIMARY KEY, snapshot_date TEXT, last_checked_at INTEGER,
      last_refreshed_at INTEGER, tracked_hash TEXT, notes_imported INTEGER NOT NULL DEFAULT 0,
      helpful_notes INTEGER NOT NULL DEFAULT 0, last_error TEXT, updated_at INTEGER NOT NULL
    );
  `);
  return sqlite;
}

test('tracks bookmarked, quoted, replied-to, and matched-media IDs deterministically', () => {
  const sqlite = database();
  sqlite
    .prepare(
      `INSERT INTO bookmarks
         (id, tweet_id, quoted_tweet, replied_to_tweet, matched_media_notes)
       VALUES (1, '100', ?, ?, ?)`,
    )
    .run(
      JSON.stringify({
        tweet_id: '200',
        matched_media_notes: [{ note_id: '902', match_status: 'MATCHED' }],
      }),
      JSON.stringify({ tweet_id: '300' }),
      JSON.stringify([{ note_id: '901', match_status: 'MATCHED' }]),
    );
  const first = collectTrackedCommunityNoteIds(sqlite);
  const second = collectTrackedCommunityNoteIds(sqlite);
  assert.deepEqual([...first.tweetIds].sort(), ['100', '200', '300']);
  assert.deepEqual([...first.matchedNoteIds].sort(), ['901', '902']);
  assert.equal(first.hash, second.hash);
  sqlite.close();
});

test('atomically replaces relevant notes and counts only currently Helpful notes', () => {
  const sqlite = database();
  const notes = new Map<string, PublicCommunityNote>([
    [
      '900',
      {
        noteId: '900',
        tweetId: '100',
        summary: 'Helpful context',
        classification: 'MISINFORMED_OR_POTENTIALLY_MISLEADING',
        trustworthySources: true,
        isMediaNote: false,
        isCollaborativeNote: false,
        createdAt: 10,
      },
    ],
    [
      '901',
      {
        noteId: '901',
        tweetId: '100',
        summary: 'Still being rated',
        classification: null,
        trustworthySources: null,
        isMediaNote: true,
        isCollaborativeNote: false,
        createdAt: null,
      },
    ],
  ]);
  const result = replaceCommunityNotes(
    sqlite,
    '2026/08/26',
    'hash',
    notes,
    new Map([
      ['900', { currentStatus: 'CURRENTLY_RATED_HELPFUL', updatedAt: 20 }],
      ['901', { currentStatus: 'NEEDS_MORE_RATINGS', updatedAt: 21 }],
    ]),
    30,
  );
  assert.deepEqual(result, { notesImported: 2, helpfulNotes: 1 });
  const state = sqlite.prepare('SELECT * FROM community_notes_state').get() as {
    notes_imported: number;
    helpful_notes: number;
  };
  assert.equal(state.notes_imported, 2);
  assert.equal(state.helpful_notes, 1);
  sqlite.close();
});
