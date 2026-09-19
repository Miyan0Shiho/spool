import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [mode, recordPath, helper] = process.argv.slice(2);
if (!["check", "terminate-stale", "terminate-valid"].includes(mode) || !recordPath || !helper) {
  console.error("usage: recover-check.mjs check|terminate-stale|terminate-valid RECORD PID_IDENTITY_HELPER");
  process.exit(64);
}

const record = JSON.parse(readFileSync(recordPath, "utf8"));
const probe = spawnSync(helper, [String(record.pid)], { encoding: "utf8" });
if (probe.status !== 0) {
  console.log(
    JSON.stringify(
      {
        mode,
        record,
        identityMatched: false,
        action: "refused",
        reason: "identity-unreadable",
        helperStatus: probe.status,
        helperStderr: probe.stderr.trim(),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const fields = Object.fromEntries(
  probe.stdout
    .trim()
    .split(/\s+/)
    .map((part) => {
      const splitAt = part.indexOf("=");
      return [part.slice(0, splitAt), part.slice(splitAt + 1)];
    }),
);
const actual = {
  pid: Number(fields.pid),
  ppid: Number(fields.ppid),
  pgid: Number(fields.pgid),
  startSec: Number(fields.start_sec),
  startUsec: Number(fields.start_usec),
};
const identityMatched =
  actual.pid === record.pid &&
  actual.pgid === record.pgid &&
  actual.startSec === record.startSec &&
  actual.startUsec === record.startUsec;

let action = identityMatched ? "identity-confirmed" : "refused";
if (mode === "terminate-stale") {
  action = "refused";
} else if (mode === "terminate-valid" && identityMatched) {
  process.kill(-record.pgid, "SIGTERM");
  action = "signalled-process-group";
}

console.log(
  JSON.stringify(
    {
      mode,
      record,
      actual,
      identityMatched,
      action,
      rawProbe: probe.stdout.trim(),
    },
    null,
    2,
  ),
);
