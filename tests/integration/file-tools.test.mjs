import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Workspace } from "../../dist/execution/workspace.js";
import { SqliteEventStore } from "../../dist/storage/sqlite-store.js";
import { fileTools } from "../../dist/tools/file-tools.js";
import { ToolRegistry } from "../../dist/tools/tool-registry.js";

function createWorkspace(name) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `spool-${name}-`)));
  return new Workspace(root);
}

function registry() {
  return new ToolRegistry(fileTools);
}

async function invoke(workspace, tool, input, extra = {}) {
  return registry().invoke(tool, input, {
    signal: new AbortController().signal,
    workspace,
    ...extra,
  });
}

test("file tools discover, read, search, create, and edit within the workspace", async () => {
  const workspace = createWorkspace("file-tools");
  writeFileSync(join(workspace.root, "alpha.txt"), "one\ntwo\nthree\n");
  mkdirSync(join(workspace.root, "nested"));
  writeFileSync(join(workspace.root, "nested", "beta.txt"), "needle\n");

  const listed = await invoke(workspace, "list_files", {
    glob: "**/*.txt",
  });
  assert.equal(listed.status, "ok");
  assert.deepEqual(listed.output.files, ["alpha.txt", "nested/beta.txt"]);

  const read = await invoke(workspace, "read_file", {
    limit: 2,
    offset: 2,
    path: "alpha.txt",
  });
  assert.equal(read.status, "ok");
  assert.equal(read.output.text, "two\nthree");
  assert.equal(read.output.lineStart, 2);

  const searched = await invoke(workspace, "search_files", {
    query: "needle",
  });
  assert.equal(searched.status, "ok");
  assert.equal(searched.output.matchCount, 1);
  assert.equal(searched.output.matches[0].path, "nested/beta.txt");

  const created = await invoke(workspace, "write_file", {
    content: "created\n",
    path: "new/deep/file.txt",
  });
  assert.equal(created.status, "ok");
  assert.equal(
    readFileSync(join(workspace.root, "new", "deep", "file.txt"), "utf8"),
    "created\n",
  );

  const edited = await invoke(workspace, "edit_file", {
    newText: "TWO",
    oldText: "two",
    path: "alpha.txt",
  });
  assert.equal(edited.status, "ok");
  assert.equal(
    readFileSync(join(workspace.root, "alpha.txt"), "utf8"),
    "one\nTWO\nthree\n",
  );
});

test("workspace path and hard-link boundaries reject writes", async () => {
  const workspace = createWorkspace("workspace-boundary");
  const outsideRoot = realpathSync(
    mkdtempSync(join(tmpdir(), "spool-outside-")),
  );
  const outside = join(outsideRoot, "outside.txt");
  writeFileSync(outside, "outside");
  symlinkSync(outside, join(workspace.root, "outside-link"));
  linkSync(outside, join(workspace.root, "outside-hardlink"));

  const traversal = await invoke(workspace, "read_file", {
    path: "../outside.txt",
  });
  assert.equal(traversal.status, "error");
  assert.equal(traversal.output.code, "workspace-violation");

  const symlinkRead = await invoke(workspace, "read_file", {
    path: "outside-link",
  });
  assert.equal(symlinkRead.status, "error");
  assert.equal(symlinkRead.output.code, "workspace-violation");

  const hardlinkWrite = await invoke(workspace, "write_file", {
    content: "changed",
    path: "outside-hardlink",
  });
  assert.equal(hardlinkWrite.status, "error");
  assert.equal(hardlinkWrite.output.code, "workspace-violation");
  assert.equal(readFileSync(outside, "utf8"), "outside");
});

test("large file output is truncated and spilled to an artifact", async () => {
  const workspace = createWorkspace("file-spill");
  const content = Array.from({ length: 200 }, (_, index) => `line-${index}`)
    .join("\n");
  writeFileSync(join(workspace.root, "large.txt"), content);
  const store = new SqliteEventStore(":memory:");
  try {
    store.acceptInput("input-1", "session-1", "spill output");
    const result = await invoke(
      workspace,
      "read_file",
      {
        maxBytes: 40,
        path: "large.txt",
      },
      {
        artifacts: store,
        runId: null,
        sessionId: "session-1",
      },
    );
    assert.equal(result.status, "ok");
    assert.equal(result.output.truncated, true);
    assert.ok(result.output.artifact);
    const stored = store.readArtifact(result.output.artifact.artifactId);
    assert.equal(new TextDecoder().decode(stored.content), content);
  } finally {
    store.close();
  }
});
