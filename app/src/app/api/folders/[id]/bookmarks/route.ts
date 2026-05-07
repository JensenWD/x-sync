import { db } from '@/lib/db/client';
import { bookmarkFolders } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest, ctx: RouteContext<'/api/folders/[id]/bookmarks'>) {
  const { id } = await ctx.params;
  const folderId = parseInt(id, 10);
  const { bookmark_ids } = await req.json();

  if (!Array.isArray(bookmark_ids) || bookmark_ids.length === 0) {
    return Response.json({ error: 'bookmark_ids array required' }, { status: 400 });
  }

  const values = bookmark_ids.map((bid: number) => ({ bookmarkId: bid, folderId }));
  await db.insert(bookmarkFolders).values(values).onConflictDoNothing();

  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<'/api/folders/[id]/bookmarks'>,
) {
  const { id } = await ctx.params;
  const folderId = parseInt(id, 10);
  const bookmarkId = parseInt(req.nextUrl.searchParams.get('bookmark_id') || '', 10);

  if (!bookmarkId) return Response.json({ error: 'bookmark_id required' }, { status: 400 });

  await db
    .delete(bookmarkFolders)
    .where(
      and(eq(bookmarkFolders.folderId, folderId), eq(bookmarkFolders.bookmarkId, bookmarkId)),
    );

  return Response.json({ ok: true });
}
