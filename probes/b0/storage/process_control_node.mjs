import { spawn } from 'node:child_process';
import { once } from 'node:events';

const child = spawn(process.execPath, [
  '-e',
  "console.log('CHILD_READY'); setInterval(() => {}, 1000)",
], {
  detached: true,
  stdio: ['ignore', 'pipe', 'ignore'],
});

let stdout = '';
await new Promise((resolve) => {
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('CHILD_READY')) resolve();
  });
});

process.kill(-child.pid, 'SIGTERM');
const [code, signal] = await once(child, 'close');
console.log(JSON.stringify({ pid: child.pid, ready: stdout.trim(), code, signal }));
