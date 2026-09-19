import { spawn, spawnSync } from "node:child_process";
import dgram from "node:dgram";
import {
  appendFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const rawDir = join(root, "raw");
const profilesDir = join(root, "profiles");
const runRoot = mkdtempSync(join(root, "run-"));
const allowed = join(runRoot, "allowed");
const outside = join(runRoot, "outside");
mkdirSync(rawDir, { recursive: true });
mkdirSync(allowed, { recursive: true });
mkdirSync(outside, { recursive: true });

const canonicalAllowed = realpathSync(allowed);
const eventsPath = join(rawDir, "events.ndjson");
writeFileSync(eventsPath, "");

function event(name, data) {
  const row = { at: new Date().toISOString(), name, ...data };
  appendFileSync(eventsPath, `${JSON.stringify(row)}\n`);
  console.log(JSON.stringify(row));
}

function profile(name) {
  return join(profilesDir, name);
}

function fileState(path) {
  if (!existsSync(path)) {
    return { exists: false };
  }
  const read = spawnSync(
    "/usr/bin/stat",
    ["-f", "inode=%i mode=%Sp size=%z", path],
    { encoding: "utf8" },
  );
  return {
    exists: true,
    content: readFileSync(path, "utf8"),
    stat: read.status === 0 ? read.stdout.trim() : null,
  };
}

function run(label, profileName, command, args, options = {}) {
  const argv = ["-f", profile(profileName)];
  for (const [key, value] of Object.entries(options.defines ?? {})) {
    argv.push("-D", `${key}=${value}`);
  }
  argv.push("--", command, ...args);
  const started = performance.now();
  const result = spawnSync("/usr/bin/sandbox-exec", argv, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    timeout: options.timeoutMs ?? 5_000,
  });
  const record = {
    label,
    profile: profileName,
    command: [command, ...args],
    status: result.status,
    signal: result.signal,
    error: result.error
      ? { code: result.error.code, message: result.error.message }
      : null,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    durationMs: Math.round((performance.now() - started) * 100) / 100,
  };
  event("run", record);
  return record;
}

function runAsync(label, profileName, command, args, options = {}) {
  const argv = ["-f", profile(profileName)];
  for (const [key, value] of Object.entries(options.defines ?? {})) {
    argv.push("-D", `${key}=${value}`);
  }
  argv.push("--", command, ...args);
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/sandbox-exec", argv, {
      cwd: options.cwd ?? root,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs ?? 5_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      const record = {
        label,
        profile: profileName,
        command: [command, ...args],
        status,
        signal,
        timedOut,
        error: null,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: Math.round((performance.now() - started) * 100) / 100,
      };
      event("run", record);
      resolve(record);
    });
  });
}

function runShellInWorkspace(label, profileName, script, extraDefines = {}) {
  return run(
    label,
    profileName,
    "/bin/sh",
    ["-c", script],
    {
      defines: { WORKSPACE: canonicalAllowed, ...extraDefines },
    },
  );
}

async function listen(server, type, port = 0) {
  const bind =
    type === "udp"
      ? (callback) =>
          server.bind({ port, address: "127.0.0.1", exclusive: true }, callback)
      : (callback) =>
          server.listen({ port, host: "127.0.0.1", exclusive: true }, callback);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    bind(resolve);
  });
  return {
    port: server.address().port,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function tcpClientScript() {
  return [
    'const net=require("net");',
    'const s=net.connect(Number(process.argv[1]),"127.0.0.1");',
    'let data="";',
    's.on("data",c=>data+=c);',
    's.on("end",()=>{console.log("tcp:"+data)});',
    's.on("error",e=>{console.error(e.code+":"+e.message);process.exit(42)});',
  ].join("");
}

function udpClientScript() {
  return [
    'const dgram=require("dgram");',
    'const s=dgram.createSocket("udp4");',
    'const timer=setTimeout(()=>{console.error("UDP_TIMEOUT");process.exit(44)},1500);',
    's.on("message",m=>{clearTimeout(timer);console.log("udp:"+m);s.close()});',
    's.on("error",e=>{clearTimeout(timer);console.error(e.code+":"+e.message);process.exit(43)});',
    's.send("ping",Number(process.argv[1]),"127.0.0.1");',
  ].join("");
}

function childProcessScript() {
  return [
    'const {spawnSync}=require("child_process");',
    'const r=spawnSync("/usr/bin/true");',
    'console.log(JSON.stringify({status:r.status,signal:r.signal,error:r.error&&r.error.code}));',
    'process.exit(r.error||r.status!==0?1:0);',
  ].join("");
}

async function fileProbes() {
  const allowedPath = join(allowed, "allowed.txt");
  const outsidePath = join(outside, "outside.txt");
  const devNullResult = runShellInWorkspace(
    "write-dev-null",
    "workspace-write.sb",
    "printf devnull-ok > /dev/null",
  );
  const allowedResult = runShellInWorkspace(
    "write-allowed",
    "workspace-write.sb",
    `printf allowed-ok > ${JSON.stringify(allowedPath)}`,
  );
  const outsideResult = runShellInWorkspace(
    "write-outside",
    "workspace-write.sb",
    `printf outside-ok > ${JSON.stringify(outsidePath)}`,
  );

  const symlinkTarget = join(outside, "symlink-target.txt");
  const symlinkPath = join(allowed, "symlink-to-outside.txt");
  writeFileSync(symlinkTarget, "original-symlink\n");
  symlinkSync(symlinkTarget, symlinkPath);
  const symlinkResult = runShellInWorkspace(
    "write-through-symlink",
    "workspace-write.sb",
    `printf changed-through-symlink > ${JSON.stringify(symlinkPath)}`,
  );

  const hardlinkTarget = join(outside, "hardlink-target.txt");
  const hardlinkPath = join(allowed, "hardlink-to-outside.txt");
  writeFileSync(hardlinkTarget, "original-hardlink\n");
  let hardlinkSetup = null;
  try {
    linkSync(hardlinkTarget, hardlinkPath);
    hardlinkSetup = { ok: true };
  } catch (error) {
    hardlinkSetup = { ok: false, code: error.code, message: error.message };
  }
  const hardlinkResult = hardlinkSetup.ok
    ? runShellInWorkspace(
        "write-through-hardlink",
        "workspace-write.sb",
        `printf changed-through-hardlink > ${JSON.stringify(hardlinkPath)}`,
      )
    : null;

  const selfHardlinkTarget = join(outside, "self-hardlink-target.txt");
  const selfHardlinkPath = join(allowed, "self-created-hardlink.txt");
  writeFileSync(selfHardlinkTarget, "original-self-hardlink\n");
  const selfHardlinkResult = runShellInWorkspace(
    "create-and-write-hardlink",
    "workspace-write.sb",
    `/bin/ln ${JSON.stringify(selfHardlinkTarget)} ${JSON.stringify(selfHardlinkPath)} && ` +
      `printf changed-through-self-hardlink > ${JSON.stringify(selfHardlinkPath)}`,
  );

  event("file-results", {
    devNullResult,
    allowedResult,
    outsideResult,
    symlinkResult,
    hardlinkSetup,
    hardlinkResult,
    selfHardlinkResult,
    states: {
      allowed: fileState(allowedPath),
      outside: fileState(outsidePath),
      symlinkTarget: fileState(symlinkTarget),
      symlinkPath: fileState(symlinkPath),
      hardlinkTarget: fileState(hardlinkTarget),
      hardlinkPath: fileState(hardlinkPath),
      selfHardlinkTarget: fileState(selfHardlinkTarget),
      selfHardlinkPath: fileState(selfHardlinkPath),
    },
  });
}

async function networkProbes() {
  const tcpServer = net.createServer((socket) => socket.end("tcp-ok"));
  const tcp = await listen(tcpServer, "tcp");
  const tcpAllow = await runAsync(
    "network-tcp-allow",
    "allow-all.sb",
    process.execPath,
    ["-e", tcpClientScript(), String(tcp.port)],
  );
  const tcpDeny = await runAsync(
    "network-tcp-deny",
    "deny-network.sb",
    process.execPath,
    ["-e", tcpClientScript(), String(tcp.port)],
  );
  await tcp.close();

  const udpServer = dgram.createSocket("udp4");
  udpServer.on("message", (message, remote) => {
    udpServer.send("udp-ok", remote.port, remote.address);
  });
  const udp = await listen(udpServer, "udp");
  const udpAllow = await runAsync(
    "network-udp-allow",
    "allow-all.sb",
    process.execPath,
    ["-e", udpClientScript(), String(udp.port)],
  );
  const udpDeny = await runAsync(
    "network-udp-deny",
    "deny-network.sb",
    process.execPath,
    ["-e", udpClientScript(), String(udp.port)],
  );
  await udp.close();

  event("network-results", { tcpAllow, tcpDeny, udpAllow, udpDeny });
}

function processProbes() {
  const allow = run(
    "process-fork-allow",
    "allow-all.sb",
    process.execPath,
    ["-e", childProcessScript()],
  );
  const deny = run(
    "process-fork-deny",
    "deny-process-fork.sb",
    process.execPath,
    ["-e", childProcessScript()],
  );
  const shellDeny = run(
    "process-fork-shell-deny",
    "deny-process-fork.sb",
    "/bin/sh",
    ["-c", "/usr/bin/true; printf 'shell-child-status=%s\\n' \"$?\""],
  );
  const execDeny = run(
    "process-exec-deny",
    "deny-process-exec.sb",
    "/usr/bin/true",
    [],
  );
  event("process-results", { allow, deny, shellDeny, execDeny });
}

function combinedProbe() {
  const allowedPath = join(allowed, "combined-allowed.txt");
  const outsidePath = join(outside, "combined-outside.txt");
  const allowedResult = runShellInWorkspace(
    "combined-write-allowed",
    "workspace-write-network-deny.sb",
    `printf combined-allowed > ${JSON.stringify(allowedPath)}`,
  );
  const outsideResult = runShellInWorkspace(
    "combined-write-outside",
    "workspace-write-network-deny.sb",
    `printf combined-outside > ${JSON.stringify(outsidePath)}`,
  );
  const childInheritedResult = runShellInWorkspace(
    "combined-child-write-outside",
    "workspace-write-network-deny.sb",
    `/bin/sh -c 'printf child-outside > ${JSON.stringify(outsidePath)}'`,
  );
  event("combined-results", {
    allowedResult,
    outsideResult,
    childInheritedResult,
    states: {
      allowed: fileState(allowedPath),
      outside: fileState(outsidePath),
    },
  });
}

function failClosedProbes() {
  const malformedSentinel = join(outside, "malformed-sentinel.txt");
  const missingSentinel = join(outside, "missing-profile-sentinel.txt");
  const malformed = run(
    "malformed-profile",
    "malformed.sb",
    "/bin/sh",
    ["-c", `printf should-not-run > ${JSON.stringify(malformedSentinel)}`],
  );
  const missing = spawnSync(
    "/usr/bin/sandbox-exec",
    [
      "-f",
      join(profilesDir, "does-not-exist.sb"),
      "--",
      "/bin/sh",
      "-c",
      `printf should-not-run > ${JSON.stringify(missingSentinel)}`,
    ],
    { encoding: "utf8", timeout: 5_000 },
  );
  const missingRecord = {
    label: "missing-profile",
    status: missing.status,
    signal: missing.signal,
    error: missing.error
      ? { code: missing.error.code, message: missing.error.message }
      : null,
    stdout: missing.stdout.trim(),
    stderr: missing.stderr.trim(),
  };
  event("run", missingRecord);
  event("fail-closed-results", {
    malformed,
    missing: missingRecord,
    sentinels: {
      malformed: fileState(malformedSentinel),
      missing: fileState(missingSentinel),
    },
  });
}

async function main() {
  const executeProbe = run(
    "basic-availability",
    "allow-all.sb",
    "/usr/bin/true",
    [],
  );
  event("environment", {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    root,
    runRoot,
    canonicalAllowed,
    sandboxExecRealpath: realpathSync("/usr/bin/sandbox-exec"),
    basicAvailability: executeProbe,
  });
  await fileProbes();
  await networkProbes();
  processProbes();
  combinedProbe();
  failClosedProbes();
  event("probe-complete", {
    residualCandidates: spawnSync(
      "/bin/ps",
      ["-axo", "pid=,ppid=,pgid=,state=,command="],
      { encoding: "utf8" },
    )
      .stdout.split("\n")
      .filter((line) => line.includes(runRoot)),
  });
}

main().catch((error) => {
  event("probe-failure", { message: error.message, stack: error.stack });
  process.exitCode = 1;
});
