import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const runRoot = mkdtempSync(join(root, "cancel-run-"));
const rawDir = join(root, "raw");
mkdirSync(rawDir, { recursive: true });
const eventsPath = join(rawDir, "cancel-events.ndjson");
writeFileSync(eventsPath, "");

function event(name, data) {
  const row = { at: new Date().toISOString(), name, ...data };
  appendFileSync(eventsPath, `${JSON.stringify(row)}\n`);
  console.log(JSON.stringify(row));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function groupRows(pgid) {
  const result = spawnSync(
    "/bin/ps",
    ["-axo", "pid=,ppid=,pgid=,state=,lstart=,command="],
    { encoding: "utf8" },
  );
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(
        /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/,
      );
      return match
        ? {
            pid: Number(match[1]),
            ppid: Number(match[2]),
            pgid: Number(match[3]),
            state: match[4],
            lstart: match[5],
            command: match[6],
          }
        : null;
    })
    .filter((row) => row && row.pgid === pgid);
}

async function waitForFile(path, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return Number(readFileSync(path, "utf8").trim());
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${path}`);
}

async function main() {
  const grandchildPath = join(runRoot, "grandchild.pid");
  const profilePath = join(root, "profiles", "workspace-write.sb");
  const command =
    `trap 'exit 143' TERM; /bin/sleep 300 & echo $! > ${grandchildPath}; wait`;
  const child = spawn(
    "/usr/bin/sandbox-exec",
    [
      "-f",
      profilePath,
      "-D",
      `WORKSPACE=${runRoot}`,
      "--",
      "/bin/sh",
      "-c",
      command,
    ],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const lifecycle = { exit: null, close: null };
  child.once("exit", (code, signal) => {
    lifecycle.exit = { code, signal };
  });
  child.once("close", (code, signal) => {
    lifecycle.close = { code, signal };
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const grandchildPid = await waitForFile(grandchildPath);
  const before = groupRows(child.pid);
  event("before-cancel", {
    runnerPid: child.pid,
    grandchildPid,
    pgid: child.pid,
    group: before,
  });

  process.kill(-child.pid, "SIGTERM");
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline && !lifecycle.close) {
    await sleep(20);
  }
  await sleep(250);
  const after = groupRows(child.pid);
  event("after-cancel", {
    runnerPid: child.pid,
    grandchildPid,
    pgid: child.pid,
    lifecycle,
    timedOutWaitingForClose: !lifecycle.close,
    stdout,
    stderr,
    group: after,
  });

  if (after.length > 0) {
    process.kill(-child.pid, "SIGKILL");
    await sleep(250);
  }
  event("quiescence", {
    runnerPid: child.pid,
    pgid: child.pid,
    group: groupRows(child.pid),
  });
}

main().catch((error) => {
  event("probe-failure", { message: error.message, stack: error.stack });
  process.exitCode = 1;
});
