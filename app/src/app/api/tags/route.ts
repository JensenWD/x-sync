import { rawDb } from '@/lib/db/client';
import { getTagFacets } from '@/lib/bookmark-query';

export async function GET() {
  return Response.json(getTagFacets(rawDb));
}
