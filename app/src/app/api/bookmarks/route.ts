import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';
import { ftsPrefixQuery, searchTokens } from '@/lib/search-tokens';
import { X_HANDLE_PATTERN } from '@/lib/x-handle';
import {
  DASHBOARD_BOOKMARK_COLUMNS,
  parseDashboardBookmark,
  type DashboardBookmarkRow,
} from '@/lib/dashboard-bookmark';

const BASE_SELECT = `
  SELECT
${DASHBOARD_BOOKMARK_COLUMNS}
  FROM bookmarks b
`;

const MAX_TAG_FILTERS = 20;
const MAX_TAG_LENGTH = 100;

/**
 * `tags` may repeat and/or hold a comma-separated list; `tag` is the older
 * single-tag form the facet bar still emits for shareable links.
 *
 * Names are lowercased to match `bookmark-query.ts` and the write path in
 * `/api/bookmarks/[id]/tags`, which stores every tag lowercased — a shared or
 * hand-edited link spelling a tag `AI` must still find the stored `ai`.
 */
function readTagFilters(searchParams: URLSearchParams) {
  const raw = [...searchParams.getAll('tags'), ...searchParams.getAll('tag')]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().normalize('NFKC').toLocaleLowerCase())
    .filter((value) => value.length > 0);
  return [...new Set(raw)];
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search')?.trim();
  const folderId = searchParams.get('folder_id');
  const tagNames = readTagFilters(searchParams);
  const tagMode = searchParams.get('tag_mode') ?? 'all';
  if (tagMode !== 'all' && tagMode !== 'any') {
    return Response.json({ error: 'tag_mode must be "all" or "any"' }, { status: 400 });
  }
  if (tagNames.length > MAX_TAG_FILTERS) {
    return Response.json(
      { error: `at most ${MAX_TAG_FILTERS} tag filters may be combined` },
      { status: 400 },
    );
  }
  if (tagNames.some((name) => name.length > MAX_TAG_LENGTH)) {
    return Response.json(
      { error: `each tag filter must be at most ${MAX_TAG_LENGTH} characters` },
      { status: 400 },
    );
  }
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
    const tokens = searchTokens(search);
    if (tokens.length === 0) {
      return Response.json({ error: 'search must contain letters or numbers' }, { status: 400 });
    }
    joins.push('JOIN bookmarks_fts ON bookmarks_fts.rowid = b.id');
    conditions.push('bookmarks_fts MATCH ?');
    params.push(ftsPrefixQuery(tokens));
  }

  // A leading @ is what people paste, and handles are stored as X spells them.
  const author = searchParams.get('author')?.trim().replace(/^@/, '');
  if (author !== undefined && author !== '') {
    if (!X_HANDLE_PATTERN.test(author)) {
      return Response.json({ error: 'author must be an X handle' }, { status: 400 });
    }
    conditions.push('lower(b.author_handle) = ?');
    params.push(author.toLocaleLowerCase());
  }

  if (folderId) {
    if (!/^\d+$/.test(folderId) || Number(folderId) < 1) {
      return Response.json({ error: 'folder_id must be a positive integer' }, { status: 400 });
    }
    conditions.push(`EXISTS (SELECT 1 FROM bookmark_folders bf2 WHERE bf2.bookmark_id = b.id AND bf2.folder_id = ?)`);
    params.push(Number(folderId));
  }

  if (tagNames.length > 0) {
    if (tagMode === 'any') {
      const placeholders = tagNames.map(() => '?').join(', ');
      conditions.push(
        `EXISTS (SELECT 1 FROM bookmark_tags bt2 JOIN tags t2 ON t2.id = bt2.tag_id WHERE bt2.bookmark_id = b.id AND lower(t2.name) IN (${placeholders}))`,
      );
      params.push(...tagNames);
    } else {
      for (const name of tagNames) {
        conditions.push(
          `EXISTS (SELECT 1 FROM bookmark_tags bt2 JOIN tags t2 ON t2.id = bt2.tag_id WHERE bt2.bookmark_id = b.id AND lower(t2.name) = ?)`,
        );
        params.push(name);
      }
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortMap: Record<string, string> = {
    bookmarked_at_desc:
      'b.remote_order_run_id DESC NULLS LAST, b.remote_order_position ASC NULLS LAST, b.id DESC',
    bookmarked_at_asc:
      'b.remote_order_run_id ASC NULLS FIRST, b.remote_order_position DESC NULLS LAST, b.id ASC',
    author_asc: 'b.author_handle ASC, b.id DESC',
    // Posts synced before public_metrics was requested sort last rather than first.
    likes_desc: 'b.like_count DESC NULLS LAST, b.id DESC',
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
  const rows = rawDb.prepare(dataSql).all(...params, perPage, offset) as DashboardBookmarkRow[];

  return Response.json({
    data: rows.map(parseDashboardBookmark),
    meta: {
      total,
      per_page: perPage,
      current_page: page,
      last_page: Math.max(1, Math.ceil(total / perPage)),
    },
  });
}
