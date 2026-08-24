import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';
import {
  assignManual,
  manualTaxonomyResponse,
  upsertTagByName,
} from '@/lib/manual-taxonomy';
import {
  boundedName,
  jsonObject,
  positiveIntegerArray,
  validationResponse,
} from '@/lib/http/input-validation';

/**
 * Attaches one tag to a whole selection in a single transaction — the bulk
 * counterpart to `POST /api/bookmarks/[id]/tags`, which stays the single-post
 * path. Tagging a selection one request per post would leave the library
 * half-tagged whenever a request in the middle failed.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await jsonObject(req);
    const tagName = boundedName(body.name, 'name', 64).toLocaleLowerCase();
    const bookmarkIds = positiveIntegerArray(body.bookmark_ids, 'bookmark_ids', 500);

    const tag = rawDb.transaction(() => {
      const stored = upsertTagByName(rawDb, tagName);
      assignManual(rawDb, 'tag', stored.id, bookmarkIds);
      return stored;
    })();

    return Response.json({ ok: true, tag, count: bookmarkIds.length });
  } catch (error) {
    const response = validationResponse(error) ?? manualTaxonomyResponse(error);
    if (response) return response;
    throw error;
  }
}
