import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';
import {
  jsonObject,
  positiveInteger,
  positiveIntegerArray,
  validationResponse,
} from '@/lib/http/input-validation';

export async function POST(req: NextRequest, ctx: RouteContext<'/api/folders/[id]/bookmarks'>) {
  try {
    const { id } = await ctx.params;
    const folderId = positiveInteger(id, 'folder id');
    const body = await jsonObject(req);
    const bookmarkIds = positiveIntegerArray(body.bookmark_ids, 'bookmark_ids', 500);
    const placeholders = bookmarkIds.map(() => '?').join(', ');
    const result = rawDb.transaction(() => {
      const folder = rawDb.prepare('SELECT 1 FROM folders WHERE id = ?').get(folderId);
      if (!folder) return { missingFolder: true, missingBookmarks: [] as number[] };
      const found = new Set(
        (rawDb.prepare(`SELECT id FROM bookmarks WHERE id IN (${placeholders})`).all(...bookmarkIds) as { id: number }[])
          .map((row) => row.id),
      );
      const missingBookmarks = bookmarkIds.filter((bookmarkId) => !found.has(bookmarkId));
      if (missingBookmarks.length > 0) return { missingFolder: false, missingBookmarks };
      const insert = rawDb.prepare(
        'INSERT OR IGNORE INTO bookmark_folders (bookmark_id, folder_id) VALUES (?, ?)',
      );
      const assignment = rawDb.prepare(
        `INSERT INTO taxonomy_assignments
          (bookmark_id, kind, target_id, source, created_at, updated_at)
         VALUES (?, 'folder', ?, 'manual', unixepoch(), unixepoch())
         ON CONFLICT(bookmark_id, kind, target_id) DO UPDATE SET
           source = 'manual', agent_run_id = NULL, confidence = NULL,
           rationale = NULL, content_hash = NULL, updated_at = unixepoch()`,
      );
      for (const bookmarkId of bookmarkIds) {
        insert.run(bookmarkId, folderId);
        assignment.run(bookmarkId, folderId);
      }
      return { missingFolder: false, missingBookmarks: [] as number[] };
    })();
    if (result.missingFolder) return Response.json({ error: 'Folder not found' }, { status: 404 });
    if (result.missingBookmarks.length > 0) {
      return Response.json(
        { error: 'One or more bookmarks were not found', bookmark_ids: result.missingBookmarks },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, count: bookmarkIds.length });
  } catch (error) {
    const response = validationResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<'/api/folders/[id]/bookmarks'>,
) {
  try {
    const { id } = await ctx.params;
    const folderId = positiveInteger(id, 'folder id');
    const bookmarkId = positiveInteger(req.nextUrl.searchParams.get('bookmark_id'), 'bookmark_id');
    rawDb.transaction(() => {
      rawDb.prepare('DELETE FROM bookmark_folders WHERE folder_id = ? AND bookmark_id = ?').run(folderId, bookmarkId);
      rawDb
        .prepare(
          `DELETE FROM taxonomy_assignments
           WHERE bookmark_id = ? AND kind = 'folder' AND target_id = ?`,
        )
        .run(bookmarkId, folderId);
    }).immediate();
    return Response.json({ ok: true });
  } catch (error) {
    const response = validationResponse(error);
    if (response) return response;
    throw error;
  }
}
