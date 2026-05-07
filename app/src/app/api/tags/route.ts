import { rawDb } from '@/lib/db/client';

export async function GET() {
  const rows = rawDb
    .prepare(
      `SELECT t.id, t.name, COUNT(bt.bookmark_id) as bookmark_count
       FROM tags t
       LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
       GROUP BY t.id
       ORDER BY t.name ASC`,
    )
    .all() as { id: number; name: string; bookmark_count: number }[];

  return Response.json(rows);
}
