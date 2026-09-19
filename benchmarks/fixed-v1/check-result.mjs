import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const parsed = parseArgs({
  allowPositionals: false,
  options: {
    file: { type: "string" },
  },
});
if (!parsed.values.file) {
  throw new Error("--file is required");
}
const rows = readFileSync(parsed.values.file, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const thresholds = JSON.parse(
  readFileSync(
    join(root, "benchmarks", "fixed-v1", "thresholds.json"),
    "utf8",
  ),
).requirements;
const totals = rows.reduce(
  (result, row) => ({
    durationMs: result.durationMs + (row.durationMs ?? 0),
    inputTokens:
      result.inputTokens +
      (row.usage ?? []).reduce(
        (sum, usage) => sum + (usage.inputTokens ?? 0),
        0,
      ),
    modelCalls: result.modelCalls + (row.modelCalls ?? 0),
    outputTokens:
      result.outputTokens +
      (row.usage ?? []).reduce(
        (sum, usage) => sum + (usage.outputTokens ?? 0),
        0,
      ),
    toolCalls:
      result.toolCalls + (row.toolCalls?.length ?? 0),
    taskAttempts:
      result.taskAttempts + (row.attempts?.length ?? 1),
  }),
  {
    durationMs: 0,
    inputTokens: 0,
    modelCalls: 0,
    outputTokens: 0,
    toolCalls: 0,
    taskAttempts: 0,
  },
);
const pass = rows.filter((row) => row.status === "pass").length;
const fail = rows.filter((row) => row.status === "fail").length;
const infra = rows.filter((row) => row.status === "infra_error").length;
assert.equal(rows.length, thresholds.tasks);
assert.ok(pass >= thresholds.minimumPass);
assert.ok(fail <= thresholds.maximumFail);
assert.ok(infra <= thresholds.maximumInfraError);
assert.ok(totals.durationMs <= thresholds.maximumTotalDurationMs);
assert.ok(totals.modelCalls <= thresholds.maximumModelCalls);
assert.ok(totals.inputTokens <= thresholds.maximumInputTokens);
assert.ok(totals.outputTokens <= thresholds.maximumOutputTokens);
assert.ok(totals.toolCalls <= thresholds.maximumToolCalls);
assert.ok(totals.taskAttempts <= thresholds.maximumTaskAttempts);
for (const taskId of thresholds.criticalTasks) {
  assert.equal(
    rows.find((row) => row.taskId === taskId)?.status,
    "pass",
  );
}
console.log(
  JSON.stringify(
    { fail, infra, pass, passRate: pass / rows.length, totals },
    null,
    2,
  ),
);
