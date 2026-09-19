import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const parsed = parseArgs({
  allowPositionals: false,
  options: {
    file: { type: "string" },
    results: {
      type: "string",
      default: join(root, "benchmark-results"),
    },
  },
});
const manifest = JSON.parse(
  readFileSync(join(root, "benchmarks", "fixed-v1", "manifest.json"), "utf8"),
);
const latest = new Map();
const files = parsed.values.file
  ? [parsed.values.file]
  : existsSync(parsed.values.results)
    ? readdirSync(parsed.values.results)
        .filter((file) => file.endsWith(".jsonl"))
        .sort()
        .map((file) => join(parsed.values.results, file))
    : [];
if (files.length > 0) {
  for (const file of files) {
    const rows = readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    for (const row of rows) {
      latest.set(row.taskId, row);
    }
  }
}

const states = manifest.tasks.map((task) => {
  if (task.status === "spec-only") {
    return { id: task.id, state: "spec-only" };
  }
  const result = latest.get(task.id);
  return {
    id: task.id,
    state: result?.status ?? "not-run",
  };
});
const counts = Object.fromEntries(
  ["pass", "fail", "infra_error", "not-run", "spec-only"].map((state) => [
    state,
    states.filter((entry) => entry.state === state).length,
  ]),
);
console.log(JSON.stringify({ counts, states }, null, 2));
