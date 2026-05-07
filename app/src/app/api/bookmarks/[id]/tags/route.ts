import { db } from '@/lib/db/client';
import { tags, bookmarkTags } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest, ctx: RouteContext<'/api/bookmarks/[id]/tags'>) {
  const { id } = await ctx.params;
  const bookmarkId = parseInt(id, 10);

  const { name } = await req.json();
  if (!name?.trim()) return Response.json({ error: 'name is required' }, { status: 400 });

  const tagName = name.trim().toLowerCase();

  // Get or create tag
  let tag = (await db.select().from(tags).where(eq(tags.name, tagName)))[0];
  if (!tag) {
    const inserted = await db.insert(tags).values({ name: tagName }).returning();
    tag = inserted[0];
  }

  // Add association (ignore if already exists)
  await db
    .insert(bookmarkTags)
    .values({ bookmarkId, tagId: tag.id, source: 'manual' })
    .onConflictDoNothing();

  return Response.json({ ok: true, tag });
}

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/bookmarks/[id]/tags'>) {
  const { id } = await ctx.params;
  const bookmarkId = parseInt(id, 10);
  const tagId = parseInt(req.nextUrl.searchParams.get('tag_id') || '', 10);

  if (!tagId) return Response.json({ error: 'tag_id required' }, { status: 400 });

  await db
    .delete(bookmarkTags)
    .where(and(eq(bookmarkTags.bookmarkId, bookmarkId), eq(bookmarkTags.tagId, tagId)));

  return Response.json({ ok: true });
}
