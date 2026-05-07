import { rawDb } from '@/lib/db/client';
import { db } from '@/lib/db/client';
import { folders } from '@/lib/db/schema';
import { NextRequest } from 'next/server';

export async function GET() {
  const rows = rawDb
    .prepare(
      `SELECT f.id, f.name, f.color, COUNT(bf.bookmark_id) as bookmark_count
       FROM folders f
       LEFT JOIN bookmark_folders bf ON bf.folder_id = f.id
       GROUP BY f.id
       ORDER BY f.name ASC`,
    )
    .all() as { id: number; name: string; color: string | null; bookmark_count: number }[];

  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, color } = await req.json();
  if (!name?.trim()) return Response.json({ error: 'name is required' }, { status: 400 });

  const inserted = await db
    .insert(folders)
    .values({ name: name.trim(), color: color ?? null })
    .returning();

  return Response.json(inserted[0], { status: 201 });
}
