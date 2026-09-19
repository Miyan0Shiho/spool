import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("headless CLI uses the shared runtime and prints the final response", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "spool-cli-")));
  const result = spawnSync(
    process.execPath,
    [
      "bin/spool.js",
      "run",
      "--headless",
      "--provider",
      "fake",
      "--session",
      join(root, "session.sqlite"),
      "--workspace",
      root,
      "hello",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "fake provider response\n");
});
