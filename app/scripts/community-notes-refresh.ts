import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { refreshCommunityNotes } from '../src/lib/community-notes/cache';

async function main() {
  const configured = process.env.X_SYNC_DB_PATH;
  const dbPath = configured ? path.resolve(configured) : path.join(process.cwd(), 'data', 'bookmarks.db');
  if (!fs.existsSync(dbPath)) throw new Error(`Database is missing at ${dbPath}`);
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  try {
    const result = await refreshCommunityNotes(sqlite, { force: process.argv.includes('--force') });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'failed') process.exitCode = 1;
  } finally {
    sqlite.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
