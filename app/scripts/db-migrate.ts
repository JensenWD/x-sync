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
    console.log(`Migration complete. Verified backup: ${backupPath}`);
  } finally {
    sqlite.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
