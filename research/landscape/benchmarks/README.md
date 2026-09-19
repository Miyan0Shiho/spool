# Fixed Benchmark Suite

> Status: frozen specification
>
> Suite version: `BENCH-FIXED-V1`
>
> Frozen on: 2026-09-19
>
> Canonical task file: [`fixed-task-suite.md`](fixed-task-suite.md)
>
> Product authority: [`../../../docs/product/scope.md`](../../../docs/product/scope.md)

This directory defines the fixed small-repository task suite used to evaluate the
P0 coding-agent loop and will contain the fixtures, evaluators, and run
artifacts required to execute it. This revision contains the frozen
specification only. It does not contain generalized product decisions or
benchmark results that have not actually been produced.

## Freeze contract

- The suite currently contains 27 tasks: `T01` through `T27`.
- `BENCH-FIXED-V1` freezes task intent, fixture invariants, allowed changes,
  acceptance commands, safety observations, recovery conditions, cost fields,
  and manual scoring rules.
- No pass rate, recovery rate, safety result, token count, or duration exists
  until a real run produces a machine-readable result.
- Once a task has been run, its ID and meaning must not silently change. A
  material change creates `BENCH-FIXED-V2`; V1 results remain attached to V1.
- Editing a fixture, evaluator, or task prompt invalidates prior fixture
  digests and requires a new suite version unless the change only fixes
  documentation without affecting behavior.
- This directory does not modify or supersede entries in
  [`../../decisions/subtraction-log.md`](../../../docs/decisions/subtraction-log.md).
- The fixture generators and evaluator assets referenced by the task suite have
  not been materialized in this revision. A run must not start until they exist
  and pass their own setup checks.

## Coverage

| Area | Tasks | Count |
|---|---|---:|
| Single-file bug fix | T01-T03 | 3 |
| Cross-file feature | T04-T06 | 3 |
| Failing-test localization and repair | T07-T09 | 3 |
| Behavior-preserving refactor | T10-T12 | 3 |
| Test completion | T13-T15 | 3 |
| Dependency or configuration repair | T16-T18 | 3 |
| Git workspace safety | T19-T21 | 3 |
| Long command and background work | T22-T23 | 2 |
| Interruption recovery | T24-T25 | 2 |
| Workspace-boundary denial behavior | T26 | 1 |
| Workspace cleanup and containment safety | T27 | 1 |

## Fixture policy

1. The default fixture source is a deterministic local generator. It must create
   the repository from versioned files, not from an unpinned network download.
2. An existing open-source repository may replace a generated fixture only when
   the slice is small, the license permits the intended use, and the setup
   records repository URL, exact commit, license, sparse paths, and content
   digest in `.benchmark-lock.json`.
3. Runtime execution must be offline by default. Any task requiring a local
   package server must bind to loopback and use artifacts included by the
   fixture lock.
4. Fixtures must exclude credentials, personal files, production data, and
   symlinks that cross the benchmark root unless the task explicitly tests
   that boundary.
5. Evaluation compares against the declared initial digest and allowlist.
   Evaluator files and hidden expectations must live outside the agent-visible
   workspace.

## Run pipeline

For each task, the benchmark runner must:

1. Materialize a fresh fixture into an isolated workspace.
2. Record the fixture lock and content digest before the agent starts.
3. Run the fixed task prompt under a documented timeout and model/runtime
   configuration.
4. Execute the objective acceptance command without modifying the evaluator.
5. Capture the final diff, untracked files, process list, permission events,
   and relevant logs.
6. Apply the allowlist, safety evaluator, and recovery checks.
7. Complete the manual review using the score anchors in the task suite.
8. Write one immutable result record. Failed or interrupted runs are recorded;
   they are not replaced by an optimistic summary.

## Required result record

Every run must record at least:

```yaml
run_id:
task_id:
suite_version: BENCH-FIXED-V1
fixture_digest:
agent_version:
model:
prompt_digest:
started_at:
ended_at:
wall_ms:
model_calls:
input_tokens:
output_tokens:
tool_calls:
shell_commands:
file_writes:
permission_requests:
retries:
compactions:
recovery_attempts:
background_processes:
acceptance_exit:
test_exit:
unrelated_changes:
unsafe_operations:
manual_score:
final_status:
artifact_paths:
```

`final_status` must be one of `pass`, `fail`, `aborted`, or `infra_error`.
`infra_error` never counts as an agent success and must include the failing
setup command and raw log.

## P0 gate summary

The suite directly exercises these fixed-scope requirements:

- Complete a natural-language coding task from repository inspection through
  verification and final reporting.
- Use file discovery, search, reads, precise edits, shell commands, background
  jobs, and result truncation correctly.
- Preserve workspace boundaries and enforce allow, ask, and deny behavior.
- Keep Git operations non-destructive when unrelated work exists.
- Persist enough session state to resume after interruption without losing or
  duplicating changes.
- Report changed files, verification evidence, remaining risk, and unfinished
  work accurately.

The suite does not evaluate Desktop, RSI, proactive perception, flow templates,
multi-agent organization, or other frozen directions.
