import { DatabaseSync } from 'node:sqlite';

const [dbPath, mode] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  PRAGMA busy_timeout = 3000;
  CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

if (mode === 'uncommitted') {
  db.exec('BEGIN IMMEDIATE');
  db.prepare('INSERT INTO events (seq, value) VALUES (?, ?)').run(999999, 'uncommitted');
  console.log('UNCOMMITTED');
  await new Promise(() => {});
}

const insert = db.prepare('INSERT INTO events (seq, value) VALUES (?, ?)');
let seq = 0;
while (true) {
  seq += 1;
  db.exec('BEGIN IMMEDIATE');
  insert.run(seq, `committed-${seq}`);
  db.exec('COMMIT');
  console.log(`COMMITTED ${seq}`);
  await new Promise((resolve) => setTimeout(resolve, 5));
}
