import type Database from 'better-sqlite3';

export const BOOKMARK_QUERY_MAX_LIMIT = 100;
export const BOOKMARK_QUERY_DEFAULT_LIMIT = 25;

export type BookmarkSearchMode = 'all' | 'any' | 'phrase';
export type BookmarkQueryStatus = 'active' | 'removed' | 'hidden' | 'all';
export type BookmarkQuerySort =
  | 'relevance'
  | 'bookmark_order'
  | 'tweet_newest'
  | 'tweet_oldest'
  | 'author';

export interface BookmarkQueryInput {
  q?: unknown;
  match?: unknown;
  authors?: unknown;
  folder_ids?: unknown;
  folder_names?: unknown;
  tags_any?: unknown;
  tags_all?: unknown;
  tweet_ids?: unknown;
  has_media?: unknown;
  has_quote?: unknown;
  tweet_created_after?: unknown;
  tweet_created_before?: unknown;
  status?: unknown;
  sort?: unknown;
  limit?: unknown;
  offset?: unknown;
}

export interface NormalizedBookmarkQuery {
  q: string | null;
  match: BookmarkSearchMode;
  authors: string[];
  folder_ids: number[];
  folder_names: string[];
  tags_any: string[];
  tags_all: string[];
  tweet_ids: string[];
  has_media: boolean | null;
  has_quote: boolean | null;
  tweet_created_after: number | null;
  tweet_created_before: number | null;
  status: BookmarkQueryStatus;
  sort: BookmarkQuerySort;
  limit: number;
  offset: number;
}

interface BookmarkQueryRow {
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
  synced_at: number | null;
  remote_present: number;
  removed_from_x_at: number | null;
  hidden_at: number | null;
  remote_order_run_id: number | null;
  remote_order_position: number | null;
  created_at: number;
  updated_at: number;
  relevance_score: number | null;
  folders_json: string;
  tags_json: string;
}

export interface BookmarkQueryResult {
  data: ReturnType<typeof parseBookmarkRow>[];
  meta: {
    total: number;
    returned: number;
    limit: number;
    offset: number;
    has_more: boolean;
    next_offset: number | null;
    query: NormalizedBookmarkQuery;
    notes: {
      tweet_created_at: string;
      active_scope: string;
    };
  };
}

export class BookmarkQueryValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
  ) {
    super(message);
    this.name = 'BookmarkQueryValidationError';
  }
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isoDate(epochSeconds: number | null) {
  return epochSeconds === null ? null : new Date(epochSeconds * 1000).toISOString();
}

function parseBookmarkRow(row: BookmarkQueryRow) {
  return {
    id: row.id,
    tweet_id: row.tweet_id,
    text: row.full_text,
    url: row.tweet_url,
    author: {
      name: row.author_name,
      handle: row.author_handle,
      avatar_url: row.author_avatar,
    },
    media_urls: parseJson<string[]>(row.media_urls, []),
    quoted_tweet: parseJson<Record<string, unknown> | null>(row.quoted_tweet, null),
    folders: parseJson<{ id: number; name: string; color: string | null }[]>(
      row.folders_json,
      [],
    ),
    tags: parseJson<{ id: number; name: string }[]>(row.tags_json, []),
    tweet_created_at: row.bookmarked_at,
    tweet_created_at_iso: isoDate(row.bookmarked_at),
    first_imported_at: row.created_at,
    first_imported_at_iso: isoDate(row.created_at),
    updated_at: row.updated_at,
    updated_at_iso: isoDate(row.updated_at),
    sync: {
      last_seen_at: row.synced_at,
      last_seen_at_iso: isoDate(row.synced_at),
      remote_present: Boolean(row.remote_present),
      removed_from_x_at: row.removed_from_x_at,
      removed_from_x_at_iso: isoDate(row.removed_from_x_at),
      hidden_at: row.hidden_at,
      hidden_at_iso: isoDate(row.hidden_at),
      remote_order_run_id: row.remote_order_run_id,
      remote_order_position: row.remote_order_position,
    },
    relevance_score: row.relevance_score,
  };
}

function stringValue(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new BookmarkQueryValidationError(`${field} must be a string`, field);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new BookmarkQueryValidationError(
      `${field} must be ${maxLength} characters or fewer`,
      field,
    );
  }
  return normalized;
}

function stringList(value: unknown, field: string, maxItems = 25) {
  if (value === undefined || value === null || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.length > maxItems) {
    throw new BookmarkQueryValidationError(
      `${field} may contain at most ${maxItems} values`,
      field,
    );
  }

  const normalized = values.map((item) => {
    if (typeof item !== 'string') {
      throw new BookmarkQueryValidationError(`${field} values must be strings`, field);
    }
    const text = item.trim();
    if (!text || text.length > 100) {
      throw new BookmarkQueryValidationError(
        `${field} values must contain 1 to 100 characters`,
        field,
      );
    }
    return text;
  });

  return [...new Map(normalized.map((item) => [item.toLocaleLowerCase(), item])).values()];
}

function integerList(value: unknown, field: string, maxItems = 25) {
  if (value === undefined || value === null || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.length > maxItems) {
    throw new BookmarkQueryValidationError(
      `${field} may contain at most ${maxItems} values`,
      field,
    );
  }
  return [
    ...new Set(
      values.map((item) => integerValue(item, field, 1, Number.MAX_SAFE_INTEGER)),
    ),
  ];
}

function integerValue(value: unknown, field: string, minimum: number, maximum: number) {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    value === '' ||
    !Number.isInteger(Number(value))
  ) {
    throw new BookmarkQueryValidationError(`${field} must be an integer`, field);
  }
  const parsed = Number(value);
  if (parsed < minimum || parsed > maximum) {
    throw new BookmarkQueryValidationError(
      `${field} must be between ${minimum} and ${maximum}`,
      field,
    );
  }
  return parsed;
}

function optionalBoolean(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new BookmarkQueryValidationError(`${field} must be true or false`, field);
}

function optionalEpoch(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    return integerValue(value, field, 0, Number.MAX_SAFE_INTEGER);
  }
  if (typeof value !== 'string') {
    throw new BookmarkQueryValidationError(
      `${field} must be an ISO-8601 date or Unix timestamp`,
      field,
    );
  }
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) {
    throw new BookmarkQueryValidationError(
      `${field} must be an ISO-8601 date or Unix timestamp`,
      field,
    );
  }
  return Math.floor(milliseconds / 1000);
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  fallback: T,
) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BookmarkQueryValidationError(
      `${field} must be one of: ${allowed.join(', ')}`,
      field,
    );
  }
  return value as T;
}

export function normalizeBookmarkQuery(input: BookmarkQueryInput): NormalizedBookmarkQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BookmarkQueryValidationError('query body must be a JSON object', 'body');
  }
  const allowedFields = new Set([
    'q',
    'match',
    'authors',
    'folder_ids',
    'folder_names',
    'tags_any',
    'tags_all',
    'tweet_ids',
    'has_media',
    'has_quote',
    'tweet_created_after',
    'tweet_created_before',
    'status',
    'sort',
    'limit',
    'offset',
  ]);
  const unknownField = Object.keys(input).find((field) => !allowedFields.has(field));
  if (unknownField) {
    throw new BookmarkQueryValidationError(`Unknown query field: ${unknownField}`, unknownField);
  }

  const q = stringValue(input.q, 'q', 500);
  const match = enumValue(
    input.match,
    'match',
    ['all', 'any', 'phrase'] as const,
    'all',
  );
  const requestedSort = enumValue(
    input.sort,
    'sort',
    ['relevance', 'bookmark_order', 'tweet_newest', 'tweet_oldest', 'author'] as const,
    q ? 'relevance' : 'bookmark_order',
  );
  const sort = requestedSort === 'relevance' && !q ? 'bookmark_order' : requestedSort;
  const tweetCreatedAfter = optionalEpoch(input.tweet_created_after, 'tweet_created_after');
  const tweetCreatedBefore = optionalEpoch(input.tweet_created_before, 'tweet_created_before');
  if (
    tweetCreatedAfter !== null &&
    tweetCreatedBefore !== null &&
    tweetCreatedAfter > tweetCreatedBefore
  ) {
    throw new BookmarkQueryValidationError(
      'tweet_created_after must not be later than tweet_created_before',
      'tweet_created_after',
    );
  }

  return {
    q,
    match,
    authors: stringList(input.authors, 'authors').map((author) =>
      author.replace(/^@/, '').toLocaleLowerCase(),
    ),
    folder_ids: integerList(input.folder_ids, 'folder_ids'),
    folder_names: stringList(input.folder_names, 'folder_names'),
    tags_any: stringList(input.tags_any, 'tags_any'),
    tags_all: stringList(input.tags_all, 'tags_all'),
    tweet_ids: stringList(input.tweet_ids, 'tweet_ids', 100),
    has_media: optionalBoolean(input.has_media, 'has_media'),
    has_quote: optionalBoolean(input.has_quote, 'has_quote'),
    tweet_created_after: tweetCreatedAfter,
    tweet_created_before: tweetCreatedBefore,
    status: enumValue(
      input.status,
      'status',
      ['active', 'removed', 'hidden', 'all'] as const,
      'active',
    ),
    sort,
    limit:
      input.limit === undefined || input.limit === null || input.limit === ''
        ? BOOKMARK_QUERY_DEFAULT_LIMIT
        : integerValue(input.limit, 'limit', 1, BOOKMARK_QUERY_MAX_LIMIT),
    offset:
      input.offset === undefined || input.offset === null || input.offset === ''
        ? 0
        : integerValue(input.offset, 'offset', 0, 1_000_000),
  };
}

function searchTokens(query: string) {
  return query.normalize('NFKC').match(/[\p{L}\p{N}_]+/gu)?.slice(0, 32) ?? [];
}

function ftsQuery(query: string, mode: BookmarkSearchMode) {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    throw new BookmarkQueryValidationError('q must contain searchable letters or numbers', 'q');
  }
  const quoted = tokens.map((token) => `"${token.replaceAll('"', '""')}"`);
  if (mode === 'phrase') return `"${tokens.join(' ').replaceAll('"', '""')}"`;
  return quoted.map((token) => `${token}*`).join(mode === 'any' ? ' OR ' : ' AND ');
}

function placeholders(length: number) {
  return Array.from({ length }, () => '?').join(', ');
}

function commaList(params: URLSearchParams, key: string) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function bookmarkQueryFromSearchParams(params: URLSearchParams): BookmarkQueryInput {
  return {
    q: params.get('q') ?? undefined,
    match: params.get('match') ?? undefined,
    authors: commaList(params, 'author'),
    folder_ids: commaList(params, 'folder_id'),
    folder_names: commaList(params, 'folder'),
    tags_any: commaList(params, 'tag'),
    tags_all: commaList(params, 'tag_all'),
    tweet_ids: commaList(params, 'tweet_id'),
    has_media: params.get('has_media') ?? undefined,
    has_quote: params.get('has_quote') ?? undefined,
    tweet_created_after: params.get('tweet_created_after') ?? undefined,
    tweet_created_before: params.get('tweet_created_before') ?? undefined,
    status: params.get('status') ?? undefined,
    sort: params.get('sort') ?? undefined,
    limit: params.get('limit') ?? undefined,
    offset: params.get('offset') ?? undefined,
  };
}

export function queryBookmarks(
  sqlite: Database.Database,
  rawInput: BookmarkQueryInput,
): BookmarkQueryResult {
  const input = normalizeBookmarkQuery(rawInput);
  const joins: string[] = [];
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (input.q) {
    joins.push('JOIN bookmarks_fts ON bookmarks_fts.rowid = b.id');
    conditions.push('bookmarks_fts MATCH ?');
    params.push(ftsQuery(input.q, input.match));
  }

  if (input.status === 'active') {
    conditions.push('b.remote_present = 1', 'b.hidden_at IS NULL');
  } else if (input.status === 'removed') {
    conditions.push('b.remote_present = 0', 'b.hidden_at IS NULL');
  } else if (input.status === 'hidden') {
    conditions.push('b.hidden_at IS NOT NULL');
  }

  if (input.authors.length > 0) {
    const list = placeholders(input.authors.length);
    conditions.push(`(lower(b.author_handle) IN (${list}) OR lower(b.author_name) IN (${list}))`);
    params.push(...input.authors, ...input.authors);
  }

  if (input.tweet_ids.length > 0) {
    conditions.push(`b.tweet_id IN (${placeholders(input.tweet_ids.length)})`);
    params.push(...input.tweet_ids);
  }

  if (input.folder_ids.length > 0 || input.folder_names.length > 0) {
    const folderConditions: string[] = [];
    if (input.folder_ids.length > 0) {
      folderConditions.push(`bf.folder_id IN (${placeholders(input.folder_ids.length)})`);
      params.push(...input.folder_ids);
    }
    if (input.folder_names.length > 0) {
      folderConditions.push(`lower(f.name) IN (${placeholders(input.folder_names.length)})`);
      params.push(...input.folder_names.map((name) => name.toLocaleLowerCase()));
    }
    conditions.push(
      `EXISTS (
        SELECT 1 FROM bookmark_folders bf
        JOIN folders f ON f.id = bf.folder_id
        WHERE bf.bookmark_id = b.id AND (${folderConditions.join(' OR ')})
      )`,
    );
  }

  if (input.tags_any.length > 0) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM bookmark_tags bt
        JOIN tags t ON t.id = bt.tag_id
        WHERE bt.bookmark_id = b.id
          AND lower(t.name) IN (${placeholders(input.tags_any.length)})
      )`,
    );
    params.push(...input.tags_any.map((tag) => tag.toLocaleLowerCase()));
  }

  for (const tag of input.tags_all) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM bookmark_tags bt_all
        JOIN tags t_all ON t_all.id = bt_all.tag_id
        WHERE bt_all.bookmark_id = b.id AND lower(t_all.name) = ?
      )`,
    );
    params.push(tag.toLocaleLowerCase());
  }

  if (input.has_media !== null) {
    conditions.push(
      input.has_media
        ? 'COALESCE(json_array_length(b.media_urls), 0) > 0'
        : 'COALESCE(json_array_length(b.media_urls), 0) = 0',
    );
  }
  if (input.has_quote !== null) {
    conditions.push(input.has_quote ? 'b.quoted_tweet IS NOT NULL' : 'b.quoted_tweet IS NULL');
  }
  if (input.tweet_created_after !== null) {
    conditions.push('b.bookmarked_at >= ?');
    params.push(input.tweet_created_after);
  }
  if (input.tweet_created_before !== null) {
    conditions.push('b.bookmarked_at <= ?');
    params.push(input.tweet_created_before);
  }

  const joinClause = joins.join('\n');
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join('\nAND ')}` : '';
  const bookmarkOrder =
    'b.remote_order_run_id DESC NULLS LAST, b.remote_order_position ASC NULLS LAST, b.id DESC';
  const orderBy: Record<BookmarkQuerySort, string> = {
    relevance: input.q ? `bm25(bookmarks_fts) ASC, ${bookmarkOrder}` : bookmarkOrder,
    bookmark_order: bookmarkOrder,
    tweet_newest: 'b.bookmarked_at DESC NULLS LAST, b.id DESC',
    tweet_oldest: 'b.bookmarked_at ASC NULLS LAST, b.id ASC',
    author: 'lower(b.author_handle) ASC, b.id DESC',
  };

  const total = (
    sqlite
      .prepare(`SELECT COUNT(*) AS count FROM bookmarks b ${joinClause} ${whereClause}`)
      .get(...params) as { count: number }
  ).count;

  const rows = sqlite
    .prepare(
      `SELECT
        b.id, b.tweet_id, b.full_text, b.author_name, b.author_handle,
        b.author_avatar, b.tweet_url, b.media_urls, b.quoted_tweet, b.bookmarked_at,
        b.synced_at, b.remote_present, b.removed_from_x_at, b.hidden_at,
        b.remote_order_run_id, b.remote_order_position, b.created_at, b.updated_at,
        ${input.q ? 'bm25(bookmarks_fts)' : 'NULL'} AS relevance_score,
        COALESCE((
          SELECT json_group_array(json_object(
            'id', folder_rows.id, 'name', folder_rows.name, 'color', folder_rows.color
          ))
          FROM (
            SELECT f.id, f.name, f.color
            FROM bookmark_folders bf
            JOIN folders f ON f.id = bf.folder_id
            WHERE bf.bookmark_id = b.id
            ORDER BY lower(f.name), f.id
          ) AS folder_rows
        ), '[]') AS folders_json,
        COALESCE((
          SELECT json_group_array(json_object('id', tag_rows.id, 'name', tag_rows.name))
          FROM (
            SELECT t.id, t.name
            FROM bookmark_tags bt
            JOIN tags t ON t.id = bt.tag_id
            WHERE bt.bookmark_id = b.id
            ORDER BY lower(t.name), t.id
          ) AS tag_rows
        ), '[]') AS tags_json
      FROM bookmarks b
      ${joinClause}
      ${whereClause}
      ORDER BY ${orderBy[input.sort]}
      LIMIT ? OFFSET ?`,
    )
    .all(...params, input.limit, input.offset) as BookmarkQueryRow[];

  const data = rows.map(parseBookmarkRow);
  const nextOffset = input.offset + data.length;
  const hasMore = nextOffset < total;

  return {
    data,
    meta: {
      total,
      returned: data.length,
      limit: input.limit,
      offset: input.offset,
      has_more: hasMore,
      next_offset: hasMore ? nextOffset : null,
      query: input,
      notes: {
        tweet_created_at:
          'X does not expose bookmark-save time; tweet_created_at is the tweet publication time.',
        active_scope:
          'status=active includes bookmarks still present on X and not locally hidden.',
      },
    },
  };
}

export function getBookmarkQueryFacets(sqlite: Database.Database) {
  const folders = sqlite
    .prepare(
      `SELECT f.id, f.name, f.color, COUNT(b.id) AS bookmark_count
       FROM folders f
       LEFT JOIN bookmark_folders bf ON bf.folder_id = f.id
       LEFT JOIN bookmarks b ON b.id = bf.bookmark_id
         AND b.remote_present = 1 AND b.hidden_at IS NULL
       GROUP BY f.id
       ORDER BY lower(f.name), f.id`,
    )
    .all() as { id: number; name: string; color: string | null; bookmark_count: number }[];
  const tags = sqlite
    .prepare(
      `SELECT t.id, t.name, COUNT(b.id) AS bookmark_count
       FROM tags t
       LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
       LEFT JOIN bookmarks b ON b.id = bt.bookmark_id
         AND b.remote_present = 1 AND b.hidden_at IS NULL
       GROUP BY t.id
       ORDER BY lower(t.name), t.id`,
    )
    .all() as { id: number; name: string; bookmark_count: number }[];

  return { folders, tags };
}
