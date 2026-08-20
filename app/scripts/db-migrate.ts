import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const configuredPath = process.env.X_SYNC_DB_PATH;
  const dbPath = configuredPath
    ? path.resolve(configuredPath)
    : path.join(process.cwd(), 'data', 'bookmarks.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database is missing at ${dbPath}; refusing to create an empty replacement.`);
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('foreign_keys = ON');
  const beforeCheck = sqlite.pragma('quick_check', { simple: true });
  if (beforeCheck !== 'ok') throw new Error(`Database quick_check failed before migration: ${beforeCheck}`);

  const backupsDir = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
  const backupPath = path.join(backupsDir, `bookmarks-pre-migrate-${stamp}.db`);
  await sqlite.backup(backupPath);
  fs.chmodSync(backupPath, 0o600);

  try {
    migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    const afterCheck = sqlite.pragma('quick_check', { simple: true });
    if (afterCheck !== 'ok') throw new Error(`Database quick_check failed after migration: ${afterCheck}`);
    const foreignKeyIssues = sqlite.pragma('foreign_key_check') as unknown[];
    if (foreignKeyIssues.length > 0) {
      throw new Error(`Database has ${foreignKeyIssues.length} foreign-key violations after migration.`);
    }
    const bookmarkCount = Number(
      (sqlite.prepare('SELECT COUNT(*) AS count FROM bookmarks').get() as { count: number }).count,
    );
    const ftsCount = Number(
      (sqlite.prepare('SELECT COUNT(*) AS count FROM bookmarks_fts').get() as { count: number }).count,
    );
    if (bookmarkCount !== ftsCount) {
      throw new Error(`FTS verification failed: ${ftsCount} indexed rows for ${bookmarkCount} bookmarks`);
    }
    const enrichmentCount = Number(
      (sqlite.prepare('SELECT COUNT(*) AS count FROM bookmark_enrichments').get() as { count: number }).count,
    );
    const enrichmentFtsCount = Number(
      (sqlite.prepare('SELECT COUNT(*) AS count FROM bookmark_enrichments_fts').get() as { count: number }).count,
    );
    if (enrichmentCount !== enrichmentFtsCount) {
      throw new Error(
        `Enrichment FTS verification failed: ${enrichmentFtsCount} indexed rows for ${enrichmentCount} enrichments`,
      );
    }
    const expectedTriggers = [
      'bookmarks_ai',
      'bookmarks_ad',
      'bookmarks_au',
      'bookmark_enrichments_ai',
      'bookmark_enrichments_ad',
      'bookmark_enrichments_au',
    ];
    const installedTriggers = new Set(
      (sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .all() as { name: string }[]).map((row) => row.name),
    );
    const missingTriggers = expectedTriggers.filter((name) => !installedTriggers.has(name));
    if (missingTriggers.length > 0) {
      throw new Error(`FTS trigger verification failed; missing: ${missingTriggers.join(', ')}`);
    }
    console.log(`Migration complete. Verified backup: ${backupPath}`);
  } finally {
    sqlite.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
