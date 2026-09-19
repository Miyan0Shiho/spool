import { spawn } from 'node:child_process';
import { existsSync, rmSync, statSync } from 'node:fs';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

const dbPath = new URL('./crash.sqlite', import.meta.url).pathname;
const writerPath = new URL('./crash_writer.mjs', import.meta.url).pathname;
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${dbPath}${suffix}`, { force: true });
}

async function killAfterOutput(args, marker, occurrence = 1) {
  const child = spawn(process.execPath, [writerPath, dbPath, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let count = 0;
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    count += String(chunk).split(marker).length - 1;
    if (count >= occurrence) resolveReady();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  await Promise.race([
    ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout waiting for ${marker}`)), 5000)),
  ]);
  child.kill('SIGKILL');
  const [code, signal] = await once(child, 'close');
  return { code, signal, stdout, stderr };
}

const committedCrash = await killAfterOutput([], 'COMMITTED ', 30);
const beforeReopenFiles = Object.fromEntries(
  ['', '-wal', '-shm'].map((suffix) => [
    suffix || 'main',
    existsSync(`${dbPath}${suffix}`) ? statSync(`${dbPath}${suffix}`).size : null,
  ]),
);

const reopened = new DatabaseSync(dbPath);
const recoveredPrefix = reopened.prepare(`
  SELECT
    COUNT(*) AS count,
    MIN(seq) AS minSeq,
    MAX(seq) AS maxSeq,
    COUNT(DISTINCT seq) AS distinctCount
  FROM events
`).get();
const gaps = reopened.prepare(`
  WITH RECURSIVE expected(seq) AS (
    SELECT 1
    UNION ALL
    SELECT seq + 1 FROM expected WHERE seq < (SELECT COALESCE(MAX(seq), 0) FROM events)
  )
  SELECT COUNT(*) AS count
  FROM expected
  LEFT JOIN events USING (seq)
  WHERE events.seq IS NULL
`).get();
const integrity = reopened.prepare('PRAGMA integrity_check').get().integrity_check;
const journalMode = reopened.prepare('PRAGMA journal_mode').get().journal_mode;
reopened.close();

const uncommittedCrash = await killAfterOutput(['uncommitted'], 'UNCOMMITTED');
const afterUncommitted = new DatabaseSync(dbPath);
const prefixAfterUncommitted = afterUncommitted.prepare(`
  SELECT COUNT(*) AS count, MAX(seq) AS maxSeq
  FROM events
`).get();
const hasUncommitted = afterUncommitted.prepare(
  'SELECT COUNT(*) AS count FROM events WHERE seq = 999999',
).get().count;
const finalIntegrity = afterUncommitted.prepare('PRAGMA integrity_check').get().integrity_check;
afterUncommitted.close();

console.log(JSON.stringify({
  committedCrash,
  beforeReopenFiles,
  recoveredPrefix,
  gaps,
  integrity,
  journalMode,
  uncommittedCrash,
  prefixAfterUncommitted,
  hasUncommitted,
  finalIntegrity,
}, null, 2));
