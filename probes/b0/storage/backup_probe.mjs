import { backup, DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';

const sourcePath = new URL('./backup-source.sqlite', import.meta.url).pathname;
const backupPath = new URL('./backup-copy.sqlite', import.meta.url).pathname;
for (const path of [sourcePath, backupPath]) {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${path}${suffix}`, { force: true });
  }
}

const source = new DatabaseSync(sourcePath);
source.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
`);
const insert = source.prepare('INSERT INTO events (value) VALUES (?)');
for (let i = 1; i <= 10; i += 1) insert.run(`event-${i}`);

await backup(source, backupPath);

const copy = new DatabaseSync(backupPath);
const result = {
  sourceCount: source.prepare('SELECT COUNT(*) AS count FROM events').get().count,
  backupCount: copy.prepare('SELECT COUNT(*) AS count FROM events').get().count,
  backupIntegrity: copy.prepare('PRAGMA integrity_check').get().integrity_check,
  backupUserVersion: copy.prepare('PRAGMA user_version').get().user_version,
};

copy.close();
source.close();
console.log(JSON.stringify(result, null, 2));
