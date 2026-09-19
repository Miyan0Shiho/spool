# Trace C: DeepSeek Harness Cancellation, Crash Recovery, and Compaction

> Pinned revision: `c291e7961a515f6d7af9304e7fd1d257929aef26`
>
> Package version: `0.1.5-rc.2`
>
> Scope: tool failure or cancellation -> durable state -> resume -> context overflow/compaction -> continue -> verify
>
> Test status: test coverage below is source-observed; Vitest was not executed.

## Scenario branches

This trace covers three related recovery paths:

1. User cancels an active turn.
2. The process dies after a durable request or tool call but before settlement.
3. A resumed/continued request exceeds context and must compact before retrying.

## Branch A: User cancellation

### Sequence

| Stage | Source evidence | Behavior |
|---|---|---|
| 1. User calls `agent.cancel(cause)` | `packages/core/agent/src/runtime-types.ts:176-183` | Active signal aborts; inbox clears unless `keepInbox` |
| 2. The loop checks the signal around model work | `packages/core/agent-loop/src/agent.ts:386-399` | In-flight await is interrupted cooperatively |
| 3. A started stream settles its delivered prefix | `packages/core/agent-loop/src/agent.ts:399-425` | `assistant/message { interrupted: true }` or `assistant/attempt` |
| 4. Tool group stops replenishment | `packages/core/agent-loop/src/tool-calls.ts:199-247` | Started calls drain |
| 5. Unstarted model calls receive synthetic pairs | `packages/core/agent-loop/src/tool-calls.ts:238-265` | `tool/call` plus `ABORTED_BEFORE_DISPATCH` result |
| 6. Turn closes aborted | `packages/core/agent-loop/src/agent.ts:311-340` | `step/end`, `turn/end { aborted }` |
| 7. Driver converges to idle | `packages/core/agent-loop/src/agent.ts:225-237` | Status returns idle; pending replacement work may replay |

### Preserved state

- Text/reasoning delivered before cancellation is retained as an interrupted assistant message when non-whitespace content exists (`.research/deepseek-harness/packages/core/agent-loop/src/agent.ts:401-425`).
- If no visible content arrived, the attempt stream is preserved as `assistant/attempt` without entering model history (`.research/deepseek-harness/packages/core/session/src/types.ts:311-335`).
- Started tool calls retain their real results. Calls never dispatched receive explicit synthetic aborted results, preserving transcript validity (`.research/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:238-265`).

### Cancellation tests

- `packages/core/agent-loop/tests/cancel.spec.ts:386-735` covers mid-step cancellation, streamed prefix settlement, post-step-start windows, and cancellation from session-event observers.
- `packages/core/tools/tests/tools.spec.ts:1100-1600` covers cancellation during pre-execute, around-dispatch, post-execute, and uncooperative started bodies.

## Branch B: Hard process loss and resume

### What was made durable before the crash

The shipped checkpoint policy flushes before model dispatch, before a top-level tool body, and before the next step's request derivation (`.research/deepseek-harness/packages/session/session-checkpoint-policy/src/index.ts:63-82`).

This creates two distinguishable crash cases:

| Durable tail | Meaning | Synthetic repair |
|---|---|---|
| Assistant message contains a tool call, but no `tool/call` exists | The call was never recorded as started | `TOOL_NOT_STARTED` |
| `tool/call` exists, but no matching `tool/result` | The call may have produced an external effect | `TOOL_OUTCOME_UNKNOWN` |

Evidence: `.research/deepseek-harness/packages/core/session/src/repair.ts:14-18`, `.research/deepseek-harness/packages/core/session/src/repair.ts:53-125`.

### Repair algorithm

1. Scan the durable prefix and track the open turn, open step, pending assistant tool calls, and their matching `tool/call` seqs.
2. If no turn is open, append nothing.
3. For each unanswered call in transcript order, append a synthetic error `tool/result` citing the call seq when one exists.
4. Append `step/end` if a step is open.
5. Append `turn/end { kind: 'interrupted' }`.

Evidence: `.research/deepseek-harness/packages/core/session/src/repair.ts:29-134`.

### Resume flow

- Resume obtains a write handle through `persistence.open(id, 'write')`, reads the valid stored event prefix, computes `interruptedTurnClosers()`, appends the closers, and then restores the Session (`.research/deepseek-harness/packages/core/agent-loop/src/index.ts:844-905`).
- A write-open of a historical format decodes/migrates once, verifies the current generation, and publishes an immutable successor without replacing the source (`.research/deepseek-harness/packages/session/session-persistence-jsonl/README.md:74-82`).
- JSONL write batches append and `fsync` before resolving. A torn final raw line is discarded; a torn final Zstd frame contributes only complete decoded records and is repaired before the first new batch (`.research/deepseek-harness/packages/session/session-persistence-jsonl/README.md:74-78`).

### Recovery model-visible result

- The resumed model sees the intact prior surface plus one synthetic result per unresolved tool call.
- It is explicitly told not to blind-retry a possibly side-effecting call whose outcome is unknown; it must verify state or ask the user.
- Embedded streams and log-only boundary events do not duplicate conversation messages.

Evidence: `.research/deepseek-harness/packages/session/session-persistence-jsonl/README.md:135-147`.

### Recovery tests

- `packages/core/session/tests/repair.spec.ts:31-288` covers balanced/empty logs, open turn/step closure, not-started/outcome-unknown repairs, already-closed steps, multiple calls, and source citation.
- `packages/session/session-checkpoint-policy/tests/crash-recovery.e2e.ts:92-120` verifies request persistence before dispatch and tool-intent persistence before side effect.
- `packages/session/session-persistence-jsonl/tests/*` covers torn tails, generation selection, migration refusal, leases, and multi-edge publication.

## Branch C: Context overflow and compaction recovery

### Trigger paths

- Proactive pressure: the `agent/pre-step` listener runs `compactIfNeeded(..., 'pressure', signal)` before request derivation (`.research/deepseek-harness/packages/compaction/compaction-basic/src/index.ts:148-166`).
- Reactive overflow: an `agent/request-error` listener recognizes the canonical context-window failure and runs `compactIfNeeded(..., 'context-overflow', signal)` (`.research/deepseek-harness/packages/compaction/compaction-basic/src/index.ts:180-224`).

### Transaction

1. Measure the current routed request using durable config/tools/history.
2. On a qualifying trigger, optionally run the model-free tool-result pruner and remeasure.
3. Select a tool-pair-balanced range while retaining the recent tail.
4. Append `compaction/start` and acquire the log-recorded lock.
5. Summarize the selected range with the configured route (or custom backend).
6. Append `compaction/summary`.
7. Append one summary `user/message` with `surfaceOp: { op: 'replace', startSeq, endSeq }`, citing every shadowed node.
8. Append `compaction/end`.

Evidence: `.research/deepseek-harness/packages/compaction/compaction-basic/src/region.ts:455-493`, `.research/deepseek-harness/packages/compaction/compaction/README.md:91-95`.

### Retry rule

- Overflow recovery retries only if the surface replacement generation advanced. If compaction or pruning does not change the durable surface, the original provider error remains authoritative (`.research/deepseek-harness/packages/compaction/compaction-basic/src/index.ts:192-223`).
- If pruning landed durably but later summarization failed, the durable pruned prefix is sufficient to retry rather than discarding useful progress (`.research/deepseek-harness/packages/compaction/compaction-basic/src/index.ts:197-208`).
- Cancellation wins over an otherwise eligible retry (`.research/deepseek-harness/packages/compaction/compaction-basic/src/index.ts:218-223`).

### What remains intact

- Replaced history remains in the append-only log.
- Tool-call/result pairs cannot be split by a compaction cut.
- The current system head is protected at surface node 0.
- Compaction events are log-only and cannot enter model history.

Evidence: `.research/deepseek-harness/packages/compaction/compaction-basic/src/region.ts:340-353`, `.research/deepseek-harness/packages/core/session/src/surface.ts:399-416`.

### Compaction tests

- `packages/compaction/compaction-basic/tests/compaction-basic.spec.ts:499-2000` covers pressure, retention, linked tool pairs, pruning, bracketing, failure settlement, image pricing, and no-op retry prevention.
- `packages/compaction/compaction-basic/tests/compaction-loop-repro.spec.ts:218-465` covers a real loop boundary and independent context-overflow/transient retry budgets.
- `packages/compaction/compaction-basic/tests/manual-compaction.spec.ts:239-640` covers explicit compaction, admission, concurrent replacement, failed close, and orphan lock handling.

## Expected recovered event order

For a crash after a durable `tool/call` and before its result:

```text
assistant/message (contains tool call)
tool/call
tool/result { error.code = TOOL_OUTCOME_UNKNOWN }   # synthetic repair
step/end                                            # only if the step was still open
turn/end { kind: "interrupted" }                    # synthetic repair
... resumed request ...
```

For cancellation during a started assistant stream:

```text
assistant/message { interrupted: true }             # if visible content existed
... started tool results ...
... synthetic ABORTED_BEFORE_DISPATCH call/result pairs ...
step/end
turn/end { kind: "aborted" }
```

## Unresolved

- No live process was killed during this batch. Crash repair is evidenced by source and focused tests, not by a new destructive experiment.
- Error recovery for provider context-limit failures depends on provider adapters normalizing the failure to `CONTEXT_WINDOW_EXCEEDED`.
- Exactly-once side effects are not provided. `TOOL_OUTCOME_UNKNOWN` deliberately preserves uncertainty.
- A hard crash before assistant-stream settlement can lose transient stream frames; only completed durable settlements survive.
