import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';
import {
  boundedName,
  jsonObject,
  optionalHexColor,
  positiveInteger,
  validationResponse,
} from '@/lib/http/input-validation';

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/folders/[id]'>) {
  try {
    const { id } = await ctx.params;
    const folderId = positiveInteger(id, 'folder id');
    const body = await jsonObject(req);
    const name = boundedName(body.name, 'name', 80);
    const color = optionalHexColor(body.color);
    const duplicate = rawDb
      .prepare('SELECT 1 FROM folders WHERE lower(name) = lower(?) AND id <> ?')
      .get(name, folderId);
    if (duplicate) return Response.json({ error: 'A folder with that name already exists' }, { status: 409 });
    const updated = rawDb
      .prepare(
        `UPDATE folders SET name = ?, color = ?, updated_at = unixepoch()
         WHERE id = ? RETURNING *`,
      )
      .get(name, color, folderId);
    if (!updated) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(updated);
  } catch (error) {
    const response = validationResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/folders/[id]'>) {
  try {
    const { id } = await ctx.params;
    const folderId = positiveInteger(id, 'folder id');
    const result = rawDb.transaction(() => {
      const deleted = rawDb.prepare('DELETE FROM folders WHERE id = ?').run(folderId);
      if (deleted.changes > 0) {
        rawDb
          .prepare(`DELETE FROM taxonomy_assignments WHERE kind = 'folder' AND target_id = ?`)
          .run(folderId);
      }
      return deleted;
    }).immediate();
    if (result.changes === 0) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    const response = validationResponse(error);
    if (response) return response;
    throw error;
  }
}
