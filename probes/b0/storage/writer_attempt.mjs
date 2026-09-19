import { DatabaseSync } from 'node:sqlite';

const [dbPath, value, busyTimeoutMs] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);

try {
  db.exec(`PRAGMA busy_timeout = ${Number(busyTimeoutMs)}`);
  db.exec('BEGIN IMMEDIATE');
  db.prepare('INSERT INTO events (value) VALUES (?)').run(value);
  db.exec('COMMIT');
  console.log(JSON.stringify({ ok: true, value, busyTimeoutMs: Number(busyTimeoutMs) }));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    value,
    busyTimeoutMs: Number(busyTimeoutMs),
    name: error.name,
    code: error.code,
    errcode: error.errcode,
    errstr: error.errstr,
    message: error.message,
  }, null, 2));
  process.exitCode = 1;
} finally {
  db.close();
}
