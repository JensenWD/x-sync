import { db } from '@/lib/db/client';
import { folders } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/folders/[id]'>) {
  const { id } = await ctx.params;
  const { name, color } = await req.json();
  if (!name?.trim()) return Response.json({ error: 'name is required' }, { status: 400 });

  const updated = await db
    .update(folders)
    .set({ name: name.trim(), color: color ?? null, updatedAt: sql`(unixepoch())` })
    .where(eq(folders.id, parseInt(id, 10)))
    .returning();

  if (!updated.length) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(updated[0]);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/folders/[id]'>) {
  const { id } = await ctx.params;
  await db.delete(folders).where(eq(folders.id, parseInt(id, 10)));
  return Response.json({ ok: true });
}
