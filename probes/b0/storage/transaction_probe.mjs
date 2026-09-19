import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';

const dbPath = new URL('./transaction.sqlite', import.meta.url).pathname;
rmSync(dbPath, { force: true });
rmSync(`${dbPath}-wal`, { force: true });
rmSync(`${dbPath}-shm`, { force: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const insert = db.prepare('INSERT INTO events (value) VALUES (?)');

db.exec('BEGIN IMMEDIATE');
insert.run('committed');
db.exec('COMMIT');

db.exec('BEGIN IMMEDIATE');
insert.run('rolled-back');
db.exec('ROLLBACK');

const result = {
  journalMode: db.prepare('PRAGMA journal_mode').get().journal_mode,
  synchronous: db.prepare('PRAGMA synchronous').get().synchronous,
  rows: db.prepare('SELECT id, value FROM events ORDER BY id').all(),
  integrity: db.prepare('PRAGMA integrity_check').get().integrity_check,
  foreignKeys: db.prepare('PRAGMA foreign_keys').get().foreign_keys,
};

console.log(JSON.stringify(result, null, 2));
db.close();
