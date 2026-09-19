import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  loadWorkspaceInstructions,
  renderInstructions,
} from "../../dist/context/instructions.js";
import {
  compactProviderMessages,
  validateMessageOrder,
} from "../../dist/context/compaction.js";
import { SkillRegistry } from "../../dist/extensions/skill-registry.js";
import { ToolRegistry } from "../../dist/tools/tool-registry.js";

test("workspace instructions and declarative skills are loaded with provenance", async () => {
  const root = mkdtempSync(join(tmpdir(), "spool-context-"));
  writeFileSync(join(root, "AGENTS.md"), "global workspace rule\n");
  writeFileSync(join(root, "CLAUDE.md"), "claude rule\n");
  mkdirSync(join(root, ".spool", "skills"), { recursive: true });
  writeFileSync(
    join(root, ".spool", "skills", "review.md"),
    "Review all changes carefully.\n",
  );

  const instructions = loadWorkspaceInstructions(root);
  assert.deepEqual(
    instructions.map((instruction) => instruction.path),
    ["AGENTS.md", "CLAUDE.md"],
  );
  assert.match(renderInstructions(instructions), /<workspace-instruction/);

  const skills = new SkillRegistry(root);
  assert.deepEqual(
    skills.list().map((skill) => skill.name),
    ["review"],
  );
  const tools = new ToolRegistry([skills.tool()]);
  const result = await tools.invoke(
    "skill",
    { name: "review" },
    { signal: new AbortController().signal },
  );
  assert.equal(result.status, "ok");
  assert.match(result.output.content, /Review all changes/);
});

test("compaction preserves recent context and tool/message pairing", () => {
  const messages = [
    { content: "first request", role: "user" },
    {
      content: "calling",
      opaqueArtifacts: [],
      role: "assistant",
      toolCalls: [{ callId: "call-1", input: null, name: "read_file" }],
    },
    {
      content: { text: "file contents" },
      role: "tool",
      toolCallId: "call-1",
    },
    { content: "second request", role: "user" },
    {
      content: "done",
      opaqueArtifacts: [],
      role: "assistant",
      toolCalls: [],
    },
  ];

  const result = compactProviderMessages(messages, 3);
  assert.equal(result.compacted, true);
  assert.ok(result.droppedMessages > 0);
  assert.equal(validateMessageOrder(result.messages), true);
  assert.equal(result.messages.at(-1).role, "assistant");
  assert.match(result.messages[0].content, /compacted prior context/);
  assert.match(result.summary, /call-1|first request/);
});
