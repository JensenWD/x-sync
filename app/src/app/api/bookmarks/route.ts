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
    COALESCE((
      SELECT json_group_array(json_object('id', f.id, 'name', f.name, 'color', f.color))
      FROM bookmark_folders bf
      JOIN folders f ON f.id = bf.folder_id
      WHERE bf.bookmark_id = b.id
    ), '[]') AS folders_json,
    COALESCE((
      SELECT json_group_array(json_object('id', t.id, 'name', t.name))
      FROM bookmark_tags bt
      JOIN tags t ON t.id = bt.tag_id
      WHERE bt.bookmark_id = b.id
    ), '[]') AS tags_json
  FROM bookmarks b
`;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search')?.trim();
  const folderId = searchParams.get('folder_id');
  const tagName = searchParams.get('tag');
  const sort = searchParams.get('sort') || 'bookmarked_at_desc';
  const rawPerPage = searchParams.get('per_page') ?? '40';
  const rawPage = searchParams.get('page') ?? '1';
  if (!/^\d+$/.test(rawPerPage) || !/^\d+$/.test(rawPage)) {
    return Response.json({ error: 'page and per_page must be positive integers' }, { status: 400 });
  }
  const perPage = Number(rawPerPage);
  const page = Number(rawPage);
  if (perPage < 1 || perPage > 100 || page < 1 || !Number.isSafeInteger(page)) {
    return Response.json(
      { error: 'page must be at least 1 and per_page must be between 1 and 100' },
      { status: 400 },
    );
  }
  const offset = (page - 1) * perPage;
  if (!Number.isSafeInteger(offset)) {
    return Response.json({ error: 'page is too large' }, { status: 400 });
  }

  const conditions: string[] = ['b.remote_present = 1', 'b.hidden_at IS NULL'];
  const params: (string | number)[] = [];
  const joins: string[] = [];

  if (search) {
    const tokens = search.normalize('NFKC').match(/[\p{L}\p{N}_]+/gu)?.slice(0, 32) ?? [];
    if (tokens.length === 0) {
      return Response.json({ error: 'search must contain letters or numbers' }, { status: 400 });
    }
    const ftsQuery = tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(' AND ');
    joins.push('JOIN bookmarks_fts ON bookmarks_fts.rowid = b.id');
    conditions.push('bookmarks_fts MATCH ?');
    params.push(ftsQuery);
  }

  if (folderId) {
    if (!/^\d+$/.test(folderId) || Number(folderId) < 1) {
      return Response.json({ error: 'folder_id must be a positive integer' }, { status: 400 });
    }
    conditions.push(`EXISTS (SELECT 1 FROM bookmark_folders bf2 WHERE bf2.bookmark_id = b.id AND bf2.folder_id = ?)`);
    params.push(Number(folderId));
  }

  if (tagName) {
    conditions.push(`EXISTS (SELECT 1 FROM bookmark_tags bt2 JOIN tags t2 ON t2.id = bt2.tag_id WHERE bt2.bookmark_id = b.id AND t2.name = ?)`);
    params.push(tagName);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortMap: Record<string, string> = {
    bookmarked_at_desc:
      'b.remote_order_run_id DESC NULLS LAST, b.remote_order_position ASC NULLS LAST, b.id DESC',
    bookmarked_at_asc:
      'b.remote_order_run_id ASC NULLS FIRST, b.remote_order_position DESC NULLS LAST, b.id ASC',
    author_asc: 'b.author_handle ASC, b.id DESC',
  };
  const orderBy = sortMap[sort] || sortMap.bookmarked_at_desc;

  const joinClause = joins.join('\n');
  const countSql = `SELECT COUNT(DISTINCT b.id) as cnt FROM bookmarks b ${joinClause} ${whereClause}`;
  const totalRow = rawDb.prepare(countSql).get(...params) as { cnt: number };
  const total = totalRow?.cnt ?? 0;

  const dataSql = `
    ${BASE_SELECT}
    ${joinClause}
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
