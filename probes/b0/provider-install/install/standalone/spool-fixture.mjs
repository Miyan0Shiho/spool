#!/usr/bin/env node
const startMode =
  process.argv.find((arg) => arg.startsWith("--start-mode="))?.slice("--start-mode=".length) ??
  "single-file";

const result = {
  ok: true,
  startMode,
  cwd: process.cwd(),
  packageRoot: null,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  napi: process.versions.napi ?? null,
  globalSearchPathsDisabled: process.execArgv.includes("--no-global-search-paths"),
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
  process.stdout.write(`spool B0 fixture: ${startMode}\n`);
}
