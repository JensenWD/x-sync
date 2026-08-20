import { rawDb } from '@/lib/db/client';
import {
  BOOKMARK_QUERY_DEFAULT_LIMIT,
  BOOKMARK_QUERY_MAX_LIMIT,
  getBookmarkQueryFacets,
} from '@/lib/bookmark-query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return Response.json(
    {
      name: 'x_bookmark_query',
      version: '1.0',
      description:
        'Read-only lexical search and structured filtering over Johnny’s locally stored X bookmarks.',
      endpoint: '/api/agent/bookmarks',
      methods: {
        GET: {
          description: 'Use URL query parameters. Repeat a parameter or comma-separate its values.',
          parameter_names: {
            authors: 'author',
            folder_ids: 'folder_id',
            folder_names: 'folder',
            tags_any: 'tag',
            tags_all: 'tag_all',
            tweet_ids: 'tweet_id',
          },
        },
        POST: {
          content_type: 'application/json',
          description: 'Use the JSON fields documented in input_schema.',
        },
      },
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          q: { type: 'string', maxLength: 500, description: 'Content/author full-text query.' },
          match: { enum: ['all', 'any', 'phrase'], default: 'all' },
          authors: { type: 'array', items: { type: 'string' }, maxItems: 25 },
          folder_ids: { type: 'array', items: { type: 'integer' }, maxItems: 25 },
          folder_names: { type: 'array', items: { type: 'string' }, maxItems: 25 },
          tags_any: { type: 'array', items: { type: 'string' }, maxItems: 25 },
          tags_all: { type: 'array', items: { type: 'string' }, maxItems: 25 },
          tweet_ids: { type: 'array', items: { type: 'string' }, maxItems: 100 },
          has_media: { type: 'boolean' },
          has_quote: { type: 'boolean' },
          tweet_created_after: {
            oneOf: [{ type: 'integer' }, { type: 'string', format: 'date-time' }],
          },
          tweet_created_before: {
            oneOf: [{ type: 'integer' }, { type: 'string', format: 'date-time' }],
          },
          status: { enum: ['active', 'removed', 'hidden', 'all'], default: 'active' },
          sort: {
            enum: ['relevance', 'bookmark_order', 'tweet_newest', 'tweet_oldest', 'author'],
            description: 'Defaults to relevance with q, otherwise current X bookmark order.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: BOOKMARK_QUERY_MAX_LIMIT,
            default: BOOKMARK_QUERY_DEFAULT_LIMIT,
          },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
      result_fields: {
        bookmark: [
          'id',
          'tweet_id',
          'text',
          'url',
          'author',
          'media_urls',
          'quoted_tweet',
          'folders',
          'tags',
          'tweet_created_at',
          'tweet_created_at_iso',
          'first_imported_at',
          'first_imported_at_iso',
          'updated_at',
          'updated_at_iso',
          'sync',
          'relevance_score',
        ],
        pagination: ['total', 'returned', 'limit', 'offset', 'has_more', 'next_offset'],
      },
      examples: [
        {
          purpose: 'Find AI posts tagged research',
          method: 'POST',
          body: { q: 'AI agents', tags_any: ['research'], limit: 20 },
        },
        {
          purpose: 'Find posts in either of two folders that have media',
          method: 'GET',
          path: '/api/agent/bookmarks?folder=Ideas,Work&has_media=true&limit=50',
        },
        {
          purpose: 'Require every listed tag',
          method: 'POST',
          body: { tags_all: ['ai', 'coding'], sort: 'tweet_newest' },
        },
      ],
      notes: [
        'The API is read-only and never triggers an X API call.',
        'Content search is lexical FTS5 search with safe prefix matching; it is not semantic/vector search.',
        'X does not expose bookmark-save time. tweet_created_at is the tweet publication time.',
        'The default status=active omits remotely removed and locally hidden rows.',
      ],
      facets: getBookmarkQueryFacets(rawDb),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
}
