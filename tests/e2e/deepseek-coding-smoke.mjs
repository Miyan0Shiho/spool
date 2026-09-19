import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProcessManager } from "../../dist/execution/process-manager.js";
import { Workspace } from "../../dist/execution/workspace.js";
import { PermissionManager } from "../../dist/permissions/permission-manager.js";
import { OpenAICompatibleProvider } from "../../dist/providers/openai-compatible.js";
import { AgentLoop } from "../../dist/runtime/agent-loop.js";
import { SessionController } from "../../dist/runtime/session-controller.js";
import { SqliteEventStore } from "../../dist/storage/sqlite-store.js";
import { fileTools } from "../../dist/tools/file-tools.js";
import { shellTools } from "../../dist/tools/shell-tools.js";
import { ToolRegistry } from "../../dist/tools/tool-registry.js";

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  throw new Error("DEEPSEEK_API_KEY is required for the B3 smoke test");
}

const runRoot = realpathSync(mkdtempSync(join(tmpdir(), "spool-b3-")));
const workspaceRoot = join(runRoot, "repo");
mkdirSync(join(workspaceRoot, "src"), { recursive: true });
mkdirSync(join(workspaceRoot, "tests"), { recursive: true });
writeFileSync(
  join(workspaceRoot, "package.json"),
  `${JSON.stringify(
    {
      name: "b3-fixture",
      private: true,
      type: "module",
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(workspaceRoot, "src", "round.js"),
  [
    "export function roundMoney(value) {",
    "  return Math.floor(value * 100) / 100;",
    "}",
    "",
  ].join("\n"),
);
writeFileSync(
  join(workspaceRoot, "tests", "round.test.js"),
  [
    'import assert from "node:assert/strict";',
    'import { test } from "node:test";',
    'import { roundMoney } from "../src/round.js";',
    "",
    'test("rounds half cents up", () => {',
    "  assert.equal(roundMoney(1.005), 1.01);",
    "});",
    "",
  ].join("\n"),
);

const workspace = new Workspace(workspaceRoot);
const store = new SqliteEventStore(join(runRoot, "events.sqlite"));
const processManager = new ProcessManager();
const originalSource = readFileSync(
  join(workspaceRoot, "src", "round.js"),
  "utf8",
);
const originalTest = readFileSync(
  join(workspaceRoot, "tests", "round.test.js"),
  "utf8",
);
const prompt =
  "Fix the failing test in this repository. Inspect the workspace and run the test first. Do not modify tests. Make the smallest source change, rerun the test, and then report completion.";

try {
  const controller = new SessionController(store);
  const input = controller.acceptInput("input-1", "session-1", prompt);
  controller.createRun(
    "run-command-1",
    "session-1",
    "run-1",
    input.event.eventId,
  );
  const provider = new OpenAICompatibleProvider({
    apiKey,
    baseUrl: "https://api.deepseek.com/v1",
    maxOutputTokens: 2_048,
    model: "deepseek-flash",
    providerName: "deepseek",
    systemPrompt:
      "You are spool, a coding agent. Use the provided tools, make minimal changes, and never claim success without running verification. Stop with a final message after the tests pass.",
  });
  const tools = new ToolRegistry([...fileTools, ...shellTools]);
  const permissions = new PermissionManager({
    approvalHandler: async () => true,
  });
  const outcome = await new AgentLoop(store).run({
    input: prompt,
    permissions,
    provider,
    runId: "run-1",
    sessionId: "session-1",
    signal: new AbortController().signal,
    toolContext: {
      artifacts: store,
      processManager,
      runId: "run-1",
      sessionId: "session-1",
      workspace,
    },
    tools,
  });

  const verification = spawnSync(
    process.execPath,
    ["--test", "tests/round.test.js"],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
    },
  );
  assert.equal(verification.status, 0, verification.stdout + verification.stderr);
  assert.equal(
    readFileSync(join(workspaceRoot, "tests", "round.test.js"), "utf8"),
    originalTest,
  );
  assert.notEqual(
    readFileSync(join(workspaceRoot, "src", "round.js"), "utf8"),
    originalSource,
  );
  assert.equal(outcome.status, "completed");

  const events = store.readEvents("session-1");
  const requests = events.filter((event) => event.type === "provider/request");
  const intents = events.filter((event) => event.type === "tool/intent");
  const assistantMessages = events.filter(
    (event) => event.type === "assistant/message",
  );
  const usage = assistantMessages
    .map((event) => event.payload.usage)
    .filter(Boolean);
  console.log(
    JSON.stringify(
      {
        finalText: outcome.text,
        model: requests.at(-1)?.payload.provider ?? null,
        runRoot,
        toolCalls: intents.map((event) => event.payload.toolName),
        usage,
        verificationExitCode: verification.status,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(
    processManager.list().map(async (handle) => {
      await handle.cancel();
      handle.cleanup();
    }),
  );
  store.close();
}
