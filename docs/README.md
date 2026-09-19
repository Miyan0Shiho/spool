# spool Documentation

This directory is the single documentation tree for spool. It separates
current product and engineering truth from historical design discussion.

## Navigation

| Area | Entry point |
|---|---|
| Product scope | [product/scope.md](product/scope.md) |
| Architecture | [architecture/overview.md](architecture/overview.md) |
| Execution contracts | [architecture/execution-contracts.md](architecture/execution-contracts.md) |
| P0 implementation | [architecture/p0-plan.md](architecture/p0-plan.md) |
| Implementation architecture | [architecture/implementation.md](architecture/implementation.md) |
| B0 probe report | [architecture/probes/b0.md](architecture/probes/b0.md) |
| K01 durability boundary | [architecture/probes/k01-durability.md](architecture/probes/k01-durability.md) |
| Repository structure | [architecture/repository-structure.md](architecture/repository-structure.md) |
| Progress and handoff | [delivery/progress.md](delivery/progress.md) |
| Release validation | [delivery/release-report.md](delivery/release-report.md) |
| Release candidate notes | [delivery/release-notes-0.1.0-rc.1.md](delivery/release-notes-0.1.0-rc.1.md) |
| Architecture decisions | [decisions/subtraction-log.md](decisions/subtraction-log.md) |
| Historical design notes | [history/](history/) |
| Research evidence | [../research/README.md](../research/README.md) |

## Authority

1. The latest user instruction and the current repository state take priority.
2. [product/scope.md](product/scope.md) defines product and release scope.
3. [architecture/execution-contracts.md](architecture/execution-contracts.md)
   defines internal contracts and verification requirements.
4. [architecture/p0-plan.md](architecture/p0-plan.md) defines the current
   implementation batch and release gates.
5. `research/` provides evidence and interpretation; it does not silently
   promote a capability into P0.
6. `history/` preserves earlier decisions but is not current authority.
