import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

const dbPath = new URL('./concurrency.sqlite', import.meta.url).pathname;
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${dbPath}${suffix}`, { force: true });
}

const init = new DatabaseSync(dbPath);
init.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
`);
init.close();

function run(script, args) {
  const child = spawn(process.execPath, [new URL(script, import.meta.url).pathname, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  return { child, result: once(child, 'close').then(([code, signal]) => ({
    code,
    signal,
    stdout,
    stderr,
  })) };
}

const holder = run('writer_hold.mjs', [dbPath, '1500', 'holder']);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('holder did not acquire lock')), 5000);
  holder.child.stdout.on('data', (chunk) => {
    if (chunk.toString().includes('LOCK_ACQUIRED')) {
      clearTimeout(timer);
      resolve();
    }
  });
});

const immediate = run('writer_attempt.mjs', [dbPath, 'immediate', '0']);
const immediateResult = await immediate.result;

const reader = run('reader_once.mjs', [dbPath]);
const readerResult = await reader.result;

const waiting = run('writer_attempt.mjs', [dbPath, 'waiting', '3000']);
const waitingResult = await waiting.result;
const holderResult = await holder.result;

const db = new DatabaseSync(dbPath);
const rows = db.prepare('SELECT id, value FROM events ORDER BY id').all();
const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
db.close();

console.log(JSON.stringify({
  whileWriterHoldsLock: {
    immediateWriter: immediateResult,
    reader: readerResult,
  },
  waitingWriter: waitingResult,
  holder: holderResult,
  finalRows: rows,
  integrity,
}, null, 2));
