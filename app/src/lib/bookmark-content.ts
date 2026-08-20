import { createHash } from 'node:crypto';

export interface BookmarkContentIdentity {
  tweet_id: string;
  full_text: string;
  author_name: string;
  author_handle: string;
  tweet_url: string;
  media_urls: string | null;
  media_metadata: string | null;
  quoted_tweet: string | null;
}

export function bookmarkContentHash(bookmark: BookmarkContentIdentity) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        tweet_id: bookmark.tweet_id,
        full_text: bookmark.full_text,
        author_name: bookmark.author_name,
        author_handle: bookmark.author_handle,
        tweet_url: bookmark.tweet_url,
        media_urls: bookmark.media_urls,
        media_metadata: bookmark.media_metadata,
        quoted_tweet: bookmark.quoted_tweet,
      }),
    )
    .digest('hex');
}

export function libraryRevision(sqlite: import('better-sqlite3').Database) {
  const row = sqlite
    .prepare(
      `SELECT
         COALESCE((SELECT last_successful_run_id FROM sync_state WHERE id = 1), 0) AS sync_run,
         COALESCE((SELECT MAX(updated_at) FROM bookmarks), 0) AS bookmark_update,
         COALESCE((SELECT MAX(applied_at) FROM taxonomy_events), 0) AS taxonomy_update,
         COALESCE((SELECT MAX(updated_at) FROM bookmark_enrichments), 0) AS enrichment_update`,
    )
    .get() as {
      sync_run: number;
      bookmark_update: number;
      taxonomy_update: number;
      enrichment_update: number;
    };
  return `s${row.sync_run}-b${row.bookmark_update}-t${row.taxonomy_update}-e${row.enrichment_update}`;
}
