import 'server-only';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';

function createDb() {
  const sqlite = new Database(path.join(process.cwd(), 'data', 'bookmarks.db'));
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
