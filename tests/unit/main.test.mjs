import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isSupportedNodeVersion, main } from "../../dist/app/main.js";

const packageVersion = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
).version;

test("--version reports the package version", async () => {
  const writes = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };

  try {
    assert.equal(await main(["--version"]), 0);
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.deepEqual(writes, [`spool ${packageVersion}\n`]);
});

test("the runtime guard rejects Node versions below 24.21.0", () => {
  assert.equal(isSupportedNodeVersion("23.11.0"), false);
  assert.equal(isSupportedNodeVersion("24.20.0"), false);
  assert.equal(isSupportedNodeVersion("24.21.0"), true);
  assert.equal(isSupportedNodeVersion("25.0.0"), true);
});
