import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
const configuredPath = process.env.X_SYNC_DB_PATH;
const dbPath = configuredPath ? path.resolve(configuredPath) : path.join(dataDir, 'bookmarks.db');
const allowCreate = process.argv.includes('--create');
if (!fs.existsSync(dbPath) && !allowCreate) {
  throw new Error(
    `Database is missing at ${dbPath}. Refusing to create an empty replacement; use db:init only for an intentional new database.`,
  );
}
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);

// Run Drizzle migrations
migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
console.log('✓ Migrations applied');

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
  (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[]).map(
    (row) => row.name,
  ),
);
const missingTriggers = expectedTriggers.filter((name) => !installedTriggers.has(name));
if (missingTriggers.length > 0) {
  throw new Error(`FTS trigger verification failed; missing: ${missingTriggers.join(', ')}`);
}
console.log('✓ Versioned FTS5 tables and triggers verified');

const tables = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[];
console.log('Tables:', tables.map((t) => t.name).join(', '));

sqlite.close();
console.log('✓ Database setup complete');
