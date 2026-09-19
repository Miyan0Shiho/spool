# Runtime Trace Index

> Status: source/mechanism traces complete for the pinned revisions
>
> Authority: [`../../../research/PLAN.md`](../../PLAN.md)

These traces connect the layered source atlases to end-to-end runtime paths.
They are reconstructed from pinned source and source-observed tests, not from
new live-provider or crash-injection runs.

## DeepSeek Harness

- [Trace A: no-tool turn](trace-a-deepseek-harness.md)
- [Trace B: coding turn](trace-b-deepseek-harness.md)
- [Trace C: cancellation, crash recovery, and compaction](trace-c-deepseek-harness.md)

## Claude Code Mirror

- [Trace A: pure model turn](trace-a-claude-code.md)
- [Trace B: repository coding turn](trace-b-claude-code.md)
- [Trace C: interruption, failure, compaction, and recovery](trace-c-claude-code.md)

## Evidence Limits

- The pinned source and exact revisions remain in the atlas provenance.
- DeepSeek Harness tests were not executed because dependencies are absent.
- Claude Code remains a dirty, unlicensed source-map mirror without tests or a
  complete build path.
- No live provider, sandbox, or destructive crash experiment was run for these
  traces.
