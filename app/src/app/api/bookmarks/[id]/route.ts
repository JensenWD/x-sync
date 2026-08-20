import { rawDb } from '@/lib/db/client';
import { db } from '@/lib/db/client';
import { bookmarks } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/bookmarks/[id]'>) {
  const { id } = await ctx.params;
  const row = rawDb
    .prepare(
      `SELECT b.id, b.tweet_id, b.full_text, b.author_name, b.author_handle,
        b.author_avatar, b.tweet_url, b.media_urls, b.quoted_tweet, b.bookmarked_at,
        COALESCE((
          SELECT json_group_array(json_object('id', f.id, 'name', f.name, 'color', f.color))
          FROM bookmark_folders bf
          JOIN folders f ON f.id = bf.folder_id
          WHERE bf.bookmark_id = b.id
        ), '[]') AS folders_json,
        COALESCE((
          SELECT json_group_array(json_object('id', t.id, 'name', t.name))
          FROM bookmark_tags bt
          JOIN tags t ON t.id = bt.tag_id
          WHERE bt.bookmark_id = b.id
        ), '[]') AS tags_json
      FROM bookmarks b
      WHERE b.id = ? AND b.remote_present = 1 AND b.hidden_at IS NULL`,
    )
    .get(parseInt(id, 10)) as
    | {
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
        folders_json: string;
        tags_json: string;
      }
    | undefined;

  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json({
    ...row,
    media_urls: row.media_urls ? JSON.parse(row.media_urls) : [],
    quoted_tweet: row.quoted_tweet ? JSON.parse(row.quoted_tweet) : null,
    folders: JSON.parse(row.folders_json || '[]'),
    tags: JSON.parse(row.tags_json || '[]'),
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/bookmarks/[id]'>) {
  const { id } = await ctx.params;
  await db
    .update(bookmarks)
    .set({ hiddenAt: sql`(unixepoch())`, updatedAt: sql`(unixepoch())` })
    .where(eq(bookmarks.id, parseInt(id, 10)));
  return Response.json({ ok: true });
}
