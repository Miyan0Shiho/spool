import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const [mode, root] = process.argv.slice(2);
if (!["exit", "block"].includes(mode) || !root) {
  console.error("usage: parent-spawn.mjs exit|block ROOT");
  process.exit(64);
}

const marker = join(root, `${mode}-descendant`);
const child = spawn(
  "/bin/sh",
  [
    "-c",
    `trap '' HUP TERM; /bin/sleep 300 & echo $$ > ${marker}.shell.pid; ` +
      `echo $! > ${marker}.sleep.pid; wait`,
  ],
  {
    detached: true,
    stdio: "ignore",
  },
);

child.unref();
writeFileSync(
  `${marker}.json`,
  JSON.stringify({ mode, parentPid: process.pid, childPid: child.pid }, null, 2) +
    "\n",
);

if (mode === "block") {
  setInterval(() => {}, 1_000);
} else {
  process.exit(0);
}
