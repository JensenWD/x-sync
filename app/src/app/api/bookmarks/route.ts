import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';

interface BookmarkRow {
  id: number;
  tweet_id: string;
  full_text: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
  tweet_url: string;
  media_urls: string | null;
  quoted_tweet: string | null;
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
    tweet_url: row.tweet_url,
    media_urls: row.media_urls ? JSON.parse(row.media_urls) : [],
    quoted_tweet: row.quoted_tweet ? JSON.parse(row.quoted_tweet) : null,
    bookmarked_at: row.bookmarked_at,
    folders: JSON.parse(row.folders_json || '[]'),
    tags: JSON.parse(row.tags_json || '[]'),
  };
}

const BASE_SELECT = `
  SELECT
    b.id, b.tweet_id, b.full_text, b.author_name, b.author_handle,
    b.author_avatar, b.tweet_url, b.media_urls, b.quoted_tweet, b.bookmarked_at,
    b.created_at,
    COALESCE(json_group_array(
      CASE WHEN f.id IS NOT NULL THEN json_object('id', f.id, 'name', f.name, 'color', f.color) END
    ) FILTER (WHERE f.id IS NOT NULL), '[]') AS folders_json,
    COALESCE(json_group_array(
      CASE WHEN t.id IS NOT NULL THEN json_object('id', t.id, 'name', t.name) END
    ) FILTER (WHERE t.id IS NOT NULL), '[]') AS tags_json
  FROM bookmarks b
  LEFT JOIN bookmark_folders bf ON bf.bookmark_id = b.id
  LEFT JOIN folders f ON f.id = bf.folder_id
  LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
  LEFT JOIN tags t ON t.id = bt.tag_id
`;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search')?.trim();
  const folderId = searchParams.get('folder_id');
  const tagName = searchParams.get('tag');
  const sort = searchParams.get('sort') || 'bookmarked_at_desc';
  const perPage = Math.min(parseInt(searchParams.get('per_page') || '40', 10), 100);
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
  const offset = (page - 1) * perPage;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (search) {
    // Use FTS5 to find matching IDs, then filter main query
    const ftsQuery = search
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w.replace(/[^a-zA-Z0-9]/g, '')}*`)
      .join(' ');
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

  if (folderId) {
    conditions.push(`EXISTS (SELECT 1 FROM bookmark_folders bf2 WHERE bf2.bookmark_id = b.id AND bf2.folder_id = ?)`);
    params.push(parseInt(folderId, 10));
  }

  if (tagName) {
    conditions.push(`EXISTS (SELECT 1 FROM bookmark_tags bt2 JOIN tags t2 ON t2.id = bt2.tag_id WHERE bt2.bookmark_id = b.id AND t2.name = ?)`);
    params.push(tagName);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortMap: Record<string, string> = {
    bookmarked_at_desc: 'b.bookmarked_at DESC NULLS LAST, b.id DESC',
    bookmarked_at_asc: 'b.bookmarked_at ASC NULLS LAST, b.id ASC',
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
