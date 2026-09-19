import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';

const dbPath = new URL('./migration.sqlite', import.meta.url).pathname;
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${dbPath}${suffix}`, { force: true });
}

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  BEGIN IMMEDIATE;
  CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
  PRAGMA user_version = 1;
  COMMIT;
`);

const before = {
  userVersion: db.prepare('PRAGMA user_version').get().user_version,
  columns: db.prepare('PRAGMA table_info(events)').all().map((row) => row.name),
};

db.exec(`
  BEGIN IMMEDIATE;
  ALTER TABLE events ADD COLUMN kind TEXT NOT NULL DEFAULT 'event';
  PRAGMA user_version = 2;
  COMMIT;
`);

db.exec(`
  BEGIN IMMEDIATE;
  ALTER TABLE events ADD COLUMN rolled_back_column TEXT;
  PRAGMA user_version = 3;
  ROLLBACK;
`);

const after = {
  userVersion: db.prepare('PRAGMA user_version').get().user_version,
  columns: db.prepare('PRAGMA table_info(events)').all().map((row) => row.name),
  integrity: db.prepare('PRAGMA integrity_check').get().integrity_check,
};
db.close();

const reopened = new DatabaseSync(dbPath);
const restarted = {
  userVersion: reopened.prepare('PRAGMA user_version').get().user_version,
  columns: reopened.prepare('PRAGMA table_info(events)').all().map((row) => row.name),
};
reopened.close();

console.log(JSON.stringify({ before, after, restarted }, null, 2));
