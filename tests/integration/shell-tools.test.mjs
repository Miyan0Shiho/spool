import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ProcessManager } from "../../dist/execution/process-manager.js";
import { Workspace } from "../../dist/execution/workspace.js";
import { SqliteEventStore } from "../../dist/storage/sqlite-store.js";
import { shellTools } from "../../dist/tools/shell-tools.js";
import { ToolRegistry } from "../../dist/tools/tool-registry.js";

function context(workspace, manager, extra = {}) {
  return {
    processManager: manager,
    signal: new AbortController().signal,
    workspace,
    ...extra,
  };
}

function createRoot(name) {
  return new Workspace(
    realpathSync(mkdtempSync(join(tmpdir(), `spool-${name}-`))),
  );
}

test("shell reports stdout, stderr, and nonzero exit as distinct facts", async () => {
  const workspace = createRoot("shell-exit");
  const manager = new ProcessManager();
  const tools = new ToolRegistry(shellTools);
  try {
    const result = await tools.invoke(
      "shell",
      {
        command: "printf 'hello\\n'; printf 'failure\\n' >&2; exit 7",
      },
      context(workspace, manager),
    );

    assert.equal(result.status, "error");
    assert.equal(result.output.exit.code, 7);
    assert.equal(result.output.stdout.text, "hello\n");
    assert.equal(result.output.stderr.text, "failure\n");
    assert.equal(result.output.timedOut, false);
  } finally {
    await Promise.all(
      manager.list().map(async (handle) => {
        await handle.cancel();
        handle.cleanup();
      }),
    );
  }
});

test("shell timeout cancels the process group", async () => {
  const workspace = createRoot("shell-timeout");
  const manager = new ProcessManager();
  const tools = new ToolRegistry(shellTools);
  try {
    const started = performance.now();
    const result = await tools.invoke(
      "shell",
      {
        command: "sleep 30",
        timeoutMs: 50,
      },
      context(workspace, manager),
    );
    const elapsed = performance.now() - started;

    assert.equal(result.status, "error");
    assert.equal(result.output.timedOut, true);
    assert.ok(elapsed < 2_000);
    assert.equal(manager.list().length, 0);
  } finally {
    await Promise.all(
      manager.list().map(async (handle) => {
        await handle.cancel();
        handle.cleanup();
      }),
    );
  }
});

test("shell abort cancels the process group", async () => {
  const workspace = createRoot("shell-abort");
  const manager = new ProcessManager();
  const tools = new ToolRegistry(shellTools);
  const abortController = new AbortController();
  try {
    const running = tools.invoke(
      "shell",
      { command: "sleep 30" },
      {
        processManager: manager,
        signal: abortController.signal,
        workspace,
      },
    );
    setTimeout(() => abortController.abort(), 20);

    const result = await running;
    assert.equal(result.status, "error");
    assert.equal(result.output.aborted, true);
    assert.equal(manager.list().length, 0);
  } finally {
    await Promise.all(
      manager.list().map(async (handle) => {
        await handle.cancel();
        handle.cleanup();
      }),
    );
  }
});

test("background jobs can be read and killed", async () => {
  const workspace = createRoot("shell-background");
  const manager = new ProcessManager();
  const tools = new ToolRegistry(shellTools);
  try {
    const started = await tools.invoke(
      "shell",
      {
        background: true,
        command: "printf 'background\\n'; sleep 30",
      },
      context(workspace, manager),
    );
    assert.equal(started.status, "ok");
    const jobId = started.output.job.id;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const read = await tools.invoke(
      "job_read",
      { jobId },
      context(workspace, manager),
    );
    assert.equal(read.status, "ok");
    assert.equal(read.output.stdout.text, "background\n");

    const killed = await tools.invoke(
      "job_kill",
      { jobId },
      context(workspace, manager),
    );
    assert.equal(killed.status, "ok");
    assert.equal(killed.output.residual, false);

    const listed = await tools.invoke(
      "job_list",
      {},
      context(workspace, manager),
    );
    assert.equal(listed.output.jobs.length, 1);
    assert.equal(listed.output.jobs[0].running, false);
  } finally {
    await Promise.all(
      manager.list().map(async (handle) => {
        await handle.cancel();
        handle.cleanup();
      }),
    );
  }
});

test("shell does not inherit provider credentials and supports output spill", async () => {
  const workspace = createRoot("shell-environment");
  const manager = new ProcessManager();
  const store = new SqliteEventStore(":memory:");
  const tools = new ToolRegistry(shellTools);
  try {
    store.acceptInput("input-1", "session-1", "shell environment");
    const credential = await tools.invoke(
      "shell",
      {
        command: "printf '%s' \"${OPENAI_API_KEY-unset}\"",
      },
      context(workspace, manager, {
        artifacts: store,
        runId: null,
        sessionId: "session-1",
      }),
    );
    assert.equal(credential.output.stdout.text, "unset");

    const large = await tools.invoke(
      "shell",
      {
        command: "node -e 'process.stdout.write(\"x\".repeat(10000))'",
        maxBytes: 100,
      },
      context(workspace, manager, {
        artifacts: store,
        runId: null,
        sessionId: "session-1",
      }),
    );
    assert.equal(large.status, "ok");
    assert.equal(large.output.stdout.truncated, true);
    assert.ok(large.output.stdout.artifact);
    const artifact = store.readArtifact(
      large.output.stdout.artifact.artifactId,
    );
    assert.equal(artifact.content.byteLength, 10_000);
  } finally {
    store.close();
    await Promise.all(
      manager.list().map(async (handle) => {
        await handle.cancel();
        handle.cleanup();
      }),
    );
  }
});

test("shell sandbox denies reads outside the workspace, outside writes, and network", async () => {
  const workspace = createRoot("shell-sandbox");
  const outsideRoot = realpathSync(
    mkdtempSync(join(tmpdir(), "spool-shell-outside-")),
  );
  const outside = join(outsideRoot, "outside.txt");
  writeFileSync(outside, "outside\n");
  const manager = new ProcessManager();
  const tools = new ToolRegistry(shellTools);
  try {
    const outsideRead = await tools.invoke(
      "shell",
      { command: `cat ${JSON.stringify(outside)}; printf 'status=%s\\n' "$?"` },
      context(workspace, manager),
    );
    assert.match(outsideRead.output.stderr.text, /Operation not permitted/);

    const outsideWrite = await tools.invoke(
      "shell",
      {
        command: `printf changed > ${JSON.stringify(outside)}`,
      },
      context(workspace, manager),
    );
    assert.equal(outsideWrite.status, "error");
    assert.equal(readFileSync(outside, "utf8"), "outside\n");

    const network = await tools.invoke(
      "shell",
      {
        command:
          "node -e \"fetch('http://127.0.0.1:80').then(()=>console.log('connected')).catch(e=>console.log(e.cause?.code || e.code || e.name))\"",
      },
      context(workspace, manager),
    );
    assert.match(network.output.stdout.text, /EPERM|ECONNREFUSED|ENETUNREACH/);

    const insideWrite = await tools.invoke(
      "shell",
      { command: "printf inside > inside.txt" },
      context(workspace, manager),
    );
    assert.equal(insideWrite.status, "ok");
    assert.equal(readFileSync(join(workspace.root, "inside.txt"), "utf8"), "inside");
  } finally {
    await Promise.all(
      manager.list().map(async (handle) => {
        await handle.cancel();
        handle.cleanup();
      }),
    );
  }
});
