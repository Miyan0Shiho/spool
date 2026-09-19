#!/usr/bin/env node
import { runFixture } from "../src/main.mjs";

const modeArg = process.argv.find((arg) => arg.startsWith("--start-mode="));
const startMode = modeArg?.slice("--start-mode=".length) ?? "package-bin";
const result = runFixture(startMode, import.meta.url);

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
  process.stdout.write(`spool B0 fixture: ${startMode}\n`);
}
