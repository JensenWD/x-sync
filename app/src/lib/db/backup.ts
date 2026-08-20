import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export async function createVerifiedDatabaseBackup(
  sqlite: Database.Database,
  label: string,
) {
  if (!/^[a-z0-9-]{1,40}$/u.test(label)) throw new Error('Invalid database backup label');
  const configuredPath = process.env.X_SYNC_DB_PATH;
  const dbPath = configuredPath
    ? path.resolve(configuredPath)
    : path.join(process.cwd(), 'data', 'bookmarks.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database is missing at ${dbPath}; refusing to create a misleading backup.`);
  }
  const backupDirectory = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupDirectory, 0o700);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
  const backupPath = path.join(backupDirectory, `bookmarks-${label}-${stamp}.db`);
  await sqlite.backup(backupPath);
  fs.chmodSync(backupPath, 0o600);

  const backup = new Database(backupPath, { readonly: true });
  try {
    const check = backup.pragma('quick_check', { simple: true });
    if (check !== 'ok') throw new Error(`Backup quick_check failed: ${check}`);
  } finally {
    backup.close();
  }
  return backupPath;
}
