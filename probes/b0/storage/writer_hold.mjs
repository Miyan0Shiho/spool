import { DatabaseSync } from 'node:sqlite';

const [dbPath, holdMs, value] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
db.exec('BEGIN IMMEDIATE');
db.prepare('INSERT INTO events (value) VALUES (?)').run(value);
console.log('LOCK_ACQUIRED');

await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));

db.exec('COMMIT');
console.log('COMMITTED');
db.close();
