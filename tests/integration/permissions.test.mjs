import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { PermissionManager } from "../../dist/permissions/permission-manager.js";
import { FakeProvider } from "../../dist/providers/fake-provider.js";
import { AgentLoop } from "../../dist/runtime/agent-loop.js";
import { SessionController } from "../../dist/runtime/session-controller.js";
import { SqliteEventStore } from "../../dist/storage/sqlite-store.js";
import { ToolRegistry } from "../../dist/tools/tool-registry.js";

function databasePath() {
  return join(
    mkdtempSync(join(tmpdir(), "spool-permissions-")),
    "events.sqlite",
  );
}

function prepareRun(store) {
  const controller = new SessionController(store);
  const input = controller.acceptInput("input-1", "session-1", "work");
  controller.createRun(
    "run-command-1",
    "session-1",
    "run-1",
    input.event.eventId,
  );
}

test("permission denial prevents tool intent and produces a paired result", async () => {
  const store = new SqliteEventStore(databasePath());
  try {
    prepareRun(store);
    let invocations = 0;
    const tools = new ToolRegistry([
      {
        effect: "write",
        name: "write",
        async invoke() {
          invocations += 1;
          return { output: null, status: "ok" };
        },
      },
    ]);
    const provider = new FakeProvider([
      {
        response: {
          calls: [{ callId: "call-1", input: null, name: "write" }],
          text: "request write",
          type: "tool_calls",
        },
        type: "response",
      },
    ]);
    const permissions = new PermissionManager();

    const outcome = await new AgentLoop(store).run({
      input: "work",
      permissions,
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
      tools,
    });

    assert.equal(outcome.status, "failed");
    assert.equal(invocations, 0);
    const events = store.readEvents("session-1");
    assert.ok(
      events.some((event) => event.type === "permission/requested"),
    );
    assert.ok(events.some((event) => event.type === "permission/decided"));
    assert.ok(!events.some((event) => event.type === "tool/intent"));
    const result = events.find((event) => event.type === "tool/result");
    assert.equal(result?.payload.output.code, "permission-denied");
  } finally {
    store.close();
  }
});
