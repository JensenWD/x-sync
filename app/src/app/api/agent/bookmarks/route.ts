import { NextRequest } from 'next/server';
import { rawDb } from '@/lib/db/client';
import {
  BookmarkQueryValidationError,
  bookmarkQueryFromSearchParams,
  queryBookmarks,
  type BookmarkQueryInput,
} from '@/lib/bookmark-query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

function queryResponse(input: BookmarkQueryInput) {
  try {
    return Response.json(queryBookmarks(rawDb, input), { headers: RESPONSE_HEADERS });
  } catch (error) {
    if (error instanceof BookmarkQueryValidationError) {
      return Response.json(
        {
          error: {
            code: 'invalid_bookmark_query',
            field: error.field,
            message: error.message,
          },
        },
        { status: 400, headers: RESPONSE_HEADERS },
      );
    }
    console.error('Agent bookmark query failed', error);
    return Response.json(
      { error: { code: 'bookmark_query_failed', message: 'Bookmark query failed' } },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }
}

export async function GET(request: NextRequest) {
  return queryResponse(bookmarkQueryFromSearchParams(request.nextUrl.searchParams));
}

export async function POST(request: NextRequest) {
  let input: BookmarkQueryInput;
  try {
    input = (await request.json()) as BookmarkQueryInput;
  } catch {
    return Response.json(
      {
        error: {
          code: 'invalid_json',
          field: 'body',
          message: 'Request body must be valid JSON',
        },
      },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }
  return queryResponse(input);
}
