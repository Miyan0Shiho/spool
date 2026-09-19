import { DatabaseSync } from 'node:sqlite';
import { existsSync, rmSync, statSync } from 'node:fs';

const dbPath = new URL('./wal.sqlite', import.meta.url).pathname;
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${dbPath}${suffix}`, { force: true });
}

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  PRAGMA wal_autocheckpoint = 1000;
  CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
  INSERT INTO events (value) VALUES ('before-close');
`);

const beforeClose = {
  journalMode: db.prepare('PRAGMA journal_mode').get().journal_mode,
  synchronous: db.prepare('PRAGMA synchronous').get().synchronous,
  walAutocheckpoint: db.prepare('PRAGMA wal_autocheckpoint').get().wal_autocheckpoint,
  lockingMode: db.prepare('PRAGMA locking_mode').get().locking_mode,
  files: Object.fromEntries(
    ['', '-wal', '-shm'].map((suffix) => [
      suffix || 'main',
      existsSync(`${dbPath}${suffix}`) ? statSync(`${dbPath}${suffix}`).size : null,
    ]),
  ),
};

db.close();

const afterClose = {
  files: Object.fromEntries(
    ['', '-wal', '-shm'].map((suffix) => [
      suffix || 'main',
      existsSync(`${dbPath}${suffix}`) ? statSync(`${dbPath}${suffix}`).size : null,
    ]),
  ),
};

const reopened = new DatabaseSync(dbPath);
const result = {
  beforeClose,
  afterClose,
  reopenedRows: reopened.prepare('SELECT id, value FROM events ORDER BY id').all(),
  reopenedJournalMode: reopened.prepare('PRAGMA journal_mode').get().journal_mode,
};
reopened.close();

console.log(JSON.stringify(result, null, 2));
