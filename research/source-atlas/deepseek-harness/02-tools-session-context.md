# DeepSeek Harness L3-L4: Tools, Session, and Context

> Pinned revision: `c291e7961a515f6d7af9304e7fd1d257929aef26`
>
> Package version: `0.1.5-rc.2`
>
> Source root: `.references/deepseek-harness`
>
> Scope: L3 tool lifecycle and L4 session/context/compaction/recovery

## L3: Tool system

### Registry and model-facing schemas

- `F-L3-01`: `ToolRuntime` is a scoped Cordis service exposed as `ctx.tools`. It stores typed tool definitions and projects only model-facing name, description, and JSON Schema into the system-prompt assembly; execute/finalize/presentation/timeout fields never reach the wire (`.references/deepseek-harness/packages/core/tools/README.md:93-118`, `.references/deepseek-harness/packages/core/tools/src/index.ts:780-840`).
- `F-L3-02`: A model call is represented as an identified `tool-call` content block. The loop converts it into a `ToolExecutionInput` containing `callId`, `name`, parsed raw arguments, the initiating Agent, and the live signal (`.references/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:20-31`, `.references/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:68-81`).
- `F-L3-03`: The loop appends `tool/call` before pre-execution and before the tool body. The matching `tool/result` cites the call event through `sourceEventSeqs`, preserving a replayable call/result relation (`.references/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:262-289`).
- `F-L3-04`: Per-agent restrictions, scoped registrations, and scoped shadows are resolved by `ctx.tools.get()`, `schemas()`, and `restrict()`. Tool visibility is therefore agent-specific rather than a single process-wide list (`.references/deepseek-harness/packages/core/tools/README.md:79-85`).

### Execution pipeline

The shipped pipeline is fixed and extension points are events rather than edits to the loop:

```text
tools/pre-execute
-> monotonic registered guards
-> tools/execute
-> tool body
-> tools/post-execute
-> ToolDefinition.finalizeContent
-> tools/result
```

- `F-L3-05`: `tools/pre-execute` can allow, deny, or ask. Registered `ctx.tools.guard()` checks run after the waterfall and are monotonic: once a guard denies, later listeners cannot re-permit the call (`.references/deepseek-harness/docs/tool-execution-pipeline.md:6-60`, `.references/deepseek-harness/packages/core/tools/README.md:83-85`).
- `F-L3-06`: `tools/execute` wraps canonical dispatch for timeout, retry, metrics, or durable checkpointing. `tools/post-execute` may inspect/replace content or value, block with feedback, or attach contexts. `finalizeContent` is the definition-owned final content transform; `tools/result` observes the frozen final outcome (`.references/deepseek-harness/packages/core/tools/src/index.ts:140-190`, `.references/deepseek-harness/packages/core/tools/README.md:101-104`).
- `F-L3-07`: Invalid arguments, unknown tools, thrown tool bodies, guard failures, wrapper failures, timeouts, and post-policy failures are normalized into structured tool-error results instead of ending the turn on an ordinary tool failure (`.references/deepseek-harness/packages/core/tools/README.md:119-127`).
- `F-L3-08`: Cancellation is cooperative. A call aborted before body invocation becomes `ABORTED_BEFORE_DISPATCH`; cancellation after invocation can replace a successful outcome with `ABORTED`, while more specific failures remain authoritative (`.references/deepseek-harness/packages/core/tools/README.md:119-127`).

### Scheduling and ordering

- `F-L3-09`: `executeToolCalls()` classifies calls through `ctx.tools.executionMode()`. Parallel-safe calls use a bounded rolling pool with `maxParallelToolCalls`; exclusive calls form barriers and run alone (`.references/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:60-101`, `.references/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:122-247`).
- `F-L3-10`: Dispatch may overlap, but policy, durable results, and additional contexts commit in model order. Each later call is reclassified immediately before start so registry changes can introduce a new barrier (`.references/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:85-100`, `.references/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:199-213`).
- `F-L3-11`: If cancellation stops replenishment, already-started calls drain and commit. Every unstarted model call receives a synthetic `tool/call` plus `ABORTED_BEFORE_DISPATCH` result so the transcript remains valid (`.references/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:238-265`).
- `F-L3-12`: Result-bearing `additionalContexts` are appended to the next-step inbox in result order. A `concludesTurn` result ends the turn after already-submitted work is respected (`.references/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:146-160`, `.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:486-492`).

### Built-in tool families

- `F-L3-13`: Filesystem tools are `read`, `read_image`, `write`, and `edit`. Reads are capped by line, line-length, and byte limits; mutations use atomic provider operations and can emit replayable card metadata (`.references/deepseek-harness/packages/fs/tool-fs/README.md:42-74`).
- `F-L3-14`: `read`, `write`, and `edit` share the filesystem observation policy. `read` records a version or confirmed absence; `write`/`edit` receive a create/replace/CAS intent; successful mutations emit `fs/observed`. A resumed session has no in-memory observation and must reread (`.references/deepseek-harness/packages/fs/fs-observation-policy/README.md:40-82`, `.references/deepseek-harness/packages/fs/tool-fs/src/write.ts:110-124`, `.references/deepseek-harness/packages/fs/tool-fs/src/edit.ts:117-141`).
- `F-L3-15`: Search is provided by `glob` and `grep` over a packaged ripgrep binary invoked through the subprocess seam. Model values are passed as argv elements, raw output is bounded, and over-cap logical results may be spilled while the complete formatted artifact remains retrievable (`.references/deepseek-harness/packages/fs/tool-fs-search/README.md:44-77`, `.references/deepseek-harness/packages/fs/tool-fs-search/README.md:89-110`).
- `F-L3-16`: `bash` executes a fresh `bash -c` process per foreground call. Nonzero exits are result facts, not tool errors. `run_in_background` registers process work with `ctx.jobs`; output is read through generic job controls (`.references/deepseek-harness/packages/shell/tool-bash/README.md:44-66`, `.references/deepseek-harness/packages/shell/tool-bash/src/index.ts:329-378`).
- `F-L3-17`: Large plain-text tool results can be replaced by a bounded head/tail preview plus a spill locator when the spill policy is mounted. The canonical value remains available to programmatic callers; a spill failure leaves the original result visible (`.references/deepseek-harness/packages/spill/spill-policy/README.md:28-69`, `.references/deepseek-harness/packages/spill/spill-local/README.md:32-65`).
- `F-L3-18`: In `ptc` or `both` presentation mode, the registry exposes `run_code` and a generated SDK. Each SDK binding call re-enters the same tool pipeline and is correlated with the outer call (`.references/deepseek-harness/packages/core/tools/README.md:123-132`).

### Tool tests and evidence

- `T-L3-01`: `packages/core/tools/tests/tools.spec.ts` covers registration/schema projection, argument validation, post-policy replacement/blocking, `tools/result`, cancellation windows, monotonic policy, sandbox-wrap composition, and wrapper failures (`.references/deepseek-harness/packages/core/tools/tests/tools.spec.ts:40-2200`).
- `T-L3-02`: `packages/core/agent-loop/tests/tool-order.spec.ts` and `tool-calls.spec.ts` cover canonical ordering, parallel/exclusive scheduling, result ordering, and cancellation pairing.
- `T-L3-03`: `packages/fs/fs-observation-policy/tests/policy.spec.ts`, `packages/fs/fs-sandbox/tests/fs-sandbox.spec.ts`, and `packages/fs/tool-fs/tests/tools.spec.ts` cover observed versions, stale/absent targets, containment, and structured errors.
- `T-L3-04`: `packages/shell/tool-bash/tests/*` covers foreground/background execution, sandbox fields, result rendering, and executor integration.

## L4: Session, context, compaction, and recovery

### Append-only event model

- `F-L4-01`: A `Session` is an in-memory append-only log of typed `SessionEvent`s. The log is the durable source of truth; derived history, projections, persistence, telemetry, and titles all consume it (`.references/deepseek-harness/packages/core/session/README.md:30-58`, `.references/deepseek-harness/packages/core/session/src/types.ts:263-278`).
- `F-L4-02`: Every append snapshots and validates lossless JSON before mutating the log. This runs before backend persistence and prevents stateful getters or non-JSON values from creating split truth (`.references/deepseek-harness/packages/core/session/README.md:102-108`, `.references/deepseek-harness/packages/core/session/README.md:40-52`).
- `F-L4-03`: `system/message`, `user/message`, `assistant/message`, and `tool/result` alone form the ordered model-visible surface. `turn/*`, `step/*`, `request/*`, `assistant/attempt`, `tool/call`, and unrelated log-only events do not project to model messages (`.references/deepseek-harness/packages/core/session/src/types.ts:269-400`, `.references/deepseek-harness/packages/core/session/src/types.ts:406-450`).
- `F-L4-04`: Surface replacement is a durable append that shadows an inclusive range of current surface nodes and cites every shadowed node. The raw replaced events remain in the log (`.references/deepseek-harness/packages/core/session/src/types.ts:421-450`, `.references/deepseek-harness/packages/core/session/src/surface.ts:307-399`).
- `F-L4-05`: `deriveMessages()` caches per-node projections and returns a fresh array over shared frozen messages. A replacement rebuilds the projection from the surface; there is no raw-log fallback (`.references/deepseek-harness/packages/core/session/src/index.ts:816-855`).

### Persistence and checkpoints

- `F-L4-06`: The JSONL backend owns immutable generation names, compression, generation selection, exclusive successor publication, and write leases. `dsh-base` stores sessions under the harness-home `sessions` directory (`.references/deepseek-harness/packages/session/README.md:27-39`, `.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:110-114`).
- `F-L4-07`: `session-checkpoint-policy` creates three semantic durability barriers: before model dispatch, before a top-level tool body, and before the next request boundary. A failed checkpoint is fail-closed: the adapter or tool body does not run (`.references/deepseek-harness/packages/session/session-checkpoint-policy/README.md:46-52`, `.references/deepseek-harness/packages/session/session-checkpoint-policy/src/index.ts:63-82`).
- `F-L4-08`: A nested tool dispatch reuses the outer call's checkpoint, preventing every PTC sub-call from forcing an independent durable barrier (`.references/deepseek-harness/packages/session/session-checkpoint-policy/src/index.ts:70-75`, `.references/deepseek-harness/packages/session/session-checkpoint-policy/README.md:113-117`).
- `F-L4-09`: The checkpoint layer persists execution intent, not exactly-once external effects. Side-effecting providers must use `callId` or another idempotency mechanism when available (`.references/deepseek-harness/packages/session/session-checkpoint-policy/README.md:113-117`).

### Crash repair and resume

- `F-L4-10`: `interruptedTurnClosers()` scans a durable prefix, tracks the open turn/step and unanswered assistant tool calls, then synthesizes missing `tool/result`, `step/end`, and `turn/end { interrupted }` events in provider-valid order (`.references/deepseek-harness/packages/core/session/src/repair.ts:20-134`).
- `F-L4-11`: A tool call that appears only in an assistant message has `TOOL_NOT_STARTED`. A call with a durable `tool/call` but no result has `TOOL_OUTCOME_UNKNOWN`; the latter explicitly requires read-only/idempotent retry or external-state verification rather than blind replay (`.references/deepseek-harness/packages/core/session/src/repair.ts:14-18`, `.references/deepseek-harness/packages/core/session/src/repair.ts:54-125`).
- `F-L4-12`: Session open/write paths use adjacent format migrations with immutable successor publication. The write-open path never renames, replaces, or deletes the source generation (`.references/deepseek-harness/packages/session/session-persistence-jsonl/README.md:74-82`).
- `F-L4-13`: `ctx.sessions.flush(session)` is an awaited durability barrier across persistence listeners. Headless calls it before summarizing and exiting (`.references/deepseek-harness/packages/core/session/README.md:68-71`, `.references/deepseek-harness/packages/bundle/headless/src/index.ts:202-208`).

### Context injection

- `F-L4-14`: Prompt inputs split into sections, dynamic runtime contexts, tool schemas, and variables. Sections render into the system prompt; dynamic contexts become durable sourced user-role snapshots (`.references/deepseek-harness/packages/core/system-prompt/src/index.ts:102-119`, `.references/deepseek-harness/packages/core/system-prompt/src/index.ts:542-627`, `.references/deepseek-harness/docs/architecture.md:109-121`).
- `F-L4-15`: Workspace instructions load user-global and project `AGENTS.md`/`CLAUDE.md` chains, plus configured local overlays. They are injected as durable user-role messages with a bounded byte budget; discovery/refresh is touch-driven by first-party filesystem operations and resume reconciliation (`.references/deepseek-harness/packages/context/agent-instructions/README.md:30-72`, `.references/deepseek-harness/packages/context/agent-instructions/README.md:84-106`).
- `F-L4-16`: `time-context` is opt-in. On eligible steps it injects a sourced user-role timestamp, browser-zone policy, and elapsed-time reading; a positive refresh interval suppresses too-frequent readings (`.references/deepseek-harness/packages/context/time-context/README.md:30-53`, `.references/deepseek-harness/packages/context/time-context/README.md:60-81`).
- `F-L4-17`: `session-reference` turns `@session` mentions into bounded snapshots of other sessions. Snapshots are immutable, untrusted, source-attributed context; source text is escaped so it cannot close the framing tag, and truncated content may be spilled under the target session (`.references/deepseek-harness/packages/context/session-reference/README.md:30-55`, `.references/deepseek-harness/packages/context/session-reference/README.md:68-90`).
- `F-L4-18`: Durable attachments keep image bytes outside the append-only session log; messages retain content-addressed references. LLM request projection resolves those references per route and text-only models receive deterministic placeholders (`.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:115-119`, `.references/deepseek-harness/packages/llm/llm/README.md:102-115`).

### Compaction

- `F-L4-19`: The compaction seam exposes `compactIfNeeded`, `compactNow`, and `compactRegion`. A successful compaction appends a log-only `compaction/start`, writes the summary record, replaces an older surface range with one user-role summary via `surfaceOp: replace`, then appends `compaction/end` (`.references/deepseek-harness/packages/compaction/compaction/README.md:67-95`, `.references/deepseek-harness/packages/compaction/compaction-basic/src/region.ts:455-493`).
- `F-L4-20`: Tool-call/result pairs are indivisible boundaries. Compaction snaps and validates cuts so it cannot leave an unanswered tool call crossing the replacement boundary (`.references/deepseek-harness/packages/compaction/compaction/README.md:86-89`, `.references/deepseek-harness/packages/compaction/compaction-basic/src/region.ts:340-353`).
- `F-L4-21`: The default backend starts at 80% of the routed context window and retains the newest 16% verbatim. A per-model policy can override these values (`.references/deepseek-harness/packages/compaction/compaction-basic/README.md:60-75`).
- `F-L4-22`: Before invoking the summarizer, automatic compaction can run the tool-result pruner. If pruning alone clears pressure, summarization is skipped; otherwise the pruned surface is summarized (`.references/deepseek-harness/packages/compaction/compaction-tool-result-pruner/README.md:58-60`, `.references/deepseek-harness/packages/compaction/compaction-basic/README.md:164-174`).
- `F-L4-23`: On a canonical `CONTEXT_WINDOW_EXCEEDED` failure, automatic recovery runs within the open step. It retries only after the replacement generation advances, so a no-op summarizer does not create an infinite retry (`.references/deepseek-harness/packages/compaction/compaction-basic/src/index.ts:192-220`).
- `F-L4-24`: Compaction cannot shrink the fixed request envelope, split an indivisible non-tool node, or prove recovery for provider errors other than the normalized context-window code (`.references/deepseek-harness/packages/compaction/compaction-basic/README.md:233-256`).

## Test and runtime evidence

- `T-L4-01`: `packages/core/session/tests/repair.spec.ts` covers balanced/empty logs, open turn/step closure, not-started versus outcome-unknown repairs, already-resulted calls, committed-turn isolation, multi-call ordering, and source-sequence citation (`.references/deepseek-harness/packages/core/session/tests/repair.spec.ts:31-288`).
- `T-L4-02`: `packages/session/session-checkpoint-policy/tests/crash-recovery.e2e.ts` verifies request persistence before dispatch and tool-intent persistence before side effects (`.references/deepseek-harness/packages/session/session-checkpoint-policy/tests/crash-recovery.e2e.ts:92-120`).
- `T-L4-03`: `packages/session/session-checkpoint-policy/tests/session-checkpoint-policy.spec.ts` covers checkpoint failures, cancellation during tool checkpoint, nested dispatch reuse, and pre-step checkpointing (`.references/deepseek-harness/packages/session/session-checkpoint-policy/tests/session-checkpoint-policy.spec.ts:52-230`).
- `T-L4-04`: `packages/compaction/compaction-basic/tests/compaction-basic.spec.ts` covers pressure, retained tails, tool pairing, log bracketing, summaries, pruning, non-shrinking rejection, and summarizer failure (`.references/deepseek-harness/packages/compaction/compaction-basic/tests/compaction-basic.spec.ts:499-2000`).
- `T-L4-05`: `packages/compaction/compaction-basic/tests/compaction-loop-repro.spec.ts` covers a real-loop pressure checkpoint and context-overflow recovery (`.references/deepseek-harness/packages/compaction/compaction-basic/tests/compaction-loop-repro.spec.ts:218-465`).
- `T-L4-06`: Context package tests cover instruction discovery/budget/refresh, time-context projection and zone behavior, and session-reference capture/spill/retry.

As in the L0-L2 document, these are source-observed tests; Vitest was not runnable without installing repository dependencies.

## Interpretation

- `I-L4-01`: The session log is both the recovery format and the model context source. Compaction does not delete history; it changes the active projection through a durable replacement event.
- `I-L4-02`: Tool execution is designed to be model-order deterministic even when dispatch is parallel.
- `I-L4-03`: Context injection consistently uses durable sourced messages, which lets resume and replay recreate what the model saw without trusting an in-memory prompt cache.
- `I-L4-04`: Recovery distinguishes “never started” from “started, outcome unknown”; this is a deliberately conservative safety boundary for side-effecting calls.

## Unresolved

- `U-L4-01`: The actual migration path from every historical session format was not exercised; only the architecture and migration-package boundaries were inspected.
- `U-L4-02`: Token measurement is heuristic on routes lacking exact usage metadata. The accuracy of compaction thresholds on mixed CJK/code/tool-result workloads remains unresolved.
- `U-L4-03`: No crash was injected into a live process during this batch. Repair and checkpoint behavior are supported by source and focused tests, not a fresh destructive runtime drill.
- `U-L4-04`: Cross-process concurrency against one persistence store is not covered by Trace B/C; the shipped checkpoint seam is process-local.
