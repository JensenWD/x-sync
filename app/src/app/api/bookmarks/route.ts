import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';

interface BookmarkRow {
  id: number;
  tweet_id: string;
  full_text: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
  author_verified: number;
  tweet_url: string;
  media_urls: string | null;
  quoted_tweet: string | null;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  view_count: number | null;
  bookmark_count: number | null;
  lang: string | null;
  bookmarked_at: number | null;
  created_at: number;
  folders_json: string;
  tags_json: string;
}

function parseBookmark(row: BookmarkRow) {
  return {
    id: row.id,
    tweet_id: row.tweet_id,
    full_text: row.full_text,
    author_name: row.author_name,
    author_handle: row.author_handle,
    author_avatar: row.author_avatar,
    author_verified: !!row.author_verified,
    tweet_url: row.tweet_url,
    media_urls: row.media_urls ? JSON.parse(row.media_urls) : [],
    quoted_tweet: row.quoted_tweet ? JSON.parse(row.quoted_tweet) : null,
    like_count: row.like_count ?? 0,
    retweet_count: row.retweet_count ?? 0,
    reply_count: row.reply_count ?? 0,
    quote_count: row.quote_count ?? 0,
    view_count: row.view_count,
    bookmark_count: row.bookmark_count,
    lang: row.lang,
    bookmarked_at: row.bookmarked_at,
    folders: JSON.parse(row.folders_json || '[]'),
    tags: JSON.parse(row.tags_json || '[]'),
  };
}

const BASE_SELECT = `
  SELECT
    b.id, b.tweet_id, b.full_text, b.author_name, b.author_handle,
    b.author_avatar, b.author_verified, b.tweet_url, b.media_urls, b.quoted_tweet,
    b.like_count, b.retweet_count, b.reply_count, b.quote_count,
    b.view_count, b.bookmark_count, b.lang, b.bookmarked_at,
    b.created_at,
    (SELECT COALESCE(json_group_array(json_object('id', f.id, 'name', f.name, 'color', f.color)), '[]')
     FROM bookmark_folders bf JOIN folders f ON f.id = bf.folder_id
     WHERE bf.bookmark_id = b.id) AS folders_json,
    (SELECT COALESCE(json_group_array(json_object('id', t.id, 'name', t.name, 'source', bt.source)), '[]')
     FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id
     WHERE bt.bookmark_id = b.id) AS tags_json
  FROM bookmarks b
`;

function parseIdList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function parseStringList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search')?.trim();
  const folderIds = parseIdList(searchParams.get('folder_id'));
  const tagNames = parseStringList(searchParams.get('tag'));
  const untagged = searchParams.get('untagged') === '1';
  const fromTs = parseInt(searchParams.get('from') || '', 10);
  const toTs = parseInt(searchParams.get('to') || '', 10);
  const sort = searchParams.get('sort') || 'bookmarked_at_desc';
  const perPage = Math.min(parseInt(searchParams.get('per_page') || '40', 10), 100);
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
  const offset = (page - 1) * perPage;

  const conditions: string[] = ['b.archived_at IS NULL'];
  const params: (string | number)[] = [];

  if (search) {
    // FTS5 prefix match on alphanumeric tokens. Strip non-alpha for safety against
    // syntax errors, but keep the bareword + wildcard form so multi-token queries
    // (e.g. "claude code") behave like AND.
    const ftsQuery = search
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w.replace(/[^a-zA-Z0-9]/g, '')}*`)
      .filter((w) => w.length > 1)
      .join(' ');
    if (ftsQuery) {
      const ftsRows = rawDb
        .prepare(
          `SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ? ORDER BY rank LIMIT 500`,
        )
        .all(ftsQuery) as { rowid: number }[];
      if (ftsRows.length === 0) {
        return Response.json({
          data: [],
          meta: { total: 0, per_page: perPage, current_page: page, last_page: 1 },
        });
      }
      const ids = ftsRows.map((r) => r.rowid).join(',');
      conditions.push(`b.id IN (${ids})`);
    }
  }

  // Folder filter — any-of semantics (a bookmark in ANY selected folder matches)
  if (folderIds.length > 0) {
    const placeholders = folderIds.map(() => '?').join(',');
    conditions.push(
      `EXISTS (SELECT 1 FROM bookmark_folders bf2 WHERE bf2.bookmark_id = b.id AND bf2.folder_id IN (${placeholders}))`,
    );
    params.push(...folderIds);
  }

  // Tag filter — all-of semantics (must match every selected tag).
  // Counts distinct matching tag names against the requested list.
  if (tagNames.length > 0) {
    const placeholders = tagNames.map(() => '?').join(',');
    conditions.push(
      `(SELECT COUNT(DISTINCT t2.name) FROM bookmark_tags bt2 JOIN tags t2 ON t2.id = bt2.tag_id
        WHERE bt2.bookmark_id = b.id AND t2.name IN (${placeholders})) = ?`,
    );
    params.push(...tagNames, tagNames.length);
  }

  if (untagged) {
    conditions.push(`NOT EXISTS (SELECT 1 FROM bookmark_tags bt3 WHERE bt3.bookmark_id = b.id)`);
  }

  if (Number.isFinite(fromTs) && fromTs > 0) {
    conditions.push(`b.bookmarked_at >= ?`);
    params.push(fromTs);
  }
  if (Number.isFinite(toTs) && toTs > 0) {
    conditions.push(`b.bookmarked_at <= ?`);
    params.push(toTs);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortMap: Record<string, string> = {
    bookmarked_at_desc: 'b.bookmarked_at DESC NULLS LAST, b.id DESC',
    bookmarked_at_asc: 'b.bookmarked_at ASC NULLS LAST, b.id ASC',
    like_count_desc: 'b.like_count DESC NULLS LAST, b.id DESC',
    author_asc: 'b.author_handle ASC, b.id DESC',
  };
  const orderBy = sortMap[sort] || sortMap.bookmarked_at_desc;

  const countSql = `SELECT COUNT(DISTINCT b.id) as cnt FROM bookmarks b ${whereClause}`;
  const totalRow = rawDb.prepare(countSql).get(...params) as { cnt: number };
  const total = totalRow?.cnt ?? 0;

  const dataSql = `
    ${BASE_SELECT}
    ${whereClause}
    GROUP BY b.id
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;
  const rows = rawDb.prepare(dataSql).all(...params, perPage, offset) as BookmarkRow[];

  return Response.json({
    data: rows.map(parseBookmark),
    meta: {
      total,
      per_page: perPage,
      current_page: page,
      last_page: Math.max(1, Math.ceil(total / perPage)),
    },
  });
}
