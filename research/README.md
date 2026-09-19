# spool Research Knowledge Base

> Status: Batch 0-5 first-pass research complete; experiments and fixture
> implementation remain open
>
> Authority: [`PLAN.md`](./PLAN.md)
>
> Started: 2026-09-19

This directory stores evidence-backed research for the spool coding-agent product. It does not store copied source code. Source evidence remains in the pinned repositories under `.references/`, with paths, symbols, commits, and tests referenced from these documents.

## Research contracts

- Every material claim identifies its source and version.
- Facts, interpretations, and decisions are recorded separately.
- Source coverage begins with a complete inventory, then deepens only where decisions require it.
- External products, protocols, papers, benchmarks, and frontier signals are researched in parallel with the two core source trees.
- Nothing enters product scope without an explicit decision.

## Layout

```text
source-atlas/
  deepseek-harness/    L0-L8 source maps and traces
  claude-code/         L0-L8 source maps and traces
  traces/              Cross-source runtime traces
landscape/
  candidates/          Project and source registry
  protocols/           Protocol and ecosystem research
  benchmarks/          Fixed task suite, evaluation, and failure research
  products/            Adjacent product observations
  papers/              Mechanism and frontier research
frontier-radar/        Time-horizon watchlist
comparisons/           Cross-source capability and mechanism matrices
templates/             Reusable evidence formats
```

## Navigation

- Product architecture:
  [`architecture overview`](../docs/architecture/overview.md) records the independent,
  Claude-primary architecture direction and first-stage design candidates.
  Candidate design coverage does not change P0/P1 release scope.
- Design convergence and implementation handoff:
  [`execution contracts`](../docs/architecture/execution-contracts.md) and
  [`handoff`](../docs/delivery/handoff.md) distinguish selected technical baselines,
  unrun validation gates, and the confirmed basic-coding-agent first release.
- First implementation:
  [`P0 plan`](../docs/architecture/p0-plan.md) defines B0-B5,
  baseline acceptance, and deferred extensions;
  [`progress`](../docs/delivery/progress.md) records the current handoff status.
- Research registry and evidence contracts:
  [`candidate-registry.md`](landscape/candidates/candidate-registry.md) and
  [`evidence-entry.md`](templates/evidence-entry.md).
- Source maps:
  [`deepseek-harness`](source-atlas/deepseek-harness/README.md) and
  [`claude-code`](source-atlas/claude-code/README.md).
- Runtime traces:
  [`source-atlas/traces/README.md`](source-atlas/traces/README.md) indexes all
  six Trace A/B/C documents.
- Cross-source synthesis:
  [`comparisons/capability-matrix.md`](comparisons/capability-matrix.md),
  [`runtime-l0-l2.md`](comparisons/runtime-l0-l2.md),
  [`security-and-execution-models.md`](comparisons/security-and-execution-models.md),
  and
  [`extensions-and-product-surfaces.md`](comparisons/extensions-and-product-surfaces.md).
- External landscape:
  [`runtime-paradigm-scan.md`](landscape/products/runtime-paradigm-scan.md),
  [`mcp-acp-a2a-boundaries.md`](landscape/protocols/mcp-acp-a2a-boundaries.md),
  [`runtime-evaluation-and-failure-evidence.md`](landscape/benchmarks/runtime-evaluation-and-failure-evidence.md),
  and [`mechanism-notes.md`](landscape/papers/mechanism-notes.md).
- Frontier:
  [`2026-q3.md`](frontier-radar/2026-q3.md) and
  [`2026-09-current-mechanism-radar.md`](frontier-radar/2026-09-current-mechanism-radar.md).
- Product decisions:
  [`subtraction-log.md`](../docs/decisions/subtraction-log.md).

## Abandoned Research

The 2026-09-19 adjacent open-source harness expansion is abandoned. These files
remain only as historical evidence and must not create follow-up work:

- [`open-source-harness-radar-2026-09.md`](landscape/candidates/open-source-harness-radar-2026-09.md)
- [`codex-and-china-agent-open-source-2026-09.md`](landscape/candidates/codex-and-china-agent-open-source-2026-09.md)
- [`incremental-lessons-from-adjacent-harnesses.md`](comparisons/incremental-lessons-from-adjacent-harnesses.md)

## Batch Status

| Batch | First-pass research | Primary outputs | Explicitly still open |
|---|---|---|---|
| Batch 0 | Complete | [Source provenance](source-atlas/00-provenance/source-provenance.md), [license audit](source-atlas/00-provenance/dependency-and-license-audit.md), [candidate registry](landscape/candidates/candidate-registry.md) | Component-level reuse and transitive license decisions |
| Batch 1 | Complete | Both L0-L2 maps, both Trace A documents, [runtime comparison](comparisons/runtime-l0-l2.md), [external runtime scan](landscape/products/runtime-paradigm-scan.md) | Live provider traces and external runtime execution |
| Batch 2 | Complete | Both L3-L4 maps, all Trace B/C documents, [protocol comparison](landscape/protocols/mcp-acp-a2a-boundaries.md), [evaluation evidence](landscape/benchmarks/runtime-evaluation-and-failure-evidence.md), [mechanism notes](landscape/papers/mechanism-notes.md) | Context-compaction and session-format probes |
| Batch 3 | Complete | Both L5 maps and [security/execution comparison](comparisons/security-and-execution-models.md) | Sandbox experiments E1-E10 |
| Batch 4 | Complete | Both L6-L8 maps and [extension/product-surface comparison](comparisons/extensions-and-product-surfaces.md) | Executable extension probes and product-shell implementation |
| Batch 5 | First-pass complete | [Capability matrix](comparisons/capability-matrix.md) and [subtraction log](../docs/decisions/subtraction-log.md) | Probe outcomes, benchmark execution, and implementation choices |

## Benchmark Entry

- [`landscape/benchmarks/README.md`](landscape/benchmarks/README.md) defines the
  benchmark run and result-record contract.
- [`landscape/benchmarks/fixed-task-suite.md`](landscape/benchmarks/fixed-task-suite.md)
  freezes the 27-task `BENCH-FIXED-V1` specification. It contains no execution
  results.
- [`landscape/benchmarks/runtime-evaluation-and-failure-evidence.md`](landscape/benchmarks/runtime-evaluation-and-failure-evidence.md)
  maps SWE-bench, Terminal-Bench/Harbor, and OSWorld failure semantics to spool.

## Current Limits

- DeepSeek Harness tests were source-observed but not executed because
  dependencies are not installed.
- Claude Code remains a dirty source-map mirror without a license or complete
  build/test history.
- External runtime and benchmark findings were not reproduced locally.
- Adjacent open-source harness expansion was rejected as unnecessary scope
  growth. Do not reopen it without a specific P0 blocker.
- The fixed benchmark suite is frozen as a specification only; fixtures,
  evaluators, and result records do not yet exist.

## Completion rule

A batch is complete only when it contains locatable evidence, separates fact from interpretation, records unresolved questions, and updates the decision log where a conclusion is stable.
