import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';
import { assignManual, manualTaxonomyResponse, unassignManual } from '@/lib/manual-taxonomy';
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

    const missingFolder = rawDb.transaction(() => {
      if (!rawDb.prepare('SELECT 1 FROM folders WHERE id = ?').get(folderId)) return true;
      assignManual(rawDb, 'folder', folderId, bookmarkIds);
      return false;
    })();

    if (missingFolder) return Response.json({ error: 'Folder not found' }, { status: 404 });
    return Response.json({ ok: true, count: bookmarkIds.length });
  } catch (error) {
    const response = validationResponse(error) ?? manualTaxonomyResponse(error);
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
    rawDb.transaction(() => unassignManual(rawDb, 'folder', folderId, bookmarkId)).immediate();
    return Response.json({ ok: true });
  } catch (error) {
    const response = validationResponse(error);
    if (response) return response;
    throw error;
  }
}
