import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { CommandConflictError } from "../../dist/contracts/errors.js";
import { FakeProvider } from "../../dist/providers/fake-provider.js";
import { AgentLoop } from "../../dist/runtime/agent-loop.js";
import { SessionController } from "../../dist/runtime/session-controller.js";
import { SqliteEventStore } from "../../dist/storage/sqlite-store.js";
import { ToolRegistry } from "../../dist/tools/tool-registry.js";

function createDatabasePath(name) {
  return join(mkdtempSync(join(tmpdir(), `spool-${name}-`)), "events.sqlite");
}

function createRun(controller, store) {
  const input = controller.acceptInput("input-1", "session-1", "do work");
  controller.createRun(
    "run-1",
    "session-1",
    "run-1",
    input.event.eventId,
  );
  return { input, store };
}

function responseStep(response) {
  return { response, type: "response" };
}

test("acceptInput is idempotent and rejects a reused command with different content", () => {
  const store = new SqliteEventStore(createDatabasePath("input"));
  try {
    const controller = new SessionController(store);
    const first = controller.acceptInput("command-1", "session-1", "hello");
    const duplicate = controller.acceptInput(
      "command-1",
      "session-1",
      "hello",
    );

    assert.equal(first.duplicate, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.event.eventId, first.event.eventId);
    assert.throws(
      () => controller.acceptInput("command-1", "session-1", "different"),
      CommandConflictError,
    );
    assert.throws(
      () => controller.acceptInput("command-1", "session-2", "hello"),
      CommandConflictError,
    );
    assert.equal(store.readEvents("session-1").length, 1);
    assert.equal(store.readEvents("session-2").length, 0);
  } finally {
    store.close();
  }
});

test("createRun requires an accepted input event from the same session", () => {
  const store = new SqliteEventStore(createDatabasePath("input-binding"));
  try {
    const controller = new SessionController(store);
    const first = controller.acceptInput(
      "input-1",
      "session-1",
      "first input",
    );
    controller.acceptInput("input-2", "session-2", "second input");

    assert.throws(
      () =>
        controller.createRun(
          "run-command-1",
          "session-1",
          "run-1",
          "missing-event",
        ),
      /is not valid for session/,
    );
    assert.throws(
      () =>
        controller.createRun(
          "run-command-2",
          "session-2",
          "run-2",
          first.event.eventId,
        ),
      /is not valid for session/,
    );
  } finally {
    store.close();
  }
});

test("agent loop rejects a run claimed under a different session", async () => {
  const store = new SqliteEventStore(createDatabasePath("run-owner"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const provider = new FakeProvider([
      responseStep({ text: "should not run", type: "final" }),
    ]);

    await assert.rejects(
      new AgentLoop(store).run({
        input: "do work",
        provider,
        runId: "run-1",
        sessionId: "session-2",
        signal: new AbortController().signal,
        tools: new ToolRegistry(),
      }),
      /could not be claimed/,
    );
    assert.ok(
      !store
        .readEvents("session-1")
        .some((event) => event.type === "run/completed"),
    );
  } finally {
    store.close();
  }
});

test("agent loop records tool intent and result in call order", async () => {
  const store = new SqliteEventStore(createDatabasePath("tool-pair"));
  try {
    const controller = new SessionController(store);
    const { input } = createRun(controller, store);
    let invocations = 0;
    const tools = new ToolRegistry([
      {
        name: "echo",
        async invoke(value) {
          invocations += 1;
          return { output: { echoed: value }, status: "ok" };
        },
      },
    ]);
    const provider = new FakeProvider([
      responseStep({
        calls: [
          {
            callId: "call-1",
            input: { value: "hello" },
            name: "echo",
          },
        ],
        text: "calling tool",
        type: "tool_calls",
      }),
      responseStep({ text: "complete", type: "final" }),
    ]);

    const outcome = await new AgentLoop(store).run({
      input: "do work",
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
      tools,
    });

    assert.deepEqual(outcome, { status: "completed", text: "complete" });
    assert.equal(invocations, 1);
    assert.equal(input.event.type, "input/received");
    const events = store.readEvents("session-1");
    const intent = events.find((event) => event.type === "tool/intent");
    const result = events.find((event) => event.type === "tool/result");
    assert.equal(intent?.payload.callId, "call-1");
    assert.equal(result?.payload.callId, "call-1");
    assert.equal(result?.payload.status, "ok");
  } finally {
    store.close();
  }
});

test("provider failure is recorded as a failed run", async () => {
  const store = new SqliteEventStore(createDatabasePath("provider-fail"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const provider = new FakeProvider([
      { error: new Error("provider unavailable"), type: "error" },
    ]);

    const outcome = await new AgentLoop(store).run({
      input: "do work",
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
      tools: new ToolRegistry(),
    });

    assert.deepEqual(outcome, {
      error: "provider unavailable",
      status: "failed",
    });
    assert.ok(
      store.readEvents("session-1").some(
        (event) => event.type === "provider/error",
      ),
    );
    assert.ok(
      store.readEvents("session-1").some((event) => event.type === "run/failed"),
    );
  } finally {
    store.close();
  }
});

test("cancellation closes the run before a pending provider call can dispatch a tool", async () => {
  const store = new SqliteEventStore(createDatabasePath("cancel"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const provider = new FakeProvider([{ text: "wait", type: "hang" }]);
    const abortController = new AbortController();
    let invocations = 0;
    const tools = new ToolRegistry([
      {
        name: "never",
        async invoke() {
          invocations += 1;
          return { output: null, status: "ok" };
        },
      },
    ]);

    const running = new AgentLoop(store).run({
      input: "do work",
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: abortController.signal,
      tools,
    });
    setTimeout(() => abortController.abort(), 10);

    assert.deepEqual(await running, { status: "cancelled", text: "" });
    assert.equal(invocations, 0);
    assert.ok(
      store
        .readEvents("session-1")
        .some((event) => event.type === "run/cancelled"),
    );
  } finally {
    store.close();
  }
});

test("cancellation wins when a provider returns normally after abort", async () => {
  const store = new SqliteEventStore(createDatabasePath("late-provider"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const abortController = new AbortController();
    const provider = {
      metadata() {
        return {
          model: "delayed-test",
          protocol: "test",
          provider: "test",
        };
      },
      async next() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { text: "late response", type: "final" };
      },
    };

    const running = new AgentLoop(store).run({
      input: "do work",
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: abortController.signal,
      tools: new ToolRegistry(),
    });
    setTimeout(() => abortController.abort(), 2);

    assert.deepEqual(await running, { status: "cancelled", text: "" });
    const events = store.readEvents("session-1");
    assert.ok(events.some((event) => event.type === "run/cancelled"));
    assert.ok(!events.some((event) => event.type === "run/completed"));
    assert.ok(!events.some((event) => event.type === "assistant/message"));
  } finally {
    store.close();
  }
});

test("a tool that throws after cancellation records an unknown outcome", async () => {
  const store = new SqliteEventStore(createDatabasePath("unknown-tool"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const abortController = new AbortController();
    const provider = new FakeProvider([
      responseStep({
        calls: [
          {
            callId: "call-1",
            input: null,
            name: "uncertain",
          },
        ],
        text: "calling tool",
        type: "tool_calls",
      }),
    ]);
    const tools = new ToolRegistry([
      {
        name: "uncertain",
        async invoke() {
          abortController.abort();
          throw new Error("side effect status unknown");
        },
      },
    ]);

    assert.deepEqual(
      await new AgentLoop(store).run({
        input: "do work",
        provider,
        runId: "run-1",
        sessionId: "session-1",
        signal: abortController.signal,
        tools,
      }),
      { status: "cancelled", text: "" },
    );
    const result = store
      .readEvents("session-1")
      .find((event) => event.type === "tool/result");
    assert.equal(result?.payload.status, "unknown");
    assert.equal(result?.payload.output.dispatched, true);
  } finally {
    store.close();
  }
});

test("an unknown tool outcome stops later provider steps and fails the run", async () => {
  const store = new SqliteEventStore(createDatabasePath("unknown-terminal"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const provider = new FakeProvider([
      responseStep({
        calls: [
          {
            callId: "call-1",
            input: null,
            name: "uncertain",
          },
        ],
        text: "calling tool",
        type: "tool_calls",
      }),
      responseStep({ text: "must not complete", type: "final" }),
    ]);
    const tools = new ToolRegistry([
      {
        name: "uncertain",
        async invoke() {
          throw new Error("outcome unavailable");
        },
      },
    ]);

    const outcome = await new AgentLoop(store).run({
      input: "do work",
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
      tools,
    });

    assert.equal(outcome.status, "failed");
    assert.match(outcome.error, /outcome is unknown/);
    const events = store.readEvents("session-1");
    assert.ok(events.some((event) => event.type === "run/failed"));
    assert.ok(!events.some((event) => event.type === "run/completed"));
    assert.equal(
      events.filter((event) => event.type === "provider/request").length,
      1,
    );
  } finally {
    store.close();
  }
});

test("a tool-returned unknown result is persisted before the run fails", async () => {
  const store = new SqliteEventStore(createDatabasePath("returned-unknown"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const provider = new FakeProvider([
      responseStep({
        calls: [{ callId: "call-1", input: null, name: "uncertain" }],
        text: "calling tool",
        type: "tool_calls",
      }),
      responseStep({ text: "must not complete", type: "final" }),
    ]);
    const tools = new ToolRegistry([
      {
        name: "uncertain",
        async invoke() {
          return {
            output: { detail: "operation may have started" },
            status: "unknown",
          };
        },
      },
    ]);

    const outcome = await new AgentLoop(store).run({
      input: "do work",
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
      tools,
    });

    assert.equal(outcome.status, "failed");
    const result = store
      .readEvents("session-1")
      .find((event) => event.type === "tool/result");
    assert.equal(result?.payload.status, "unknown");
    assert.deepEqual(result?.payload.output, {
      detail: "operation may have started",
    });
  } finally {
    store.close();
  }
});

test("cancellation wins when a tool returns unknown after abort", async () => {
  const store = new SqliteEventStore(createDatabasePath("returned-unknown-abort"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const abortController = new AbortController();
    const provider = new FakeProvider([
      responseStep({
        calls: [{ callId: "call-1", input: null, name: "uncertain" }],
        text: "calling tool",
        type: "tool_calls",
      }),
    ]);
    const tools = new ToolRegistry([
      {
        name: "uncertain",
        async invoke() {
          abortController.abort();
          return {
            output: { detail: "cancelled with unknown side effect" },
            status: "unknown",
          };
        },
      },
    ]);

    const outcome = await new AgentLoop(store).run({
      input: "do work",
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: abortController.signal,
      tools,
    });

    assert.deepEqual(outcome, { status: "cancelled", text: "" });
    const events = store.readEvents("session-1");
    assert.ok(events.some((event) => event.type === "run/cancelled"));
    const result = events.find((event) => event.type === "tool/result");
    assert.equal(result?.payload.status, "unknown");
  } finally {
    store.close();
  }
});

test("storage failure before tool intent prevents the tool side effect", async () => {
  const store = new SqliteEventStore(createDatabasePath("storage-fail"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const failingStore = new Proxy(store, {
      get(target, property) {
        if (property === "recordToolIntent") {
          return () => {
            throw new Error("storage unavailable");
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const provider = new FakeProvider([
      responseStep({
        calls: [
          {
            callId: "call-1",
            input: null,
            name: "side_effect",
          },
        ],
        text: "calling tool",
        type: "tool_calls",
      }),
    ]);
    let invocations = 0;
    const tools = new ToolRegistry([
      {
        name: "side_effect",
        async invoke() {
          invocations += 1;
          return { output: "should not run", status: "ok" };
        },
      },
    ]);

    await assert.rejects(
      new AgentLoop(failingStore).run({
        input: "do work",
        provider,
        runId: "run-1",
        sessionId: "session-1",
        signal: new AbortController().signal,
        tools,
      }),
      /storage unavailable/,
    );
    assert.equal(invocations, 0);
  } finally {
    store.close();
  }
});

test("a failed result write is repaired as unknown when the store reopens", async () => {
  const databasePath = createDatabasePath("result-write-fail");
  const store = new SqliteEventStore(databasePath);
  const controller = new SessionController(store);
  createRun(controller, store);
  const failingStore = new Proxy(store, {
    get(target, property) {
      if (property === "recordToolResult") {
        return () => {
          throw new Error("result write failed");
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const provider = new FakeProvider([
    responseStep({
      calls: [
        {
          callId: "call-1",
          input: null,
          name: "uncertain",
        },
      ],
      text: "calling tool",
      type: "tool_calls",
    }),
  ]);
  let invocations = 0;
  await assert.rejects(
    new AgentLoop(failingStore).run({
      input: "do work",
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
      tools: new ToolRegistry([
        {
          name: "uncertain",
          async invoke() {
            invocations += 1;
            return { output: "executed", status: "ok" };
          },
        },
      ]),
    }),
    /result write failed/,
  );
  assert.equal(invocations, 1);
  store.close();

  const recovered = new SqliteEventStore(databasePath);
  try {
    const result = recovered
      .readEvents("session-1")
      .find((event) => event.type === "tool/result");
    assert.equal(result?.payload.status, "unknown");
    assert.equal(result?.payload.output.reason, "recovered-unsettled-tool");
  } finally {
    recovered.close();
  }
});

test("provider tool call batches must be non-empty and use unique call ids", async () => {
  const databasePath = createDatabasePath("invalid-tool-batches");
  const store = new SqliteEventStore(databasePath);
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const duplicateCalls = new FakeProvider([
      responseStep({
        calls: [
          { callId: "call-1", input: null, name: "one" },
          { callId: "call-1", input: null, name: "two" },
        ],
        text: "duplicate calls",
        type: "tool_calls",
      }),
    ]);

    const duplicateOutcome = await new AgentLoop(store).run({
      input: "do work",
      provider: duplicateCalls,
      runId: "run-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
      tools: new ToolRegistry(),
    });
    assert.equal(duplicateOutcome.status, "failed");
    assert.match(duplicateOutcome.error, /duplicate tool calls/);

    const secondInput = controller.acceptInput(
      "input-2",
      "session-1",
      "second",
    );
    controller.createRun(
      "run-command-2",
      "session-1",
      "run-2",
      secondInput.event.eventId,
    );
    const emptyCalls = new FakeProvider([
      responseStep({ calls: [], text: "", type: "tool_calls" }),
    ]);
    const emptyOutcome = await new AgentLoop(store).run({
      input: "second",
      provider: emptyCalls,
      runId: "run-2",
      sessionId: "session-1",
      signal: new AbortController().signal,
      tools: new ToolRegistry(),
    });
    assert.equal(emptyOutcome.status, "failed");
    assert.match(emptyOutcome.error, /empty tool call batch/);
  } finally {
    store.close();
  }
});

test("tool call ids are unique across provider steps", async () => {
  const store = new SqliteEventStore(createDatabasePath("cross-step-call-id"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const provider = new FakeProvider([
      responseStep({
        calls: [{ callId: "same-call", input: null, name: "count" }],
        text: "first call",
        type: "tool_calls",
      }),
      responseStep({
        calls: [{ callId: "same-call", input: null, name: "count" }],
        text: "duplicate call",
        type: "tool_calls",
      }),
      responseStep({ text: "must not complete", type: "final" }),
    ]);
    let invocations = 0;
    const tools = new ToolRegistry([
      {
        name: "count",
        async invoke() {
          invocations += 1;
          return { output: invocations, status: "ok" };
        },
      },
    ]);

    const outcome = await new AgentLoop(store).run({
      input: "do work",
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
      tools,
    });

    assert.equal(outcome.status, "failed");
    assert.match(outcome.error, /duplicate tool calls/);
    assert.equal(invocations, 1);
    assert.ok(
      !store
        .readEvents("session-1")
        .some((event) => event.type === "run/completed"),
    );
  } finally {
    store.close();
  }
});

test("malformed provider tool calls are rejected before field access", async () => {
  const store = new SqliteEventStore(createDatabasePath("malformed-call"));
  try {
    const controller = new SessionController(store);
    createRun(controller, store);
    const provider = new FakeProvider([
      responseStep({
        calls: [{ callId: 1, input: null, name: "bad" }],
        text: "malformed",
        type: "tool_calls",
      }),
    ]);

    const outcome = await new AgentLoop(store).run({
      input: "do work",
      provider,
      runId: "run-1",
      sessionId: "session-1",
      signal: new AbortController().signal,
      tools: new ToolRegistry(),
    });

    assert.equal(outcome.status, "failed");
    assert.match(outcome.error, /malformed response/);
    assert.ok(
      store
        .readEvents("session-1")
        .some((event) => event.type === "provider/error"),
    );
  } finally {
    store.close();
  }
});

test("events and artifacts survive closing and reopening the store", () => {
  const databasePath = createDatabasePath("reopen");
  const firstStore = new SqliteEventStore(databasePath);
  const input = firstStore.acceptInput(
    "input-1",
    "session-1",
    "persist me",
  );
  const artifact = firstStore.putArtifact(
    new TextEncoder().encode("large output"),
    "text/plain",
    { runId: null, sessionId: "session-1" },
  );
  firstStore.close();

  const reopened = new SqliteEventStore(databasePath);
  try {
    const events = reopened.readEvents("session-1");
    const stored = reopened.readArtifact(artifact.artifactId);
    assert.equal(events[0]?.eventId, input.event.eventId);
    assert.ok(
      events.some((event) => event.type === "artifact/stored"),
    );
    assert.equal(new TextDecoder().decode(stored.content), "large output");
    assert.equal(stored.artifact.sha256, artifact.sha256);
    writeFileSync(stored.artifact.path, "corrupt");
    assert.throws(
      () => reopened.readArtifact(artifact.artifactId),
      /failed integrity verification/,
    );
  } finally {
    reopened.close();
  }
});

test("a second active owner cannot open the same execution domain", () => {
  const databasePath = createDatabasePath("single-owner");
  const firstStore = new SqliteEventStore(databasePath, { timeoutMs: 50 });
  try {
    assert.throws(
      () => new SqliteEventStore(databasePath, { timeoutMs: 25 }),
      /database is locked/,
    );
  } finally {
    firstStore.close();
  }

  const reopened = new SqliteEventStore(databasePath);
  reopened.close();
});

test("opening the store recovers a run interrupted before settlement", () => {
  const databasePath = createDatabasePath("recover-running");
  const firstStore = new SqliteEventStore(databasePath);
  const input = firstStore.acceptInput(
    "input-1",
    "session-1",
    "interrupt me",
  );
  firstStore.createRun(
    "run-command-1",
    "session-1",
    "run-1",
    input.event.eventId,
  );
  assert.equal(firstStore.claimRun("run-1", "session-1"), true);
  firstStore.close();

  const recovered = new SqliteEventStore(databasePath);
  try {
    const failure = recovered
      .readEvents("session-1")
      .find((event) => event.type === "run/failed");
    assert.equal(failure?.payload.reason, "recovered-interrupted-run");
    assert.equal(failure?.payload.recovered, true);
  } finally {
    recovered.close();
  }
});

test("recovery settles an interrupted tool intent as unknown", () => {
  const databasePath = createDatabasePath("recover-tool-intent");
  const firstStore = new SqliteEventStore(databasePath);
  const input = firstStore.acceptInput(
    "input-1",
    "session-1",
    "interrupt tool",
  );
  firstStore.createRun(
    "run-command-1",
    "session-1",
    "run-1",
    input.event.eventId,
  );
  assert.equal(firstStore.claimRun("run-1", "session-1"), true);
  firstStore.recordToolIntent(
    "session-1",
    "run-1",
    "call-1",
    "uncertain",
    null,
  );
  firstStore.close();

  const recovered = new SqliteEventStore(databasePath);
  try {
    const result = recovered
      .readEvents("session-1")
      .find((event) => event.type === "tool/result");
    assert.equal(result?.payload.status, "unknown");
    assert.equal(result?.payload.output.reason, "recovered-unsettled-tool");
  } finally {
    recovered.close();
  }
});
