import { rawDb } from '@/lib/db/client';
import { db } from '@/lib/db/client';
import { bookmarks } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import {
  DASHBOARD_BOOKMARK_COLUMNS,
  parseDashboardBookmark,
  type DashboardBookmarkRow,
} from '@/lib/dashboard-bookmark';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/bookmarks/[id]'>) {
  const { id } = await ctx.params;
  const row = rawDb
    .prepare(
      `SELECT
${DASHBOARD_BOOKMARK_COLUMNS}
      FROM bookmarks b
      WHERE b.id = ? AND b.remote_present = 1 AND b.hidden_at IS NULL`,
    )
    .get(parseInt(id, 10)) as DashboardBookmarkRow | undefined;

  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json(parseDashboardBookmark(row));
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/bookmarks/[id]'>) {
  const { id } = await ctx.params;
  await db
    .update(bookmarks)
    .set({ hiddenAt: sql`(unixepoch())`, updatedAt: sql`(unixepoch())` })
    .where(eq(bookmarks.id, parseInt(id, 10)));
  return Response.json({ ok: true });
}
