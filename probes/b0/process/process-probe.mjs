import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const rawDir = join(root, "raw");
const runRoot = mkdtempSync(join(root, "run-"));
mkdirSync(rawDir, { recursive: true });

const helper = join(root, "pid-identity");
const eventsPath = join(rawDir, "events.ndjson");
writeFileSync(eventsPath, "");

function event(name, data) {
  const row = { at: new Date().toISOString(), name, ...data };
  appendFileSync(eventsPath, `${JSON.stringify(row)}\n`);
  console.log(JSON.stringify(row));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 5_000, stepMs = 25) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await sleep(stepMs);
  }
  throw new Error(`timed out after ${timeoutMs}ms`);
}

function readPid(path) {
  if (!existsSync(path)) return null;
  const parsed = Number(readFileSync(path, "utf8").trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function identity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const probe = spawnSync(helper, [String(pid)], { encoding: "utf8" });
  if (probe.status !== 0) return null;
  const fields = Object.fromEntries(
    probe.stdout
      .trim()
      .split(/\s+/)
      .map((part) => {
        const splitAt = part.indexOf("=");
        return [part.slice(0, splitAt), part.slice(splitAt + 1)];
      }),
  );
  return {
    pid: Number(fields.pid),
    ppid: Number(fields.ppid),
    pgid: Number(fields.pgid),
    startSec: Number(fields.start_sec),
    startUsec: Number(fields.start_usec),
    status: Number(fields.status),
    comm: fields.comm,
  };
}

function processSnapshot(pgid, knownPids = []) {
  const ps = spawnSync(
    "/bin/ps",
    ["-axo", "pid=,ppid=,pgid=,state=,lstart=,command="],
    { encoding: "utf8" },
  );
  const rows = ps.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(
        /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/,
      );
      if (!match) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        state: match[4],
        lstart: match[5],
        command: match[6],
      };
    })
    .filter(Boolean);
  return {
    raw: ps.stdout.trim(),
    groupRows: rows.filter((row) => row.pgid === pgid),
    knownRows: rows.filter((row) => knownPids.includes(row.pid)),
    commandMatches: rows.filter((row) => row.command.includes(root)),
  };
}

async function waitClose(child, timeoutMs = 4_000, stepMs = 10) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.lifecycle?.close) {
      return { ...child.lifecycle.close, exit: child.lifecycle.exit };
    }
    if (!child.lifecycle && (child.exitCode !== null || child.signalCode !== null)) {
      return { code: child.exitCode, signal: child.signalCode };
    }
    await sleep(stepMs);
  }
  return {
    timeout: true,
    exit: child.lifecycle?.exit ?? null,
  };
}

function spawnGroup(label, command) {
  const child = spawn("/bin/sh", ["-c", command], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.lifecycle = { exit: null, close: null };
  child.once("exit", (code, signal) => {
    child.lifecycle.exit = { code, signal };
  });
  child.once("close", (code, signal) => {
    child.lifecycle.close = { code, signal };
  });
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
  event("spawn", {
    label,
    pid: child.pid,
    assumedPgid: child.pid,
    identity: identity(child.pid),
  });
  return { child, readOutput: () => ({ stdout, stderr }) };
}

async function ensureGroupGone(pgid, knownPids, label) {
  let snapshot = processSnapshot(pgid, knownPids);
  if (snapshot.groupRows.length === 0 && snapshot.knownRows.length === 0) {
    event("quiescence", { label, pgid, quiescent: true, snapshot });
    return true;
  }

  try {
    process.kill(-pgid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  await sleep(300);
  snapshot = processSnapshot(pgid, knownPids);
  if (snapshot.groupRows.length === 0 && snapshot.knownRows.length === 0) {
    event("quiescence", {
      label,
      pgid,
      quiescent: true,
      cleanupSignal: "SIGTERM",
      snapshot,
    });
    return true;
  }

  try {
    process.kill(-pgid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  await sleep(300);
  snapshot = processSnapshot(pgid, knownPids);
  const quiescent = snapshot.groupRows.length === 0 && snapshot.knownRows.length === 0;
  event("quiescence", {
    label,
    pgid,
    quiescent,
    cleanupSignal: "SIGKILL",
    snapshot,
  });
  return quiescent;
}

async function groupCancel() {
  const marker = join(runRoot, "group-cancel");
  const grandchildPath = `${marker}.sleep.pid`;
  const group = spawnGroup(
    "group-cancel",
    `trap 'exit 143' TERM; /bin/sleep 300 & echo $! > ${grandchildPath}; wait`,
  );
  const grandchildPid = await waitFor(() => readPid(grandchildPath));
  const before = processSnapshot(group.child.pid, [group.child.pid, grandchildPid]);
  event("before-cancel", {
    label: "group-cancel",
    pgid: group.child.pid,
    grandchildPid,
    grandchildIdentity: identity(grandchildPid),
    snapshot: before,
  });
  process.kill(-group.child.pid, "SIGTERM");
  const exit = await waitClose(group.child);
  await sleep(300);
  const after = processSnapshot(group.child.pid, [group.child.pid, grandchildPid]);
  event("after-cancel", {
    label: "group-cancel",
    pgid: group.child.pid,
    grandchildPid,
    exit,
    output: group.readOutput(),
    grandchildIdentityAfter: identity(grandchildPid),
    snapshot: after,
  });
}

async function pidOnlyCancel() {
  const marker = join(runRoot, "pid-only");
  const grandchildPath = `${marker}.sleep.pid`;
  const group = spawnGroup(
    "pid-only-cancel",
    `/bin/sleep 300 & echo $! > ${grandchildPath}; wait`,
  );
  const grandchildPid = await waitFor(() => readPid(grandchildPath));
  const before = processSnapshot(group.child.pid, [group.child.pid, grandchildPid]);
  event("before-cancel", {
    label: "pid-only-cancel",
    pgid: group.child.pid,
    grandchildPid,
    grandchildIdentity: identity(grandchildPid),
    snapshot: before,
  });
  process.kill(group.child.pid, "SIGTERM");
  const exit = await waitClose(group.child);
  await sleep(300);
  const after = processSnapshot(group.child.pid, [group.child.pid, grandchildPid]);
  event("after-cancel", {
    label: "pid-only-cancel",
    pgid: group.child.pid,
    grandchildPid,
    exit,
    output: group.readOutput(),
    grandchildIdentityAfter: identity(grandchildPid),
    snapshot: after,
  });
  await ensureGroupGone(group.child.pid, [group.child.pid, grandchildPid], "pid-only-cleanup");
}

async function parentLifecycle(mode) {
  const marker = join(runRoot, `${mode}-descendant`);
  const recordPath = `${marker}.json`;
  const sleepPidPath = `${marker}.sleep.pid`;
  const shellPidPath = `${marker}.shell.pid`;
  const child = spawn(process.execPath, [join(root, "parent-spawn.mjs"), mode, runRoot], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let parentStdout = "";
  let parentStderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    parentStdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    parentStderr += chunk;
  });
  await waitFor(() => existsSync(recordPath));
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  const descendantPid = await waitFor(() => readPid(sleepPidPath));
  const shellPid = await waitFor(() => readPid(shellPidPath));

  let parentExit;
  if (mode === "exit") {
    parentExit = await waitClose(child);
  } else {
    process.kill(child.pid, "SIGKILL");
    parentExit = await waitClose(child);
  }
  await sleep(300);
  const after = processSnapshot(record.childPid, [record.childPid, descendantPid]);
  event("parent-lifecycle", {
    label: `parent-${mode}`,
    parentPid: child.pid,
    parentExit,
    parentStdout,
    parentStderr,
    record,
    shellPid,
    descendantPid,
    shellIdentityAfter: identity(shellPid),
    descendantIdentityAfter: identity(descendantPid),
    snapshot: after,
  });
  await ensureGroupGone(
    record.childPid,
    [record.childPid, descendantPid, shellPid],
    `parent-${mode}-cleanup`,
  );
}

async function outputStatus() {
  const group = spawnGroup(
    "output-status",
    "printf 'stdout-line\\n'; printf 'stderr-line\\n' >&2; exit 7",
  );
  const exit = await waitClose(group.child);
  event("output-status", {
    label: "output-status",
    exit,
    output: group.readOutput(),
    normalizedStatus:
      exit.code !== undefined && exit.code !== null
        ? { kind: "exit", code: exit.code }
        : exit.signal
          ? { kind: "signal", signal: exit.signal }
          : { kind: "unknown" },
  });
}

async function identityRecovery() {
  const group = spawnGroup("identity-recovery", "exec /bin/sleep 300");
  const pid = group.child.pid;
  const current = identity(pid);
  if (!current) throw new Error(`identity unavailable for ${pid}`);
  const recordPath = join(runRoot, "identity-record.json");
  const stalePath = join(runRoot, "identity-record-stale.json");
  const record = {
    pid,
    pgid: current.pgid,
    startSec: current.startSec,
    startUsec: current.startUsec,
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(
    stalePath,
    `${JSON.stringify({ ...record, startUsec: (record.startUsec + 1) % 1_000_000 }, null, 2)}\n`,
  );

  for (const [mode, path] of [
    ["check", recordPath],
    ["terminate-stale", stalePath],
  ]) {
    const result = spawnSync(
      process.execPath,
      [join(root, "recover-check.mjs"), mode, path, helper],
      { encoding: "utf8" },
    );
    event("identity-recovery", {
      label: `identity-${mode}`,
      status: result.status,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      processStillAliveAfter: identity(pid),
    });
  }

  const valid = spawnSync(
    process.execPath,
    [join(root, "recover-check.mjs"), "terminate-valid", recordPath, helper],
    { encoding: "utf8" },
  );
  const exit = await waitClose(group.child);
  await sleep(300);
  event("identity-recovery", {
    label: "identity-terminate-valid",
    status: valid.status,
    stdout: valid.stdout.trim(),
    stderr: valid.stderr.trim(),
    exit,
    identityAfter: identity(pid),
    snapshot: processSnapshot(record.pgid, [pid]),
  });
}

async function main() {
  const compile = spawnSync(
    "/usr/bin/clang",
    ["-Wall", "-Wextra", "-O2", "-o", helper, join(root, "pid_identity.c")],
    { encoding: "utf8" },
  );
  event("environment", {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    root,
    runRoot,
    clangStatus: compile.status,
    clangStdout: compile.stdout.trim(),
    clangStderr: compile.stderr.trim(),
  });
  if (compile.status !== 0) throw new Error("pid identity helper failed to compile");

  await groupCancel();
  await pidOnlyCancel();
  await parentLifecycle("exit");
  await parentLifecycle("block");
  await outputStatus();
  await identityRecovery();

  const finalSnapshot = processSnapshot(-1, []);
  event("probe-complete", {
    commandMatches: finalSnapshot.commandMatches,
  });
}

main().catch((error) => {
  event("probe-failure", {
    message: error.message,
    stack: error.stack,
  });
  process.exitCode = 1;
});
