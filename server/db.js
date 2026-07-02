// SQLite (built-in node:sqlite) with a simple migration runner.
// Swap-out path to Postgres is documented in PLATFORM.md — all SQL is kept portable.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db;

export function openDb(file = process.env.DATABASE_FILE || path.join(__dirname, '..', 'var', 'core.db')) {
  if (db) return db;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(database) {
  database.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(database.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  const dir = path.join(__dirname, 'migrations');
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.sql') || applied.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    database.exec('BEGIN');
    try {
      database.exec(sql);
      database.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, datetime(\'now\'))').run(name);
      database.exec('COMMIT');
    } catch (err) {
      database.exec('ROLLBACK');
      throw new Error(`Migration ${name} failed: ${err.message}`);
    }
  }
}

export function getDb() {
  if (!db) openDb();
  return db;
}

// Convenience helpers
export const q = {
  get: (sql, ...params) => getDb().prepare(sql).get(...params),
  all: (sql, ...params) => getDb().prepare(sql).all(...params),
  run: (sql, ...params) => getDb().prepare(sql).run(...params),
};

export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}
