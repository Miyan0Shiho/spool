# spool 0.1.0-rc.1

This is a private release candidate for the P0 coding-agent runtime.

## Included

- Interactive CLI and headless execution over one shared runtime.
- Durable session/run/event/artifact storage with single-owner locking.
- File discovery, reading, search, exact edit, file creation, Shell, and
  background jobs.
- Allow/ask/deny permission decisions with PTY-tested streaming interaction,
  tool progress, approval, and prompt return.
- macOS Seatbelt process confinement and credential-filtered Shell environment.
- DeepSeek-backed real-provider coding execution through an OpenAI-compatible
  streaming adapter.
- Workspace instructions, declarative project skills, cancellation, recovery,
  output spill, and tool-pair-safe compaction.
- `BENCH-FIXED-V1` formal result: 27 pass, 0 fail, 0 infra errors.

## Validation

- `npm run check`
- `npm run release:check`
- `npm run bench:check -- --file benchmarks/fixed-v1/results/BENCH-FIXED-V1-2026-09-19-formal.jsonl`

## Limits

- Hardware power-loss durability is not promised. Process-crash recovery,
  WAL, `fullfsync`, and artifact synchronization are retained.
- macOS Seatbelt remains partial because of the known hard-link escape.
- OpenAI direct connectivity was unavailable from this environment; DeepSeek is
  the real-provider validation route.
- This candidate is private and has not been published.
