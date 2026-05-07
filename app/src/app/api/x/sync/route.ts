import { upsertBookmarkBatch, type BookmarkRow } from '@/lib/x-bookmark-service';
import { NextRequest } from 'next/server';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { bookmarks } = (body as { bookmarks?: BookmarkRow[] }) ?? {};
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return Response.json({ error: 'bookmarks array is required' }, { status: 400 });
  }

  try {
    const synced_count = upsertBookmarkBatch(bookmarks);
    return Response.json({ status: 'success', synced_count });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ status: 'error', error: message }, { status: 500 });
  }
}
