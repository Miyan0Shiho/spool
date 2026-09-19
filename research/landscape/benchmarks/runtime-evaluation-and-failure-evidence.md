# Runtime Evaluation and Failure-Mode Evidence

> Verified: 2026-09-19
>
> Scope: SWE-bench, Terminal-Bench, OSWorld, and current execution infrastructure.
>
> Use: evidence for benchmark design and failure taxonomy. No benchmark is adopted into P0 by this document.

## 1. Evaluation baseline

| Benchmark or harness | Pinned identity | Current status | License |
|---|---|---|---|
| SWE-bench | commit [`02e7a74`](https://github.com/SWE-bench/SWE-bench/tree/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e), 2026-09-02 | Active; no latest GitHub release endpoint observed; current CLI and harness are on `main` | MIT |
| Terminal-Bench legacy harness | commit [`d28711d`](https://github.com/harbor-framework/terminal-bench-1/tree/d28711d0da2675d0bb1d56de45ae5df6082438a3), package `0.2.18`, 2026-07-11 | Repository active but explicitly directs new users to Harbor and Terminal-Bench 2.0 | Apache-2.0 |
| Terminal-Bench 2.0 dataset | commit [`2fd12b8`](https://github.com/harbor-framework/terminal-bench-2/tree/2fd12b88aafdd04a52c298e3940bcb189f9766d6), 2026-04-30 | Task dataset active; no latest release endpoint observed; run through Harbor | Apache-2.0 |
| Harbor | commit [`b83e768`](https://github.com/harbor-framework/harbor/tree/b83e7686999a18ba90a8603794d7d18d42cab010), package `0.23.0`, 2026-09-18 | Active official harness for Terminal-Bench 2.0 and other benchmark datasets | Apache-2.0 |
| OSWorld | commit [`b138d34`](https://github.com/xlang-ai/OSWorld/tree/b138d348256078fa634fc3b73567a7337c793e6b), 2026-09-14 | Active on `main`; latest GitHub release remains `v0.1.16` from 2024-06-26 | Apache-2.0 |

## 2. SWE-bench

### Fact: task and success definition

- The benchmark starts with a repository and an issue and asks the model to produce a patch. Docker is used for reproducible evaluation.
- The harness applies the candidate patch, applies the benchmark test patch, runs the test command, parses test results, and computes a per-instance `resolved` boolean.
- Resolution depends on `FAIL_TO_PASS` and `PASS_TO_PASS` outcomes, not on textual similarity to a gold patch ([README](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/README.md), [`grading.py#L179-L306`](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/swebench/harness/grading.py#L179-L306)).
- SWE-bench Verified is a 500-problem subset confirmed by human engineers to be solvable. The main benchmark and Multimodal variants remain broader.

### Fact: execution and failure handling

- `run_instance()` handles image absence, patch application, test execution, timeout, report generation, and exceptions ([`run_evaluation.py#L229-L432`](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/swebench/harness/run_evaluation.py#L229-L432)).
- Parsing distinguishes an actual test run from an empty result. Missing test output is not treated as success ([`grading.py#L113-L178`](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/swebench/harness/grading.py#L113-L178)).
- The current harness cross-checks parsed status maps against recorded test-command exit status to resist spoofed output ([`grading.py#L25-L176`](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/swebench/harness/grading.py#L25-L176)).
- Infrastructure failures are classified separately from legitimate unresolved patches through `infra_failure.py`.
- The test suite includes failure and anti-spoof cases such as skipped tests, truncated test IDs, marker fallback, and spoofed output.

### Interpretation

- SWE-bench is a strong reference for patch-level correctness and regression preservation.
- Its harness explicitly guards several evaluator false positives, which is directly relevant to spool's required evidence discipline.
- It does not measure interactive approval, recovery after cancellation, user-visible diff quality, or context compaction quality.

### Unresolved

- The scan did not run the Docker harness or verify the current dataset partitions.
- Repository-specific test commands create substantial environment setup cost and may not resemble the short, controlled P0 benchmark planned by spool.

## 3. Terminal-Bench and Harbor

### Fact: current product boundary

- The legacy harness describes Terminal-Bench as a dataset plus a Docker terminal sandbox. The pinned package is `terminal-bench 0.2.18` and the README labels the original benchmark as beta with roughly 100 tasks ([legacy README](https://github.com/harbor-framework/terminal-bench-1/blob/d28711d0da2675d0bb1d56de45ae5df6082438a3/README.md)).
- The legacy README directs new users to Harbor and Terminal-Bench 2.0. Terminal-Bench 2.0 is now a task dataset; Harbor is the maintained execution framework ([Terminal-Bench 2.0 README](https://github.com/harbor-framework/terminal-bench-2/blob/2fd12b88aafdd04a52c298e3940bcb189f9766d6/README.md)).
- Harbor `0.23.0` supports arbitrary agents, local Docker execution, and remote providers, and describes itself as the official Terminal-Bench 2.0 harness ([Harbor README](https://github.com/harbor-framework/harbor/blob/b83e7686999a18ba90a8603794d7d18d42cab010/README.md)).

### Fact: failure taxonomy

The legacy harness exposes a structured `FailureMode` enum:

- `test_timeout`
- `agent_timeout`
- `unknown_agent_error`
- `parse_error`
- `fatal_llm_parse_error`
- `context_length_exceeded`
- `output_length_exceeded`
- `agent_installation_failed`
- `unknown`
- `none`

Source: [`failure_mode.py`](https://github.com/harbor-framework/terminal-bench-1/blob/d28711d0da2675d0bb1d56de45ae5df6082438a3/terminal_bench/agents/failure_mode.py).

- `TrialResults` stores the failure mode, parser results, timestamps, token counts, and resolved status ([`models.py#L31-L74`](https://github.com/harbor-framework/terminal-bench-1/blob/d28711d0da2675d0bb1d56de45ae5df6082438a3/terminal_bench/harness/models.py#L31-L74)).
- The harness continues to run tests after an agent timeout, but other agent failures remain visible in results ([`harness.py#L703-L818`](https://github.com/harbor-framework/terminal-bench-1/blob/d28711d0da2675d0bb1d56de45ae5df6082438a3/terminal_bench/harness/harness.py#L703-L818)).
- The pytest parser maps `passed`, `xfail`, and `skipped` to pass; it maps failures, errors, xpass, and unknown results to failure ([`pytest_parser.py`](https://github.com/harbor-framework/terminal-bench-1/blob/d28711d0da2675d0bb1d56de45ae5df6082438a3/terminal_bench/parsers/pytest_parser.py)).

### Interpretation

- Terminal-Bench contributes the best current adjacent taxonomy for distinguishing runtime failure from task failure.
- Separating agent timeout, test timeout, parse failure, context overflow, output overflow, and installation failure is more useful to spool than a single benchmark score.
- The migration to Harbor means benchmark infrastructure should not be copied from the legacy repository.

### Unresolved

- Harbor's remote-provider behavior, result persistence, and cross-provider equivalence were not executed.
- The current Terminal-Bench 2.0 task difficulty distribution and task-level failure taxonomy are not fully documented in the dataset repository.
- The legacy and 2.0 results are not directly comparable.

## 4. OSWorld

### Fact: task and success definition

- OSWorld runs an agent in a full desktop environment and evaluates the final environment state with task-specific getters and metrics.
- The pinned revision contains 369 task JSON files across Chrome, GIMP, LibreOffice, OS, Thunderbird, VLC, VS Code, and multi-app domains.
- Task metrics generally return a float score in `[0, 1]`; some are binary checks and others use fuzzy or field-level comparisons ([`general.py`](https://github.com/xlang-ai/OSWorld/blob/b138d348256078fa634fc3b73567a7337c793e6b/desktop_env/evaluators/metrics/general.py)).
- Providers include VMware, VirtualBox, Docker with KVM, AWS, Azure, Modal, Daytona, and others.

### Fact: failure handling

- The main runner catches exceptions per task and writes an `"Error"` entry to `traj.jsonl`, but the exception path does not automatically append a zero score to the same score list used by the normal path ([`run.py#L194-L231`](https://github.com/xlang-ai/OSWorld/blob/b138d348256078fa634fc3b73567a7337c793e6b/run.py#L194-L231)).
- `DesktopEnv.step()` returns environment feedback; numerical reward and automatic episode termination are explicitly left for task-specific logic rather than provided as a universal runtime reward ([`desktop_env.py#L416-L456`](https://github.com/xlang-ai/OSWorld/blob/b138d348256078fa634fc3b73567a7337c793e6b/desktop_env/desktop_env.py#L416-L456)).
- Many error or missing-file metric paths return `0`, which is useful for scoring but weakens the distinction between a wrong answer, an evaluation setup error, and an infrastructure failure.
- The README warns that missing Google/OAuth or proxy configuration can lower scores, which means infrastructure state is part of evaluation validity.

### Interpretation

- OSWorld is valuable for studying GUI observation, long trajectories, desktop sandboxing, and environment-state verification.
- It is not suitable as spool's P0 coding benchmark. Its environment, latency, credentials, and metric maintenance costs are far outside the first local coding-agent release gate.
- Its failure model reinforces a requirement for spool: infrastructure failure must be represented separately from task failure.

### Unresolved

- The scan did not execute a VM or evaluate a task.
- No single current error taxonomy comparable to Terminal-Bench was found in the core repository.
- The relationship between the latest `main` behavior and the 2025 OSWorld-Verified result set was not reproduced.

## 5. Failure-mode crosswalk

| Failure class | SWE-bench | Terminal-Bench / Harbor | OSWorld | Implication for spool |
|---|---|---|---|---|
| Agent/model timeout | Instance failure; infrastructure classification exists | Explicit `agent_timeout` | Usually task feedback or zero-score path; no unified enum observed | First-class metric |
| Test/command timeout | Harness timeout and error log | Explicit `test_timeout` | Depends on task script/provider | First-class metric |
| Tool or model parse failure | Malformed patch/test outcome | Explicit parse/fatal LLM parse modes | Often task-specific or zero score | First-class metric and recoverable UI state |
| Context exhaustion | Benchmark-level setup dependency; not a core category | Explicit `context_length_exceeded` | Not a core category | Must be tested as a runtime scenario |
| Output exhaustion | Not a core category | Explicit `output_length_exceeded` | Not a core category | Must be tested as a runtime scenario |
| Installation/environment failure | Infrastructure classification | Explicit `agent_installation_failed` | Provider/setup failures can contaminate score | Must be excluded from model-quality score |
| Wrong patch or final state | `resolved=false` from tests | `is_resolved=false` | Metric score below success threshold | Correct task failure |
| Unknown error | Harness error/exception | Explicit `unknown_agent_error` or `unknown` | Exception log with inconsistent score treatment | Must remain visible, never silently converted to success |

## 6. Benchmark design recommendations

1. **Start with SWE-bench-style outcome verification.** Use repository tasks with explicit pre/post tests and unrelated-file checks.
2. **Adopt Terminal-Bench-style failure separation.** Record timeout, parse, context, output, installation, and unknown-error classes independently from task success.
3. **Use Harbor as a source of harness design evidence, not a P0 dependency.** Its maintained implementation is more relevant than the legacy harness.
4. **Defer OSWorld.** GUI/desktop evaluation is useful after the core coding runtime and sandbox interfaces are stable.
5. **Measure recovery and safety explicitly.** Existing benchmarks do not fully cover cancellation, permission denial, compaction, or workspace escape.

## 7. Unresolved items

- No benchmark was executed in this scan.
- Current leaderboard comparability, dataset drift, and harness bugs were not independently reproduced.
- The 27-task `BENCH-FIXED-V1` specification is authored, but fixtures,
  evaluators, task-level failure-mode mappings, and immutable result records
  still need implementation.
- Benchmark success thresholds and release gates remain product decisions, not conclusions of this evidence page.

## Sources

- [SWE-bench README](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/README.md)
- [SWE-bench grading](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/swebench/harness/grading.py)
- [Terminal-Bench legacy failure modes](https://github.com/harbor-framework/terminal-bench-1/blob/d28711d0da2675d0bb1d56de45ae5df6082438a3/terminal_bench/agents/failure_mode.py)
- [Terminal-Bench 2.0](https://github.com/harbor-framework/terminal-bench-2/tree/2fd12b88aafdd04a52c298e3940bcb189f9766d6)
- [Harbor](https://github.com/harbor-framework/harbor/tree/b83e7686999a18ba90a8603794d7d18d42cab010)
- [OSWorld runner](https://github.com/xlang-ai/OSWorld/blob/b138d348256078fa634fc3b73567a7337c793e6b/run.py)
