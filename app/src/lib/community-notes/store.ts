import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface TrackedCommunityNoteIds {
  tweetIds: Set<string>;
  matchedNoteIds: Set<string>;
  hash: string;
}

export interface PublicCommunityNote {
  noteId: string;
  tweetId: string;
  summary: string;
  classification: string | null;
  trustworthySources: boolean | null;
  isMediaNote: boolean;
  isCollaborativeNote: boolean;
  createdAt: number | null;
}

export interface PublicCommunityNoteStatus {
  currentStatus: string;
  updatedAt: number | null;
}

interface BookmarkReferenceRow {
  tweet_id: string;
  quoted_tweet: string | null;
  replied_to_tweet: string | null;
  matched_media_notes: string | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function json(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function addMatches(target: Set<string>, value: unknown) {
  if (!Array.isArray(value)) return;
  for (const raw of value) {
    const noteId = object(raw)?.note_id;
    if (typeof noteId === 'string' && /^\d{1,19}$/u.test(noteId)) target.add(noteId);
  }
}

function addReference(
  tweetIds: Set<string>,
  matchedNoteIds: Set<string>,
  value: string | null,
) {
  const reference = object(json(value));
  if (!reference) return;
  if (typeof reference.tweet_id === 'string' && /^\d{1,19}$/u.test(reference.tweet_id)) {
    tweetIds.add(reference.tweet_id);
  }
  addMatches(matchedNoteIds, reference.matched_media_notes);
}

export function collectTrackedCommunityNoteIds(
  sqlite: Database.Database,
): TrackedCommunityNoteIds {
  const rows = sqlite
    .prepare(
      `SELECT tweet_id, quoted_tweet, replied_to_tweet, matched_media_notes
       FROM bookmarks
       WHERE remote_present = 1 AND hidden_at IS NULL`,
    )
    .all() as BookmarkReferenceRow[];
  const tweetIds = new Set<string>();
  const matchedNoteIds = new Set<string>();
  for (const row of rows) {
    if (/^\d{1,19}$/u.test(row.tweet_id)) tweetIds.add(row.tweet_id);
    addReference(tweetIds, matchedNoteIds, row.quoted_tweet);
    addReference(tweetIds, matchedNoteIds, row.replied_to_tweet);
    addMatches(matchedNoteIds, json(row.matched_media_notes));
  }
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        tweets: [...tweetIds].sort(),
        matched_notes: [...matchedNoteIds].sort(),
      }),
    )
    .digest('hex');
  return { tweetIds, matchedNoteIds, hash };
}

export function replaceCommunityNotes(
  sqlite: Database.Database,
  snapshotDate: string,
  trackedHash: string,
  notes: Map<string, PublicCommunityNote>,
  statuses: Map<string, PublicCommunityNoteStatus>,
  now: number,
) {
  const rows = [...notes.values()].map((note) => ({
    ...note,
    status: statuses.get(note.noteId) ?? {
      currentStatus: 'NEEDS_MORE_RATINGS',
      updatedAt: null,
    },
  }));
  const helpful = rows.filter(
    (row) => row.status.currentStatus === 'CURRENTLY_RATED_HELPFUL',
  ).length;

  const replace = sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM community_notes').run();
    const insert = sqlite.prepare(
      `INSERT INTO community_notes
         (note_id, tweet_id, summary, classification, trustworthy_sources,
          is_media_note, is_collaborative_note, current_status, note_created_at,
          status_updated_at, source_snapshot_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of rows) {
      insert.run(
        row.noteId,
        row.tweetId,
        row.summary,
        row.classification,
        row.trustworthySources === null ? null : Number(row.trustworthySources),
        Number(row.isMediaNote),
        Number(row.isCollaborativeNote),
        row.status.currentStatus,
        row.createdAt,
        row.status.updatedAt,
        snapshotDate,
        now,
        now,
      );
    }
    sqlite
      .prepare(
        `INSERT INTO community_notes_state
           (id, snapshot_date, last_checked_at, last_refreshed_at, tracked_hash,
            notes_imported, helpful_notes, last_error, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET
           snapshot_date = excluded.snapshot_date,
           last_checked_at = excluded.last_checked_at,
           last_refreshed_at = excluded.last_refreshed_at,
           tracked_hash = excluded.tracked_hash,
           notes_imported = excluded.notes_imported,
           helpful_notes = excluded.helpful_notes,
           last_error = NULL,
           updated_at = excluded.updated_at`,
      )
      .run(snapshotDate, now, now, trackedHash, rows.length, helpful, now);
  });
  replace.immediate();
  return { notesImported: rows.length, helpfulNotes: helpful };
}

export function recordCommunityNotesFailure(
  sqlite: Database.Database,
  message: string,
  now: number,
) {
  sqlite
    .prepare(
      `INSERT INTO community_notes_state (id, last_checked_at, last_error, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_checked_at = excluded.last_checked_at,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
    )
    .run(now, message.slice(0, 1000), now);
}
