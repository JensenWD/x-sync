import { rawDb } from '@/lib/db/client';
import { db } from '@/lib/db/client';
import { bookmarks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/bookmarks/[id]'>) {
  const { id } = await ctx.params;
  const row = rawDb
    .prepare(
      `SELECT b.id, b.tweet_id, b.full_text, b.author_name, b.author_handle,
        b.author_avatar, b.tweet_url, b.media_urls, b.quoted_tweet, b.bookmarked_at,
        COALESCE(json_group_array(
          CASE WHEN f.id IS NOT NULL THEN json_object('id', f.id, 'name', f.name, 'color', f.color) END
        ) FILTER (WHERE f.id IS NOT NULL), '[]') AS folders_json,
        COALESCE(json_group_array(
          CASE WHEN t.id IS NOT NULL THEN json_object('id', t.id, 'name', t.name) END
        ) FILTER (WHERE t.id IS NOT NULL), '[]') AS tags_json
      FROM bookmarks b
      LEFT JOIN bookmark_folders bf ON bf.bookmark_id = b.id
      LEFT JOIN folders f ON f.id = bf.folder_id
      LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
      LEFT JOIN tags t ON t.id = bt.tag_id
      WHERE b.id = ?
      GROUP BY b.id`,
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
  await db.delete(bookmarks).where(eq(bookmarks.id, parseInt(id, 10)));
  return Response.json({ ok: true });
}
