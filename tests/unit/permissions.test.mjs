import assert from "node:assert/strict";
import { test } from "node:test";

import { PermissionManager } from "../../dist/permissions/permission-manager.js";

function tool(effect, name = effect) {
  return {
    effect,
    name,
    async invoke() {
      return { output: null, status: "ok" };
    },
  };
}

function request(toolValue, input = null) {
  return {
    callId: "call-1",
    input,
    tool: toolValue,
  };
}

test("read-only tools are allowed without an approval handler", async () => {
  const decision = await new PermissionManager().authorize(
    request(tool("read")),
    new AbortController().signal,
  );
  assert.equal(decision.action, "allow");
});

test("write and process tools fail closed without approval", async () => {
  const manager = new PermissionManager();
  assert.equal(
    (
      await manager.authorize(
        request(tool("write")),
        new AbortController().signal,
      )
    ).action,
    "deny",
  );
  assert.equal(
    (
      await manager.authorize(
        request(tool("process")),
        new AbortController().signal,
      )
    ).action,
    "deny",
  );
});

test("approval can allow a regular process call but not a destructive command", async () => {
  let approvals = 0;
  const manager = new PermissionManager({
    approvalHandler: async () => {
      approvals += 1;
      return true;
    },
  });
  const regular = await manager.authorize(
    request(tool("process"), { command: "printf ok" }),
    new AbortController().signal,
  );
  const destructive = await manager.authorize(
    request(tool("process"), { command: "sudo rm -rf /" }),
    new AbortController().signal,
  );
  assert.equal(regular.action, "allow");
  assert.equal(destructive.action, "deny");
  assert.equal(approvals, 1);
});
