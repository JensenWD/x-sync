import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { autoTagMissingBookmarks } from '../src/lib/auto-tag';

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
  try {
    const before = sqlite.pragma('quick_check', { simple: true });
    if (before !== 'ok') throw new Error(`Database quick_check failed: ${before}`);
    const result = await autoTagMissingBookmarks(sqlite);
    const after = sqlite.pragma('quick_check', { simple: true });
    if (after !== 'ok') throw new Error(`Database quick_check failed after auto-tagging: ${after}`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    sqlite.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
