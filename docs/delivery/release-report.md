# spool P0 release validation

> Date: 2026-09-19
>
> Status: implementation, benchmark, installed-artifact, and PTY approval gates
> pass; publication has not been requested.

## Environment

| Item | Value |
|---|---|
| Platform | macOS 15.2, arm64 |
| Runtime | Node `24.21.0` |
| SQLite | `3.53.4` |
| Package version | `0.1.0-rc.1` |
| Provider | DeepSeek `deepseek-flash`, OpenAI-compatible chat completions |
| Network | Provider requests use the host network; Shell/background tools fail closed without network |

## Core Validation

`npm run check` passed:

- TypeScript typecheck.
- 6 unit tests.
- 39 integration tests.
- Automated `npm pack`, clean consumer install, and CLI startup.

This covers durable input/run records, single-owner SQLite, interrupted-run
recovery, unknown tool settlement, cancellation races, file/workspace
boundaries, Shell process groups, background jobs, spill output, permissions,
context compaction, workspace instructions, project skills, and provider stream
normalization.

## Real Coding Validation

DeepSeek `deepseek-flash` completed a real repository task:

- inspected a failing Node fixture;
- ran the failing test;
- edited the implementation;
- reran the test;
- returned a final report;
- external verification passed without modifying tests.

The OpenAI-compatible adapter preserves tool calls, usage, provider/model
metadata, abort behavior, HTTP errors, and opaque reasoning artifacts.

## Fixed Benchmark

Calibration and threshold files:

- `benchmarks/fixed-v1/results/BENCH-FIXED-V1-2026-09-19.jsonl`
- `benchmarks/fixed-v1/thresholds.json`

Formal result:

- `benchmarks/fixed-v1/results/BENCH-FIXED-V1-2026-09-19-formal.jsonl`

Formal result summary:

| Metric | Result |
|---|---:|
| Pass | 27 |
| Fail | 0 |
| Infra errors | 0 |
| Task attempts | 27 |
| Model calls | 274 |
| Input tokens | 1,226,788 |
| Output tokens | 96,789 |
| Tool calls | 375 |
| Wall time | 640,316 ms |

The formal run passes the frozen `27/27`, zero-fail, zero-infra, duration,
model-call, token, tool-call, attempt, and critical-task thresholds.

## Installed Artifact Validation

`npm run release:check` passed from a tarball installed into a separate consumer
directory:

```json
{
  "cancellation": "pass",
  "packageInstall": "pass",
  "projectSkill": "pass",
  "provider": "pass",
  "recovery": "pass",
  "version": "spool 0.1.0-rc.1"
}
```

The installed artifact was imported directly; tests did not run from the source
tree.

## Known Limitations

- Hardware power loss, OS crash, and filesystem cache-loss injection are waived
  for P0 by DEC-044 and not promised. Process-crash and `fullfsync` behavior are
  recorded in `docs/architecture/probes/k01-durability.md`.
- macOS Seatbelt remains `partial`: pre-created hard links can escape the
  write boundary.
- Shell read confinement is tested on macOS 15.2 arm64 only.
- Interactive behavior has automated PTY coverage for streaming text, tool
  progress, allow/deny approval, and prompt return. A human usability session
  is optional and is not a P0 gate.
- OpenAI direct connectivity timed out from this environment; real provider
  evidence uses DeepSeek.
- The package is `private` at version `0.1.0-rc.1`; no npm publication or Git
  tag has been created.
- No commit or push was performed as part of this validation.

## Release Decision

The implementation, frozen benchmark, installed-artifact, and interactive PTY
approval gates pass. A private `0.1.0-rc.1` candidate is prepared. Hardware
power-loss durability is explicitly excluded from the P0 claim. Publication is
not performed because no commit/push/tag/release action has been requested.
