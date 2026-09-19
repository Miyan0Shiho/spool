# Repository Structure

> Status: the implementation architecture selects a single-package TypeScript
> layout. The runtime and development dependencies are locked, and the initial
> product skeleton is present.

## Goals

The repository separates four kinds of material that have different authority
and lifecycle:

- Current product and engineering documentation.
- Evidence-backed research.
- Historical design discussion.
- Local reference source snapshots.

This prevents a historical note, an upstream source copy, or a research
hypothesis from being mistaken for a current implementation contract.

## Current Layout

```text
docs/
  product/          Product positioning, scope, and release boundaries
  architecture/     Architecture, contracts, P0 plan, and repository structure
  delivery/         Current progress and implementation handoff
  decisions/        Accepted architecture decisions and revisit conditions
  history/          Superseded design notes retained for provenance
research/           Evidence maps, comparisons, benchmarks, and open research
probes/             Reproducible implementation-boundary evidence tools
benchmarks/         Executable fixtures and evaluators for frozen suites
.references/        Local-only upstream source snapshots, ignored by Git
src/                Product source root
tests/              Unit, integration, fixture, and evaluator tests
bin/                Installed executable entry point
```

The root directory intentionally contains only project entry files and these
top-level trees. Product code is not placed in `docs/` or `research/`.

## Why Research Remains Top-Level

Research artifacts have different rules from current engineering
documentation:

- They cite pinned source versions and external evidence.
- They may contain alternatives that were rejected or deferred.
- They must not acquire authority merely by being moved into `docs/`.

Keeping `research/` separate makes this distinction visible while still giving
the repository one documentation tree under `docs/`.

## Reference Sources

Upstream source snapshots live under `.references/`:

```text
.references/
  claude-code/
  deepseek-harness/
  deepseek-harness-snapshot/
```

They are local research inputs, not product source and not distributable
assets. The directory is ignored by Git. Product code must not import or copy
from it; the adoption and clean-room rules remain defined by
[product scope](../product/scope.md) and the
[execution contracts](execution-contracts.md).

## Implementation Layout

[P0 implementation architecture](implementation.md) selects a single package
with `src/`, `tests/`, `bin/`, and a build output directory. B0 did not justify
independently versioned runtime packages, so `apps/` and `packages/` remain out
of scope for P0.

The product directories use the Node 24.21.0 and TypeScript baseline selected by
B0 and must keep the following boundaries:

- CLI and headless surfaces share one runtime and session controller.
- Durable storage, provider adapters, tools, permissions, sandboxing, and
  context projection remain behind explicit ports.
- Core runtime code does not import a product surface or a concrete provider.
- Integration tests exercise real subprocesses, persistence, cancellation,
  crash recovery, and tarball installation.

An `apps/` plus `packages/` workspace can be introduced later only if measured
packaging or independent release requirements justify the added boundary.
