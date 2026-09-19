# BENCH-FIXED-V1 harness

The normative task specification remains
[`research/landscape/benchmarks/fixed-task-suite.md`](../../research/landscape/benchmarks/fixed-task-suite.md).
This directory contains the executable fixtures and evaluators.

The manifest now marks all 27 tasks as `implemented`: each has a generated
fixture, acceptance evaluator, allowed paths, protected files, and a gold patch.

Run implemented tasks with a real provider:

```bash
DEEPSEEK_API_KEY=... npm run bench:fixed -- --tasks T01,T02,T03,T18
```

Run the harness self-check without a model:

```bash
npm run bench:fixed -- --tasks T01,T02,T03,T18 --mode gold
```

Results are JSONL records written under `benchmark-results/`. They include the
acceptance exit code, changed paths, provider/model metadata, usage, tool calls,
and whether protected fixture files changed. Missing credentials or tools must
be reported as `infra_error`; they are never converted into task failures.

Formal evidence is summarized from one file:

```bash
npm run bench:summary -- --file benchmarks/fixed-v1/results/BENCH-FIXED-V1-2026-09-19-formal.jsonl
npm run bench:check -- --file benchmarks/fixed-v1/results/BENCH-FIXED-V1-2026-09-19-formal.jsonl
```
