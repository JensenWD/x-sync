import type Database from 'better-sqlite3';

export type TaxonomyKind = 'tag' | 'folder';

const ASSOCIATION = {
  tag: { table: 'bookmark_tags', column: 'tag_id' },
  folder: { table: 'bookmark_folders', column: 'folder_id' },
} as const;

export class ManualTaxonomyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ManualTaxonomyError';
  }
}

/**
 * Every bookmark id must exist before anything is written — a partially applied
 * bulk action is worse than a rejected one.
 */
function requireBookmarks(sqlite: Database.Database, bookmarkIds: number[]) {
  const placeholders = bookmarkIds.map(() => '?').join(', ');
  const found = new Set(
    (
      sqlite
        .prepare(`SELECT id FROM bookmarks WHERE id IN (${placeholders})`)
        .all(...bookmarkIds) as { id: number }[]
    ).map((row) => row.id),
  );
  const missing = bookmarkIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ManualTaxonomyError('One or more bookmarks were not found', 404, {
      bookmark_ids: missing,
    });
  }
}

/**
 * Attaches a tag or folder to one or many bookmarks as a **manual** assignment.
 *
 * `taxonomy_assignments.source = 'manual'` with the agent columns cleared is
 * what `agent-taxonomy` keys its "an agent may not remove what a person
 * assigned" protection off, so this write is the single definition of that
 * contract rather than something each route restates.
 *
 * Callers pass their own `Database.Database` so this stays unit-testable; the
 * routes inject `rawDb`.
 */
export function assignManual(
  sqlite: Database.Database,
  kind: TaxonomyKind,
  targetId: number,
  bookmarkIds: number[],
) {
  const { table, column } = ASSOCIATION[kind];
  requireBookmarks(sqlite, bookmarkIds);

  const associate = sqlite.prepare(
    `INSERT OR IGNORE INTO ${table} (bookmark_id, ${column}) VALUES (?, ?)`,
  );
  const assign = sqlite.prepare(
    `INSERT INTO taxonomy_assignments
      (bookmark_id, kind, target_id, source, created_at, updated_at)
     VALUES (?, ?, ?, 'manual', unixepoch(), unixepoch())
     ON CONFLICT(bookmark_id, kind, target_id) DO UPDATE SET
       source = 'manual', agent_run_id = NULL, confidence = NULL,
       rationale = NULL, content_hash = NULL, updated_at = unixepoch()`,
  );

  for (const bookmarkId of bookmarkIds) {
    associate.run(bookmarkId, targetId);
    assign.run(bookmarkId, kind, targetId);
  }
}

/** Detaches a tag or folder from one bookmark, assignment record included. */
export function unassignManual(
  sqlite: Database.Database,
  kind: TaxonomyKind,
  targetId: number,
  bookmarkId: number,
) {
  const { table, column } = ASSOCIATION[kind];
  sqlite
    .prepare(`DELETE FROM ${table} WHERE bookmark_id = ? AND ${column} = ?`)
    .run(bookmarkId, targetId);
  sqlite
    .prepare('DELETE FROM taxonomy_assignments WHERE bookmark_id = ? AND kind = ? AND target_id = ?')
    .run(bookmarkId, kind, targetId);
}

/** Creates the tag if this is the first time the name has been used. */
export function upsertTagByName(sqlite: Database.Database, name: string) {
  sqlite.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING').run(name);
  const tag = sqlite.prepare('SELECT id, name, created_at FROM tags WHERE name = ?').get(name) as
    | { id: number; name: string; created_at: number }
    | undefined;
  if (!tag) throw new ManualTaxonomyError('Tag creation failed', 500);
  return tag;
}

export function manualTaxonomyResponse(error: unknown) {
  if (!(error instanceof ManualTaxonomyError)) return null;
  return Response.json({ error: error.message, ...error.detail }, { status: error.status });
}
