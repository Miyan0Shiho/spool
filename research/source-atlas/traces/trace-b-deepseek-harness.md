# Trace B: DeepSeek Harness Coding Turn

> Pinned revision: `c291e7961a515f6d7af9304e7fd1d257929aef26`
>
> Package version: `0.1.5-rc.2`
>
> Scope: repository understanding -> read/search -> edit -> command/test -> tool回填 -> final report
>
> Test status: test coverage below is source-observed; Vitest was not executed.

## Scenario

This trace follows a representative coding request:

1. The model reads and searches the workspace.
2. It edits one text file.
3. It runs a shell verification command.
4. Tool results are committed to the session.
5. The next model step uses those results and produces the final answer.

The path is reconstructed from source and focused tests. It is not a captured live provider transcript.

## Sequence

| Stage | Source evidence | Runtime/session fact |
|---|---|---|
| 1. Coding prompt enters the inbox | `packages/core/agent/src/runtime-types.ts:217-241` | Follow-up wakes the loop |
| 2. Turn and step open | `packages/core/agent-loop/src/agent.ts:268-307` | `turn/start`, `step/start` |
| 3. Prompt assembly exposes tools | `packages/core/system-prompt/src/index.ts:552-627`; `packages/core/tools/src/index.ts:780-840` | Visible schemas include `read`, search, `edit`/`write`, `bash` as composed |
| 4. First model response contains tool calls | `packages/core/agent-loop/src/agent.ts:466-489` | Assistant message settles, then tool scheduling begins |
| 5. Calls are converted and logged | `packages/core/agent-loop/src/tool-calls.ts:68-81`, `.research/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:262-289` | `tool/call` before policy/body |
| 6. Policy and guards run | `docs/tool-execution-pipeline.md:6-60` | Allow/deny/ask or monotonic denial |
| 7. Tool bodies execute | `packages/core/tools/src/index.ts:140-190` | Dispatch wrappers and post-processing |
| 8. Results commit in model order | `packages/core/agent-loop/src/tool-calls.ts:146-160`, `.research/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:268-289` | `tool/result` linked to `tool/call` |
| 9. Additional contexts enter next step | `packages/core/agent-loop/src/tool-calls.ts:156-159` | Ordered next-step inbox items |
| 10. Step ends, next step derives history | `packages/core/agent-loop/src/agent.ts:311-320` | Model sees tool call/results and any context |
| 11. Final no-tool response completes | `packages/core/agent-loop/src/agent.ts:311-320`; `packages/core/agent-loop/src/agent.ts:486-492` | `step/end`, `turn/end { completed }` |
| 12. Surface/caller displays result | `packages/api/session-controller/src/history.ts:54-170` | Durable events + live stream projection |

## Read path

### `read`

- Source: `packages/fs/tool-fs/src/read.ts`.
- Fact: the tool resolves the session cwd, resolves the target through `ctx.fs`, reads one bounded text window, and emits `fs/observed` with the provider version after success (`.research/deepseek-harness/packages/fs/tool-fs/src/read.ts:77-165`).
- Fact: read output is line-numbered and bounded by `readLimit`, `readMaxLineLength`, and `readMaxBytes`; the footer tells the model how to continue (`.research/deepseek-harness/packages/fs/tool-fs/README.md:42-64`, `.research/deepseek-harness/packages/fs/tool-fs/README.md:178-186`).
- Durable result: one `tool/result` message containing the bounded read envelope; the matching `tool/call` preserves the requested path/range.

### `glob` / `grep`

- Source: `packages/fs/tool-fs-search`.
- Fact: each call invokes the packaged ripgrep binary through `ctx.subprocess.spawn()` with a plain argv vector and no shell layer (`.research/deepseek-harness/packages/fs/tool-fs-search/README.md:89-110`).
- Fact: raw stdout/stderr have transport caps; inline logical results have separate caps. Over-cap formatted results are best-effort spilled, while a spill failure keeps the inline page and reports that the complete result was not saved (`.research/deepseek-harness/packages/fs/tool-fs-search/README.md:108-110`).
- Durable result: one bounded `tool/result`; when capped, it includes omission count and a spill locator/retrieval hint.

## Mutation path

### `edit`

1. The tool resolves the sandbox policy for the calling session.
2. If escalation arguments are present, it validates and asks `ctx.approval` before any filesystem operation.
3. It resolves the target and obtains an edit intent through the `fs/edit-intent` waterfall.
4. The observation policy requires a prior read and supplies a version guard; unseen targets fail `FS_NOT_OBSERVED`, observed-absent targets fail `FS_NOT_FOUND`, and stale versions fail `FS_STALE_VERSION` (`.research/deepseek-harness/packages/fs/fs-observation-policy/src/index.ts:116-130`).
5. `ctx.fs.editText()` performs the atomic provider operation.
6. On success, the tool emits synchronous `fs/observed` with the new version (`.research/deepseek-harness/packages/fs/tool-fs/src/edit.ts:117-141`).

### `write`

- The path is parallel to edit: resolve policy, resolve target, acquire `fs/write-intent`, call `ctx.fs.writeText()`, then emit `fs/observed` (`.research/deepseek-harness/packages/fs/tool-fs/src/write.ts:110-124`).
- Under the observation policy, unseen/absent resolves to `createIfAbsent`; an observed present target resolves to `replaceIfVersion` (`.research/deepseek-harness/packages/fs/fs-observation-policy/README.md:72-78`).

### Sandbox branch

- `read-only`: mutation is denied with `FS_SANDBOX_DENIED`.
- `workspace-write`: the backend recanonicalizes the target immediately and requires containment under the session workspace or platform temp roots.
- `danger-full-access`: the backend delegates unfenced.
- Approved escalation applies one wider mode to exactly this call.

Evidence: `.research/deepseek-harness/packages/fs/fs-sandbox/src/index.ts:69-145`, `.research/deepseek-harness/packages/fs/tool-fs/src/sandbox.ts:76-129`.

## Verification command path

### Foreground `bash`

1. `parseBashArgs()` validates command, description, timeout, background flag, and escalation pairing (`.research/deepseek-harness/packages/shell/tool-bash/src/index.ts:53-68`).
2. The tool resolves a per-call sandbox policy from the calling session (`.research/deepseek-harness/packages/shell/tool-bash/src/index.ts:190-205`).
3. An escalation, if present, is approved before execution (`.research/deepseek-harness/packages/shell/tool-bash/src/index.ts:202-236`).
4. The request is resolved into `ctx.shell`; the sandboxing executor wraps `['bash','-c',command]` through `ctx.sandbox.confine()` (`.research/deepseek-harness/packages/shell/bash-sandbox/README.md:76-91`).
5. The renderer combines stdout/stderr with bounded tails and conditional markers for truncation, denial, timeout, signal, and exit code (`.research/deepseek-harness/packages/shell/tool-bash/README.md:158-170`).
6. A nonzero exit remains an ordinary tool result for the model to inspect; only infrastructure failures become tool errors (`.research/deepseek-harness/packages/shell/tool-bash/README.md:80-83`, `.research/deepseek-harness/packages/shell/tool-bash/README.md:186-194`).

### Background command

- `run_in_background: true` delegates detached ownership to `ctx.jobs` and returns `started background job <jobId>` (`.research/deepseek-harness/packages/shell/tool-bash/src/index.ts:348-378`).
- The generic job runtime owns id, owner fence, status, output cursor, cancellation, and completion-notice delivery (`.research/deepseek-harness/packages/jobs/tool-jobs/README.md:28-43`).
- A completion notice can enter a busy agent's next step or wake an idle agent, bounded by `maxConsecutiveWakes`; quiet mode disables idle wakeups (`.research/deepseek-harness/packages/jobs/tool-jobs/README.md:40-59`).

## Durability checkpoints

- Before the model adapter is invoked, the logged request prefix is flushed (`packages/session/session-checkpoint-policy/src/index.ts:64-68`, `.research/deepseek-harness/packages/session/session-checkpoint-policy/src/index.ts:29-38`).
- Before a top-level tool body, the logged `tool/call` and preceding prefix are flushed. Nested PTC calls reuse the outer checkpoint (`.research/deepseek-harness/packages/session/session-checkpoint-policy/src/index.ts:70-75`).
- Before the next request is derived, the preceding step's results are flushed through `agent/pre-step` (`.research/deepseek-harness/packages/session/session-checkpoint-policy/src/index.ts:77-82`).

## Failure branches

| Failure | Observable result | Recovery |
|---|---|---|
| Tool not visible | `UNKNOWN_TOOL` result | Model chooses a visible tool |
| Invalid tool arguments | Schema or tool validation error result | Model corrects arguments |
| Read-before-edit missing | `FS_NOT_OBSERVED` normalized to an actionable error | Read, then retry |
| File changed after read | `FS_STALE_VERSION` | Reread, then retry |
| Sandbox mutation denied | `FS_SANDBOX_DENIED` plus denial/escalation markers | One approved wider-mode retry or stop |
| Shell command exits nonzero | Normal result with `[exit code: N]` | Model investigates and edits/retests |
| Shell sandbox runner missing/fails | `SANDBOX_UNAVAILABLE` or runner-failure result | Repair runner or stop; never run unconfined |
| Cancellation during tool group | Started calls drain; unstarted calls receive `ABORTED_BEFORE_DISPATCH` | Turn aborts; Trace C resumes/continues |

## Tests supporting Trace B

- `packages/core/agent-loop/tests/tool-calls.spec.ts` and `tool-order.spec.ts`: call/result order, barriers, parallel pool, cancellation pairing.
- `packages/core/tools/tests/tools.spec.ts`: pre/guards/execute/post/finalize/result, approval, wrapping, structured errors.
- `packages/fs/tool-fs/tests/*` and `packages/fs/fs-observation-policy/tests/policy.spec.ts`: read, write, edit, observation and recovery messages.
- `packages/fs/fs-sandbox/tests/fs-sandbox.spec.ts`: containment and per-call escalation.
- `packages/shell/tool-bash/tests/*` and `packages/shell/bash-sandbox/tests/*`: foreground/background execution and sandbox result classification.
- `packages/session/session-checkpoint-policy/tests/crash-recovery.e2e.ts`: request and tool-intent durability boundaries.

## Unresolved

- No end-to-end repository edit/test task was executed against a live model/provider.
- The exact tool call sequence is model-dependent; this trace describes reachable machinery, not a required policy the model always follows.
- Bash spill files, sandbox platform prerequisites, and real command output were not exercised in this batch.
