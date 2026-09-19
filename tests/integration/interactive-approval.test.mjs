import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const expectAvailable =
  process.platform === "darwin" && existsSync("/usr/bin/expect");

function tclQuote(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function runInteractive(answer, name) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `spool-${name}-`)));
  const command = [
    process.execPath,
    "bin/spool.js",
    "run",
    "--provider",
    "fake-write",
    "--workspace",
    root,
    "--session",
    join(root, "session.sqlite"),
    "write a file",
  ];
  const expectScript = [
    "set timeout 10",
    `spawn ${command.map(tclQuote).join(" ")}`,
    "expect {",
    '  -re "Allow write_file.*" { send "' + answer + '\\r" }',
    '  timeout { puts "TIMEOUT_APPROVAL"; exit 124 }',
    "}",
    "expect {",
    '  -re "spool>" { send ".exit\\r" }',
    "  eof {}",
    '  timeout { puts "TIMEOUT_EXIT"; exit 125 }',
    "}",
    "expect eof",
    "catch wait result",
    "exit [lindex $result 3]",
  ].join("\n");
  const result = spawnSync(
    "/usr/bin/expect",
    ["-c", expectScript],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, TERM: "dumb" },
      timeout: 30_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return { result, root };
}

test("interactive approval allows a write only after y", { skip: !expectAvailable }, () => {
  const { result, root } = runInteractive("y", "interactive-allow");
  assert.match(result.stdout, /Allow write_file/);
  assert.equal(
    readFileSync(join(root, "approved.txt"), "utf8"),
    "approved write\n",
  );
});

test("interactive approval denial prevents the write", { skip: !expectAvailable }, () => {
  const { root } = runInteractive("n", "interactive-deny");
  assert.equal(existsSync(join(root, "approved.txt")), false);
});

test("PTY observes streaming text, tool progress, approval, and prompt return", { skip: !expectAvailable }, () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "spool-pty-stream-")));
  const command = [
    process.execPath,
    "bin/spool.js",
    "run",
    "--provider",
    "fake-stream",
    "--workspace",
    root,
    "--session",
    join(root, "session.sqlite"),
    "stream a file",
  ];
  const expectScript = [
    "set timeout 10",
    `spawn ${command.map(tclQuote).join(" ")}`,
    'expect "planning"',
    'expect -re "Allow write_file.*"',
    'send "y\\r"',
    'expect "\\[tool\\] write_file started"',
    'expect "\\[tool\\] write_file ok"',
    'expect "stream complete"',
    'expect "spool> "',
    "after 150",
    'send ".exit\\r"',
    "after 500",
    "exit 0",
  ].join("\n");
  const result = spawnSync("/usr/bin/expect", ["-c", expectScript], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, TERM: "dumb" },
    timeout: 30_000,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(join(root, "streamed.txt"), "utf8"),
    "stream approved\n",
  );
  assert.ok(
    result.stdout.indexOf("planning") <
      result.stdout.indexOf("[tool] write_file started"),
  );
  assert.ok(
    result.stdout.indexOf("[tool] write_file started") <
      result.stdout.indexOf("stream complete"),
  );
});
