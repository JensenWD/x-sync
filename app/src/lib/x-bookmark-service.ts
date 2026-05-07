import 'server-only';
import { rawDb } from './db/client';

interface SyncStatus {
  in_progress: boolean;
  last_synced_at: number | null;
  total_bookmarks: number;
  last_error: string | null;
}

const syncStatus: SyncStatus = {
  in_progress: false,
  last_synced_at: null,
  total_bookmarks: 0,
  last_error: null,
};

export function getSyncStatus(): SyncStatus {
  const countRow = rawDb
    .prepare('SELECT COUNT(*) as cnt FROM bookmarks')
    .get() as { cnt: number };
  return { ...syncStatus, total_bookmarks: countRow.cnt };
}

export interface BookmarkRow {
  tweetId: string;
  fullText: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string | null;
  authorVerified?: boolean;
  tweetUrl: string;
  mediaUrls: string | null;
  quotedTweet: string | null;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  quoteCount?: number;
  viewCount?: number | null;
  bookmarkCount?: number | null;
  lang?: string | null;
  bookmarkedAt: number | null;
  syncedAt: number;
}

export function upsertBookmarkBatch(rows: BookmarkRow[]): number {
  const upsertStmt = rawDb.prepare(`
    INSERT INTO bookmarks
      (tweet_id, full_text, author_name, author_handle, author_avatar, author_verified,
       tweet_url, media_urls, quoted_tweet,
       like_count, retweet_count, reply_count, quote_count, view_count, bookmark_count, lang,
       bookmarked_at, synced_at, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(tweet_id) DO UPDATE SET
      full_text       = excluded.full_text,
      author_name     = excluded.author_name,
      author_handle   = excluded.author_handle,
      author_avatar   = excluded.author_avatar,
      author_verified = excluded.author_verified,
      media_urls      = excluded.media_urls,
      quoted_tweet    = excluded.quoted_tweet,
      like_count      = excluded.like_count,
      retweet_count   = excluded.retweet_count,
      reply_count     = excluded.reply_count,
      quote_count     = excluded.quote_count,
      view_count      = excluded.view_count,
      bookmark_count  = excluded.bookmark_count,
      lang            = excluded.lang,
      synced_at       = excluded.synced_at,
      updated_at      = unixepoch()
  `);

  const insertMany = rawDb.transaction((items: BookmarkRow[]) => {
    for (const row of items) {
      upsertStmt.run(
        row.tweetId,
        row.fullText,
        row.authorName,
        row.authorHandle,
        row.authorAvatar,
        row.authorVerified ? 1 : 0,
        row.tweetUrl,
        row.mediaUrls,
        row.quotedTweet,
        row.likeCount ?? 0,
        row.retweetCount ?? 0,
        row.replyCount ?? 0,
        row.quoteCount ?? 0,
        row.viewCount ?? null,
        row.bookmarkCount ?? null,
        row.lang ?? null,
        row.bookmarkedAt,
        row.syncedAt,
      );
    }
  });

  insertMany(rows);

  syncStatus.last_synced_at = Math.floor(Date.now() / 1000);
  const countRow = rawDb
    .prepare('SELECT COUNT(*) as cnt FROM bookmarks')
    .get() as { cnt: number };
  syncStatus.total_bookmarks = countRow.cnt;

  return rows.length;
}
