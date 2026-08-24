import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';
import {
  assignManual,
  manualTaxonomyResponse,
  unassignManual,
  upsertTagByName,
} from '@/lib/manual-taxonomy';
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
      const stored = upsertTagByName(rawDb, tagName);
      assignManual(rawDb, 'tag', stored.id, [bookmarkId]);
      return stored;
    })();
    return Response.json({ ok: true, tag });
  } catch (error) {
    const response = validationResponse(error) ?? manualTaxonomyResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/bookmarks/[id]/tags'>) {
  try {
    const { id } = await ctx.params;
    const bookmarkId = positiveInteger(id, 'bookmark id');
    const tagId = positiveInteger(req.nextUrl.searchParams.get('tag_id'), 'tag_id');
    rawDb.transaction(() => unassignManual(rawDb, 'tag', tagId, bookmarkId)).immediate();
    return Response.json({ ok: true });
  } catch (error) {
    const response = validationResponse(error);
    if (response) return response;
    throw error;
  }
}
