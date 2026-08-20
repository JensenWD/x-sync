import 'server-only';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

function createDb() {
  const configuredPath = process.env.X_SYNC_DB_PATH;
  const dbPath = configuredPath
    ? path.resolve(configuredPath)
    : path.join(process.cwd(), 'data', 'bookmarks.db');
  if (process.env.NODE_ENV === 'production' && !fs.existsSync(dbPath)) {
    throw new Error(`X-sync database is missing at ${dbPath}; refusing to create an empty replacement.`);
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return { db: drizzle(sqlite, { schema }), rawDb: sqlite };
}

// Singleton survives Next.js hot-reload in dev
type DbInstance = ReturnType<typeof createDb>;
const g = globalThis as typeof globalThis & { __xbm?: DbInstance };
const instance = g.__xbm ?? (g.__xbm = createDb());

export const db = instance.db;
export const rawDb = instance.rawDb;
