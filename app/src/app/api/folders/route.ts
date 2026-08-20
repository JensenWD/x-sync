import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';
import {
  boundedName,
  jsonObject,
  optionalHexColor,
  validationResponse,
} from '@/lib/http/input-validation';

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
  try {
    const body = await jsonObject(req);
    const name = boundedName(body.name, 'name', 80);
    const color = optionalHexColor(body.color);
    const duplicate = rawDb.prepare('SELECT 1 FROM folders WHERE lower(name) = lower(?)').get(name);
    if (duplicate) return Response.json({ error: 'A folder with that name already exists' }, { status: 409 });
    const inserted = rawDb
      .prepare(
        `INSERT INTO folders (name, color, created_at, updated_at)
         VALUES (?, ?, unixepoch(), unixepoch()) RETURNING *`,
      )
      .get(name, color);
    return Response.json(inserted, { status: 201 });
  } catch (error) {
    const response = validationResponse(error);
    if (response) return response;
    throw error;
  }
}
