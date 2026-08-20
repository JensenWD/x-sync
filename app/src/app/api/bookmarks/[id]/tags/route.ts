import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';
import {
  boundedName,
  jsonObject,
  positiveInteger,
  validationResponse,
} from '@/lib/http/input-validation';

export async function POST(req: NextRequest, ctx: RouteContext<'/api/bookmarks/[id]/tags'>) {
  try {
    const { id } = await ctx.params;
    const bookmarkId = positiveInteger(id, 'bookmark id');
    const body = await jsonObject(req);
    const tagName = boundedName(body.name, 'name', 64).toLocaleLowerCase();
    const tag = rawDb.transaction(() => {
      const bookmark = rawDb.prepare('SELECT 1 FROM bookmarks WHERE id = ?').get(bookmarkId);
      if (!bookmark) return null;
      rawDb.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING').run(tagName);
      const stored = rawDb.prepare('SELECT id, name, created_at FROM tags WHERE name = ?').get(tagName) as
        | { id: number; name: string; created_at: number }
        | undefined;
      if (!stored) throw new Error('Tag creation failed');
      rawDb
        .prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)')
        .run(bookmarkId, stored.id);
      rawDb
        .prepare(
          `INSERT INTO taxonomy_assignments
            (bookmark_id, kind, target_id, source, created_at, updated_at)
           VALUES (?, 'tag', ?, 'manual', unixepoch(), unixepoch())
           ON CONFLICT(bookmark_id, kind, target_id) DO UPDATE SET
             source = 'manual', agent_run_id = NULL, confidence = NULL,
             rationale = NULL, content_hash = NULL, updated_at = unixepoch()`,
        )
        .run(bookmarkId, stored.id);
      return stored;
    })();
    if (!tag) return Response.json({ error: 'Bookmark not found' }, { status: 404 });
    return Response.json({ ok: true, tag });
  } catch (error) {
    const response = validationResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/bookmarks/[id]/tags'>) {
  try {
    const { id } = await ctx.params;
    const bookmarkId = positiveInteger(id, 'bookmark id');
    const tagId = positiveInteger(req.nextUrl.searchParams.get('tag_id'), 'tag_id');
    rawDb.transaction(() => {
      rawDb.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ? AND tag_id = ?').run(bookmarkId, tagId);
      rawDb
        .prepare(
          `DELETE FROM taxonomy_assignments
           WHERE bookmark_id = ? AND kind = 'tag' AND target_id = ?`,
        )
        .run(bookmarkId, tagId);
    }).immediate();
    return Response.json({ ok: true });
  } catch (error) {
    const response = validationResponse(error);
    if (response) return response;
    throw error;
  }
}
