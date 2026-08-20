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
    .prepare('SELECT revision FROM library_revision_state WHERE id = 1')
    .get() as { revision: number } | undefined;
  if (!row) throw new Error('Library revision state is missing; run database migrations');
  return `r${row.revision}`;
}
