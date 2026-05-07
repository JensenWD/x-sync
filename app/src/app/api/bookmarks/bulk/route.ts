import { rawDb } from '@/lib/db/client';
import { NextRequest } from 'next/server';

interface BulkBody {
  ids: number[];
  action: 'archive' | 'add_tags' | 'add_folders';
  tags?: string[];
  folder_ids?: number[];
}

function sanitizeIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const ids: number[] = [];
  for (const v of input) {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (Number.isFinite(n) && n > 0) ids.push(n);
  }
  return ids;
}

export async function POST(req: NextRequest) {
  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ids = sanitizeIds(body.ids);
  if (ids.length === 0) {
    return Response.json({ error: 'ids array is required' }, { status: 400 });
  }

  const placeholders = ids.map(() => '?').join(',');

  switch (body.action) {
    case 'archive': {
      const stmt = rawDb.prepare(
        `UPDATE bookmarks SET archived_at = unixepoch(), updated_at = unixepoch()
         WHERE id IN (${placeholders}) AND archived_at IS NULL`,
      );
      const result = stmt.run(...ids);
      return Response.json({ ok: true, archived: result.changes });
    }

    case 'add_tags': {
      const names = (body.tags ?? [])
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean);
      if (names.length === 0) {
        return Response.json({ error: 'tags array is required' }, { status: 400 });
      }

      const getOrCreateTag = rawDb.prepare(
        `INSERT INTO tags (name, created_at) VALUES (?, unixepoch())
         ON CONFLICT(name) DO UPDATE SET name = excluded.name
         RETURNING id`,
      );
      const insertAssoc = rawDb.prepare(
        `INSERT INTO bookmark_tags (bookmark_id, tag_id, source) VALUES (?, ?, 'manual')
         ON CONFLICT(bookmark_id, tag_id) DO UPDATE SET source = 'manual'`,
      );

      const apply = rawDb.transaction(() => {
        let added = 0;
        for (const name of names) {
          const tag = getOrCreateTag.get(name) as { id: number };
          for (const bookmarkId of ids) {
            const result = insertAssoc.run(bookmarkId, tag.id);
            if (result.changes > 0) added++;
          }
        }
        return added;
      });
      const added = apply();
      return Response.json({ ok: true, added });
    }

    case 'add_folders': {
      const folderIds = sanitizeIds(body.folder_ids);
      if (folderIds.length === 0) {
        return Response.json({ error: 'folder_ids array is required' }, { status: 400 });
      }

      const insertAssoc = rawDb.prepare(
        `INSERT INTO bookmark_folders (bookmark_id, folder_id) VALUES (?, ?)
         ON CONFLICT(bookmark_id, folder_id) DO NOTHING`,
      );

      const apply = rawDb.transaction(() => {
        let added = 0;
        for (const folderId of folderIds) {
          for (const bookmarkId of ids) {
            const result = insertAssoc.run(bookmarkId, folderId);
            if (result.changes > 0) added++;
          }
        }
        return added;
      });
      const added = apply();
      return Response.json({ ok: true, added });
    }

    default:
      return Response.json({ error: 'Unknown action' }, { status: 400 });
  }
}
