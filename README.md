# spool

spool is an autonomous agent for real work, with reliable delivery as the
core requirement and sustained autonomy as the long-term direction. The first
delivery stage is a production-usable coding agent.

## Status

- Product scope, architecture, execution contracts, and the P0 plan are
  documented.
- B0 bounded probes are recorded in
  [docs/architecture/probes/b0.md](docs/architecture/probes/b0.md).
- The implementation architecture is selected in
  [docs/architecture/implementation.md](docs/architecture/implementation.md).
- B0 passed on Node 24.21.0, and the initial TypeScript package builds, tests,
  packs, and installs in a clean consumer directory.
- The first B1 vertical slice now covers durable input, run lifecycle,
  cancellation, fake-provider tool calls, artifact storage, and interrupted-run
  recovery.
- B2-B4 now include real workspace file/Shell tools, background process
  cancellation, permission decisions, an OpenAI-compatible provider, CLI and
  headless entry points, workspace instructions, declarative skills, and
  tool-pair-safe compaction.
- The B5 harness now has executable fixtures/evaluators for all 27 tasks. A
  separate calibration run was used to freeze thresholds, and a formal
  single-run record passes `27/27` with `0` fail and `0` infra errors.
- Post-install release validation and the final release report are recorded; the
  current private candidate is `0.1.0-rc.1`. Hardware power-loss durability is
  explicitly waived for P0 and is not promised.

## Start Here

- [Product scope](docs/product/scope.md)
- [Architecture overview](docs/architecture/overview.md)
- [Execution contracts](docs/architecture/execution-contracts.md)
- [P0 plan](docs/architecture/p0-plan.md)
- [Implementation architecture](docs/architecture/implementation.md)
- [B0 probe report](docs/architecture/probes/b0.md)
- [Current progress](docs/delivery/progress.md)
- [Release validation](docs/delivery/release-report.md)
- [Architecture decisions](docs/decisions/subtraction-log.md)
- [Research knowledge base](research/README.md)

## Repository Map

| Path | Purpose |
|---|---|
| `docs/` | Current product, architecture, delivery, decision, and historical documentation |
| `research/` | Evidence-backed source maps, comparisons, benchmarks, and open research |
| `probes/` | Reproducible implementation-boundary evidence tools |
| `benchmarks/` | Executable fixtures and evaluators for frozen task suites |
| `.references/` | Local-only upstream source snapshots; ignored by Git |

The implementation directories remain uncreated until the runtime and
development dependencies are approved.
