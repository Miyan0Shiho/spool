# Cross-Source Comparisons

> Status: active
>
> Authority: [`../../RESEARCH_PLAN_V1.md`](../../RESEARCH_PLAN_V1.md)

This directory contains cross-source mechanism and capability comparisons. Each
comparison must keep source facts separate from interpretation and spool
recommendations, and must cite the pinned source revision or an external
first-party specification.

## Documents

- [`capability-matrix.md`](capability-matrix.md) applies the Batch 5 adoption
  and subtraction decisions across runtime, tools, sessions, security,
  extensions, product surfaces, evaluation, and frontier mechanisms.
- [`runtime-l0-l2.md`](runtime-l0-l2.md) compares entry assembly, the
  turn/step model, prompt construction, streaming settlement, cancellation,
  and durable session boundaries.
- [`security-and-execution-models.md`](security-and-execution-models.md)
  compares permission decisions, fail-closed behavior, workspace boundaries,
  sandbox interfaces, auditing, and execution environments.
- [`extensions-and-product-surfaces.md`](extensions-and-product-surfaces.md)
  compares commands, skills, hooks, MCP, plugins, custom tools, SDK, ACP, and
  product shells in DeepSeek Harness and Claude Code.

## Abandoned Documents

- [`incremental-lessons-from-adjacent-harnesses.md`](incremental-lessons-from-adjacent-harnesses.md)
  is retained as historical evidence only. The adjacent-source expansion was
  abandoned on 2026-09-19 and creates no active probe or product work.

## Evidence Sources

- [Source provenance](../source-atlas/00-provenance/source-provenance.md)
- [Evidence entry template](../templates/evidence-entry.md)
- [Research contracts](../README.md)

## Boundary

These documents synthesize evidence. They do not replace the source atlas and
they do not make product decisions. Stable conclusions belong in
[`../decisions/subtraction-log.md`](../decisions/subtraction-log.md) only after
the required evidence gate is satisfied.
