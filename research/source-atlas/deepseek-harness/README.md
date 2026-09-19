# DeepSeek Harness Source Atlas

> Pinned revision: `c291e7961a515f6d7af9304e7fd1d257929aef26`
>
> Package version: `0.1.5-rc.2`
>
> Local path: `.references/deepseek-harness`

## Coverage

| Layer | Document |
|---|---|
| L0-L2 | [Entrypoints and runtime](01-entrypoints-runtime.md) |
| L3-L4 | [Tools, session, and context](02-tools-session-context.md) |
| L5-L8 | [Security, extensions, and operations](03-security-extensions-operations.md) |

## Trace

- [Trace A: no-tool turn](../traces/trace-a-deepseek-harness.md)
- [Trace B: coding turn](../traces/trace-b-deepseek-harness.md)
- [Trace C: cancellation, recovery, and compaction](../traces/trace-c-deepseek-harness.md)

## Batch scope

The current atlas covers the full L0-L8 inventory and the three runtime traces at source/mechanism depth. It records product behavior, source types/events, and test evidence separately. It does not make spool adoption decisions; only the linked evidence and unresolved items are authoritative for later subtraction.

## Research rules

- Treat package READMEs, tests, invariants, and Agent Notes as first-class evidence.
- Record symbols and paths at the pinned revision.
- Distinguish product defaults from optional bundles, experiments, internal prototypes, and test support.
- Do not reuse code without checking the exact file license and dependency obligations.
