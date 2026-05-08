import { runAutoTag } from '@/lib/classifier';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  let bookmarkIds: number[] | undefined;

  try {
    const body = await req.json();
    if (Array.isArray(body?.bookmarkIds)) {
      bookmarkIds = body.bookmarkIds;
    }
  } catch {
    // empty body is valid — classify all untagged
  }

  try {
    const result = runAutoTag(bookmarkIds);
    if (result.aborted) {
      return Response.json({
        status: 'aborted',
        reason: result.aborted.reason,
        tag: result.aborted.tag,
        share: result.aborted.share,
        tags_active: result.activeTags,
      });
    }
    return Response.json({
      status: 'success',
      tagged_count: result.taggedCount,
      skipped_count: result.skippedCount,
      tags_active: result.activeTags,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ status: 'error', error: message }, { status: 500 });
  }
}
