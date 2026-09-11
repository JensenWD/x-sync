import { createHash } from 'node:crypto';
import { communityNotesJsonSql } from './community-notes/query';

export interface BookmarkContentIdentity {
  tweet_id: string;
  full_text: string;
  author_name: string;
  author_handle: string;
  tweet_url: string;
  media_urls: string | null;
  media_metadata: string | null;
  quoted_tweet: string | null;
  replied_to_tweet?: string | null;
  community_notes_json?: string | null;
  quoted_community_notes_json?: string | null;
  replied_to_community_notes_json?: string | null;
}

export function bookmarkContentSelectSql(alias = 'b') {
  return `${alias}.tweet_id, ${alias}.full_text, ${alias}.author_name, ${alias}.author_handle,
          ${alias}.tweet_url, ${alias}.media_urls, ${alias}.media_metadata,
          ${alias}.quoted_tweet, ${alias}.replied_to_tweet,
          ${communityNotesJsonSql(`${alias}.tweet_id`, `${alias}.matched_media_notes`)} AS community_notes_json,
          ${communityNotesJsonSql(
            `json_extract(${alias}.quoted_tweet, '$.tweet_id')`,
            `json_extract(${alias}.quoted_tweet, '$.matched_media_notes')`,
          )} AS quoted_community_notes_json,
          ${communityNotesJsonSql(
            `json_extract(${alias}.replied_to_tweet, '$.tweet_id')`,
            `json_extract(${alias}.replied_to_tweet, '$.matched_media_notes')`,
          )} AS replied_to_community_notes_json`;
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
        replied_to_tweet: bookmark.replied_to_tweet,
        community_notes_json: bookmark.community_notes_json,
        quoted_community_notes_json: bookmark.quoted_community_notes_json,
        replied_to_community_notes_json: bookmark.replied_to_community_notes_json,
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
