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
import { PermissionManager } from "../../dist/permissions/permission-manager.js";
import { FakeProvider } from "../../dist/providers/fake-provider.js";
import { AgentLoop } from "../../dist/runtime/agent-loop.js";
import { SessionController } from "../../dist/runtime/session-controller.js";
import { SqliteEventStore } from "../../dist/storage/sqlite-store.js";
import { fileTools } from "../../dist/tools/file-tools.js";
import { shellTools } from "../../dist/tools/shell-tools.js";
import { ToolRegistry } from "../../dist/tools/tool-registry.js";

test("agent loop performs a write-edit-shell verification without touching unrelated files", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "spool-tool-loop-")));
  const workspace = new Workspace(root);
  writeFileSync(join(root, "unrelated.txt"), "keep me\n");
  const databasePath = join(root, "events.sqlite");
  const store = new SqliteEventStore(databasePath);
  const manager = new ProcessManager();
  try {
    const controller = new SessionController(store);
    const input = controller.acceptInput(
      "input-1",
      "session-1",
      "update the file",
    );
    controller.createRun(
      "run-command-1",
      "session-1",
      "run-1",
      input.event.eventId,
    );
    const provider = new FakeProvider([
      {
        response: {
          calls: [
            {
              callId: "write-1",
              input: { content: "hello\n", path: "target.txt" },
              name: "write_file",
            },
          ],
          text: "write file",
          type: "tool_calls",
        },
        type: "response",
      },
      {
        response: {
          calls: [
            {
              callId: "edit-1",
              input: {
                newText: "world",
                oldText: "hello",
                path: "target.txt",
              },
              name: "edit_file",
            },
          ],
          text: "edit file",
          type: "tool_calls",
        },
        type: "response",
      },
      {
        response: {
          calls: [
            {
              callId: "shell-1",
              input: { command: "cat target.txt" },
              name: "shell",
            },
          ],
          text: "verify file",
          type: "tool_calls",
        },
        type: "response",
      },
      {
        response: { text: "verified", type: "final" },
        type: "response",
      },
    ]);
    const tools = new ToolRegistry([...fileTools, ...shellTools]);
    const permissions = new PermissionManager({
      approvalHandler: async () => true,
    });

    const outcome = await new AgentLoop(store).run({
      input: "update the file",
      permissions,
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
      toolContext: {
        artifacts: store,
        processManager: manager,
        runId: "run-1",
        sessionId: "session-1",
        workspace,
      },
      tools,
    });

    assert.deepEqual(outcome, { status: "completed", text: "verified" });
    assert.equal(readFileSync(join(root, "target.txt"), "utf8"), "world\n");
    assert.equal(readFileSync(join(root, "unrelated.txt"), "utf8"), "keep me\n");

    const events = store.readEvents("session-1");
    const intents = events.filter((event) => event.type === "tool/intent");
    const results = events.filter((event) => event.type === "tool/result");
    assert.equal(intents.length, 3);
    assert.equal(results.length, 3);
    assert.deepEqual(
      intents.map((event) => event.payload.callId),
      results.map((event) => event.payload.callId),
    );
    assert.equal(
      events.filter((event) => event.type === "permission/decided").length,
      3,
    );
  } finally {
    await Promise.all(
      manager.list().map(async (handle) => {
        await handle.cancel();
        handle.cleanup();
      }),
    );
    store.close();
  }
});
