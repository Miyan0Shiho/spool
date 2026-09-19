import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { ProcessManager } from "../../dist/execution/process-manager.js";
import { PermissionManager } from "../../dist/permissions/permission-manager.js";
import { createProvider } from "../../dist/providers/factory.js";
import { AgentLoop } from "../../dist/runtime/agent-loop.js";
import { SessionController } from "../../dist/runtime/session-controller.js";
import { SqliteEventStore } from "../../dist/storage/sqlite-store.js";
import { fileTools } from "../../dist/tools/file-tools.js";
import { shellTools } from "../../dist/tools/shell-tools.js";
import { ToolRegistry } from "../../dist/tools/tool-registry.js";
import { snapshotTree, tasks } from "./tasks.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
process.env.PYTHONDONTWRITEBYTECODE = "1";
process.env.PYTEST_ADDOPTS = "-p no:cacheprovider";

function changedPaths(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();
}

function commandResult(command, cwd) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      LANG: "C",
      LC_ALL: "C",
      npm_config_cache: join(tmpdir(), "spool-bench-npm-cache"),
      npm_config_offline: "true",
      PYTHONDONTWRITEBYTECODE: "1",
      TZ: "UTC",
    },
    timeout: 120_000,
  });
  return {
    command: command.join(" "),
    exitCode: result.status,
    signal: result.signal,
    stderr: result.stderr.slice(-4_000),
    stdout: result.stdout.slice(-8_000),
  };
}

function pathAllowed(path, allowed) {
  return allowed.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

async function runAgent(task, workspace, runRoot, signal) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is required for agent mode");
  }
  const databasePath = join(runRoot, "session.sqlite");
  const store = new SqliteEventStore(databasePath);
  const processManager = new ProcessManager();
  try {
    const controller = new SessionController(store);
    const input = controller.acceptInput("input-1", "bench", task.prompt);
    controller.createRun("run-command-1", "bench", "run-1", input.event.eventId);
    const provider = createProvider({
      provider: "deepseek",
      systemPrompt:
        "You are spool. Use tools to inspect and modify the fixture. Do not edit protected files unless the task explicitly allows it. Run the acceptance command before finishing.",
    });
    const outcome = await new AgentLoop(store).run({
      input: task.prompt,
      permissions: new PermissionManager({
        approvalHandler: async () => true,
      }),
      provider,
      runId: "run-1",
      sessionId: "bench",
      signal,
      toolContext: {
        artifacts: store,
        processManager,
        runId: "run-1",
        sessionId: "bench",
        workspace: new (await import("../../dist/execution/workspace.js")).Workspace(workspace),
      },
      tools: new ToolRegistry([...fileTools, ...shellTools]),
    });
    const events = store.readEvents("bench");
    return {
      events,
      metadata: provider.metadata(),
      outcome,
    };
  } finally {
    await Promise.all(
      processManager.list().map(async (handle) => {
        await handle.cancel();
        handle.cleanup();
      }),
    );
    store.close();
  }
}

async function runTask(taskId, mode, keepWorkspace) {
  const task = tasks.get(taskId);
  if (!task) {
    return { id: taskId, status: "infra_error", reason: "task is spec-only" };
  }
  const runId = randomUUID();
  const runRoot = join(tmpdir(), `spool-bench-${runId}`);
  mkdirSync(runRoot, { recursive: true });
  const workspace = join(runRoot, taskId);
  mkdirSync(workspace, { recursive: true });
  task.setup(workspace);
  const before = snapshotTree(workspace);
  const protectedBefore = new Map(
    task.protected.map((path) => [path, before.get(path)]),
  );
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let agent;
  const abortController = new AbortController();
  const taskTimer = setTimeout(() => abortController.abort(), 180_000);
  try {
    if (mode === "gold") {
      task.gold(workspace);
      agent = {
        events: [],
        metadata: { model: "gold", protocol: "fixture", provider: "gold" },
        outcome: { status: "completed", text: "gold patch" },
      };
    } else {
      agent = await runAgent(task, workspace, runRoot, abortController.signal);
      if (abortController.signal.aborted) {
        throw new Error("task exceeded the 180 second wall-clock limit");
      }
    }
    const acceptance = commandResult(task.command, workspace);
    const extras = (task.extraCommand ?? []).map((command) =>
      commandResult(command, workspace),
    );
    const after = snapshotTree(workspace);
    const changed = changedPaths(before, after);
    const disallowed = changed.filter(
      (path) => !pathAllowed(path, task.allowed),
    );
    const protectedChanged = task.protected.filter(
      (path) => protectedBefore.get(path) !== after.get(path),
    );
    const passed =
      acceptance.exitCode === 0 &&
      extras.every((result) => result.exitCode === 0) &&
      disallowed.length === 0 &&
      protectedChanged.length === 0;
    const events = agent.events;
    const requests = events.filter((event) => event.type === "provider/request");
    const intents = events.filter((event) => event.type === "tool/intent");
    const deniedTools = events.filter(
      (event) =>
        event.type === "tool/result" &&
        (event.payload.output?.code === "permission-denied" ||
          event.payload.output?.code === "workspace-violation"),
    );
    const usage = events
      .filter((event) => event.type === "assistant/message")
      .map((event) => event.payload.usage)
      .filter(Boolean);
    return {
      taskId,
      status: passed ? "pass" : "fail",
      timestamp: new Date().toISOString(),
      durationMs: performance.now() - started,
      startedAt,
      workspace,
      outcome: agent.outcome,
      acceptance,
      extras,
      changedPaths: changed,
      disallowedPaths: disallowed,
      protectedChanged,
      provider: agent.metadata,
      modelCalls: requests.length,
      toolCalls: intents.map((event) => event.payload.toolName),
      deniedTools: deniedTools.map((event) => ({
        code: event.payload.output.code,
        message: event.payload.output.message,
      })),
      usage,
    };
  } catch (error) {
    return {
      taskId,
      status: "infra_error",
      timestamp: new Date().toISOString(),
      durationMs: performance.now() - started,
      startedAt,
      workspace,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(taskTimer);
    if (!keepWorkspace && mode === "gold") {
      rmSync(runRoot, { force: true, recursive: true });
    }
  }
}

async function runTaskWithRetry(taskId, mode, keepWorkspace) {
  const attempts = [];
  let result;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    result = await runTask(taskId, mode, keepWorkspace);
    attempts.push({
      attempt,
      error: result.error ?? null,
      status: result.status,
    });
    if (result.status !== "infra_error") {
      break;
    }
  }
  return {
    ...result,
    attempts,
  };
}

const parsed = parseArgs({
  allowPositionals: false,
  options: {
    "keep-workspace": { type: "boolean" },
    mode: { type: "string", default: "agent" },
    tasks: { type: "string", default: "T01,T02,T03,T18" },
  },
});
const mode = parsed.values.mode;
if (mode !== "agent" && mode !== "gold") {
  throw new Error("--mode must be agent or gold");
}
const selected = parsed.values.tasks.split(",").map((task) => task.trim());
const resultDirectory = join(root, "benchmark-results");
mkdirSync(resultDirectory, { recursive: true });
const resultPath = join(
  resultDirectory,
  `fixed-v1-${new Date().toISOString().replaceAll(":", "-")}.jsonl`,
);
for (const taskId of selected) {
  const result = await runTaskWithRetry(
    taskId,
    mode,
    parsed.values["keep-workspace"] ?? false,
  );
  appendFileSync(resultPath, `${JSON.stringify(result)}\n`);
  process.stdout.write(`${taskId} ${result.status}\n`);
}
process.stdout.write(`RESULTS ${resultPath}\n`);
