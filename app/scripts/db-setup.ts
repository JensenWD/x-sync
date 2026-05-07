import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, 'bookmarks.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);

// Run Drizzle migrations
migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
console.log('✓ Migrations applied');

// Create FTS5 virtual table and triggers
sqlite.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
    full_text,
    author_name,
    author_handle,
    content='bookmarks',
    content_rowid='id',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS bookmarks_ai
  AFTER INSERT ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(rowid, full_text, author_name, author_handle)
    VALUES (new.id, new.full_text, new.author_name, new.author_handle);
  END;

  CREATE TRIGGER IF NOT EXISTS bookmarks_ad
  AFTER DELETE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, full_text, author_name, author_handle)
    VALUES ('delete', old.id, old.full_text, old.author_name, old.author_handle);
  END;

  CREATE TRIGGER IF NOT EXISTS bookmarks_au_before
  BEFORE UPDATE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, full_text, author_name, author_handle)
    VALUES ('delete', old.id, old.full_text, old.author_name, old.author_handle);
  END;

  CREATE TRIGGER IF NOT EXISTS bookmarks_au_after
  AFTER UPDATE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(rowid, full_text, author_name, author_handle)
    VALUES (new.id, new.full_text, new.author_name, new.author_handle);
  END;
`);
console.log('✓ FTS5 table and triggers created');

const tables = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[];
console.log('Tables:', tables.map((t) => t.name).join(', '));

sqlite.close();
console.log('✓ Database setup complete');
