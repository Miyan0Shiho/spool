# Trace C: Claude Code Interruption, Failure, Compaction, and Recovery

> Mirror revision: `5c4f331be6f162bb2f409a2435e9b989bedfafe3`
>
> Goal: trace abnormal paths from tool/API failure or user cancellation through state retention, transcript repair, context compaction, resume, and continuation.

## Evidence Scale

- **High**: full source path for the failure/recovery state transition.
- **Medium**: branch exists but depends on feature/provider/config or absent runtime dependency.
- **Low**: recovery property is indicated but cannot be exercised from the mirror.

## Recovery Paths Covered

```text
A. User abort during streaming
B. User abort during tool execution
C. Tool failure
D. Model/API failure and retry/fallback
E. Prompt-too-long or media error
F. Proactive/automatic compaction
G. Process exit or crash followed by resume
H. Malformed or legacy transcript repair
```

## Step 1: Failure or Cancellation Reaches the Abort Controller

**Fact, High**

- `ToolUseContext` carries the active `AbortController`.
- `QueryEngine.interrupt()` calls `abort()` for headless/SDK sessions.
- Interactive `CancelRequestHandler` calls the active query's cancel callback and clears the permission queue.
- A queued high-priority control message can also abort the active query.
- SDK interrupt control requests map to the same signal path.

Sources:

- `src/Tool.ts`, type `ToolUseContext`.
- `src/QueryEngine.ts`, method `interrupt`.
- `src/hooks/useCancelRequest.ts`, symbol `CancelRequestHandler`.
- `src/entrypoints/sdk/controlSchemas.ts`, interrupt request schema.

**Interpretation**

- Cancellation is cooperative: every long-running boundary must observe the same signal.

## Step 2: Streaming Cancellation

**Fact, High**

- `query()` passes the signal into `queryModelWithStreaming()`.
- `queryModel()` passes it to the provider SDK request.
- `APIUserAbortError` is distinguished from an SDK timeout by checking whether the caller signal is actually aborted.
- A caller abort rethrows the user-abort error; a timeout without caller abort is converted to a connection-timeout error.
- Stream resources are released in `finally`.

Sources:

- `src/query.ts`, model call.
- `src/services/api/claude.ts`, symbol `queryModel`, abort and cleanup branches.

**Interpretation**

- The provider adapter owns stream cleanup, while `query()` owns turn-level interruption semantics.

## Step 3: Tool Cancellation

**Fact, High**

`StreamingToolExecutor`:

- checks abort state before starting;
- creates a child abort controller per tool;
- can cancel queued/running tools;
- emits synthetic tool-result messages for cancellation;
- discards completed buffered results after a streaming fallback.

`runTools()`/`runToolUse()` pass the active `ToolUseContext.abortController` to each tool; long-running implementations such as shell commands observe that signal and clean up themselves.

After tools, `queryLoop` checks the signal and:

- emits an interruption message unless the reason is a submit-interrupt;
- returns `aborted_tools`;
- preserves matching tool-result blocks.

Sources:

- `src/services/tools/StreamingToolExecutor.ts`.
- `src/services/tools/toolOrchestration.ts`.
- `src/query.ts`, abort branches.
- `src/utils/messages.ts`, symbols `createUserInterruptionMessage`, `createUserMessage`.

**Interpretation**

- The persisted history must remain API-valid even when user-aborted. Recovery therefore emits synthetic results rather than simply stopping with dangling tool uses.

## Step 4: Bash Cancellation

**Fact, High**

- `ShellCommand` listens to the abort signal.
- Normal abort calls `kill()`; the implementation uses process-tree termination.
- Interrupts with reason `interrupt` may leave a process eligible for backgrounding rather than killing it immediately.
- Tool interruption behavior can be `cancel` or `block`.
- Background shell tasks have separate kill paths and cleanup.

Sources:

- `src/utils/ShellCommand.ts`, symbols `ShellCommandImpl`, `kill`, abort listener.
- `src/tasks/LocalShellTask/guards.ts`.
- `src/tasks/LocalShellTask/killShellTasks.ts`.

**Evidence strength for platform process reaping: Medium**

- `tree-kill` is imported, but cross-platform behavior is delegated to that dependency.

## Step 5: Tool Failure Is Converted to a Result, Not Necessarily a Turn Failure

**Fact, High**

When `tool.call()` throws:

- the execution span is ended with failure;
- the error is classified for telemetry;
- PostToolUseFailure hooks run;
- the tool result is returned with `is_error: true`;
- the model receives a new user message containing that error result;
- the query loop can continue to the next model step.

Sources:

- `src/services/tools/toolExecution.ts`, error branch.
- `src/services/tools/toolHooks.ts`.
- `src/query.ts`, next-state construction.

**Interpretation**

- Tool failure is recoverable input to the agent unless a hook, abort, or terminal max-turn state stops the loop.

## Step 6: Model/API Failure Handling

**Fact, High**

- `withRetry()` wraps provider calls.
- `queryModel()` emits retry-system messages and can enter non-streaming fallback.
- A model fallback can propagate a dedicated fallback error to `query()`.
- On terminal provider error, the adapter yields an assistant/API error message instead of pretending the response was successful.
- `query()` skips normal Stop hooks for API-error messages and runs StopFailure hooks.

Sources:

- `src/services/api/claude.ts`, symbols `queryModel`, `executeNonStreamingRequest`.
- `src/services/api/withRetry.ts`.
- `src/query.ts`, API-error branch.
- `src/query/stopHooks.ts`, symbol `handleStopHooks`.

**Unresolved**

- Provider-specific retry budgets and exact fallback conditions.

## Step 7: Prompt-Too-Long or Media Failure

**Fact, High**

The model adapter can withhold some prompt/media errors long enough for `query()` to attempt recovery.

`query()` may:

- run reactive compaction;
- rebuild the query with post-compaction messages;
- return a terminal prompt/media error when recovery is unavailable or already attempted;
- preserve the post-compaction boundary and summary as transcript state.

Sources:

- `src/query.ts`, prompt-too-long/media branches.
- `src/services/compact/reactiveCompact.ts`.
- `src/services/api/errors.ts`.

**Evidence strength: Medium** because reactive compaction is feature-gated and the module is a thin conditional adapter in this mirror.

## Step 8: Proactive Compaction Baseline

**Fact, High**

Before an API request, `queryLoop` computes a model-visible context and may invoke automatic compaction.

`autoCompactIfNeeded()`:

- computes thresholds from model context size;
- checks warning/error/blocking buffers;
- skips recursive compact/session-memory queries;
- supports circuit breakers after consecutive failures;
- chooses session-memory or legacy compaction;
- returns a `CompactionResult`.

Sources:

- `src/services/compact/autoCompact.ts`, symbols `getEffectiveContextWindowSize`, `calculateTokenWarningState`, `autoCompactIfNeeded`.
- `src/query.ts`, symbol `queryLoop`.

**Interpretation**

- Proactive compaction attempts to avoid a provider error. Reactive compaction is the fallback when prevention fails.

## Step 9: Compaction Rewrites the Model-visible Baseline

**Fact, High**

`compactConversation()`:

- runs pre-compact hooks;
- submits a summary request with restricted tool capability;
- retries/truncates in a bounded way if the compaction request itself is too long;
- creates a compact-boundary marker;
- creates summary message(s);
- optionally preserves recent messages and attachments;
- writes a reduced transcript segment;
- re-appends session metadata;
- runs post-compact hooks;
- returns boundary, summary, preserved tail, usage, and token metadata.

Source: `src/services/compact/compact.ts`, symbols `compactConversation`, `partialCompactConversation`, `streamCompactSummary`.

**Interpretation**

- The compaction boundary is a persistent fork in the conversation. The UI may still retain earlier scrollback, while the model context begins after the boundary.

**Unresolved**

- Whether the summary preserves every task-critical fact; this is a model-quality question not guaranteed by source structure.

## Step 10: Post-Compaction Context Restoration

**Fact, High**

The compaction layer can restore:

- recently read files not already in the preserved tail;
- current plan;
- invoked skills within a token budget;
- plan-mode state;
- async-agent status;
- SessionStart hook output.

Sources:

- `src/services/compact/compact.ts`, symbols `createPostCompactFileAttachments`, `createPlanAttachmentIfNeeded`, `createSkillAttachmentIfNeeded`, `createAsyncAgentAttachmentsIfNeeded`.
- `src/services/compact/postCompactCleanup.ts`.

**Interpretation**

- The runtime explicitly compensates for operational state that a prose summary alone would lose.

## Step 11: Transcript Persistence During Compaction

**Fact, High**

- A compact-boundary message is persisted.
- The writer may keep only a reduced pre-boundary transcript segment.
- Metadata is re-appended to remain in the tail-read window.
- `QueryEngine` splices its mutable message store to begin at the boundary.
- On interactive full-screen mode, REPL may retain one compact interval for scrollback while the model uses post-boundary messages.

Sources:

- `src/utils/sessionStorage.ts`, compaction write paths.
- `src/QueryEngine.ts`, symbol `submitMessage`.
- `src/screens/REPL.tsx`, compact-boundary handling.

**Interpretation**

- Transcript storage policy and UI history policy can differ after compaction.

## Step 12: Process Exit and Resume

**Fact, High**

On resume:

1. Session file is located by ID/project/worktree context.
2. JSONL is parsed, optionally skipping large pre-boundary regions.
3. Message UUIDs are loaded and parent links reconstructed.
4. Compact boundaries, summaries, preserved messages, file history, attribution, replacement decisions, and collapse records are restored.
5. Legacy progress nodes are bridged or removed.
6. Orphaned parallel tool-result chains are repaired where possible.
7. The latest user/assistant leaf is selected.
8. Session, mode, worktree, agent, metadata, cost, and file state are restored.

Sources:

- `src/utils/sessionStorage.ts`, symbols `loadTranscriptFile`, `buildConversationChain`, `getLastSessionLog`.
- `src/utils/sessionRestore.ts`, symbol `processResumedConversation`.

**Unresolved**

- Recovery when the process died mid-write, when the file is truncated, or when external workspace state changed.

## Step 13: User Interrupt Before Any Meaningful Response

**Fact, High**

The interactive path includes an auto-restore branch:

- trigger only for user-cancel;
- no newer query active;
- input box empty;
- no queued commands;
- no teammate transcript being viewed;
- only synthetic messages follow the last user message.

The UI removes the interrupted submission from history and restores the prompt.

Source: `src/screens/REPL.tsx`, auto-restore branch in `onQuery` finally path.

**Interpretation**

- This is UI-level undo, separate from transcript health and model-context repair.

## Sequence Diagram

```text
Abort / failure
  |
  +--> streaming abort
  |      -> provider adapter cleanup
  |      -> interruption message
  |
  +--> tool abort/failure
  |      -> synthetic or real error tool_result
  |      -> PostToolUseFailure hooks
  |      -> next model step OR terminal abort
  |
  +--> prompt-too-long/media
  |      -> reactive compact
  |      -> boundary + summary + restored context
  |      -> retry
  |
  +--> proactive threshold
         -> compact before request
         -> persist boundary/reduced transcript
         -> continue current turn

Process restart
  -> load JSONL
  -> reconstruct chain and metadata
  -> repair legacy/orphaned records
  -> restore session state
  -> continue query
```

## State That Must Survive

**Fact, High**

- Parent UUID chain.
- Compact boundary and summary.
- Preserved message segment.
- File-history snapshots.
- Content-replacement decisions.
- Worktree/session/agent mode.
- Attribution snapshots.
- Pending queue operations where relevant.
- Tool results required to satisfy assistant tool uses.

Sources:

- `src/utils/sessionStorage.ts`.
- `src/utils/sessionRestore.ts`.
- `src/utils/toolResultStorage.ts`.

## Failure Semantics by Layer

| Layer | Local failure behavior | Persistent recovery |
|---|---|---|
| Provider stream | Retry/fallback/error message | Transcript records completed/error messages |
| Tool | Error tool result + failure hooks | Result persisted in normal message chain |
| Bash process | Kill/background/error result | Task output file + task notification |
| Context pressure | Microcompact/snip/collapse/compact | Boundary + summary + replacement/snapshot records |
| Process | Abrupt stop | JSONL chain reconstruction and state restoration |
| UI-only interrupt | Abort/restore prompt | Prevented from becoming misleading durable history |

## Unresolved Recovery Questions

- Does every feature-gated branch have equivalent resume support?
- Are compaction summaries consistently sufficient for long coding tasks?
- How does recovery behave with concurrent sessions writing the same project?
- How does remote hydration reconcile with local transcript state under all failure modes?
- Are there untested parser-differential or filesystem-race failures in an already-aborted tool path?
- Do all background tasks terminate cleanly when the owning session or agent exits unexpectedly?

## Evidence Limits

- No crash-injection, fixture, or runtime test evidence exists in this mirror.
- `node_modules` is absent, so the recovery paths cannot be exercised from this mirror without dependency restoration.
- Some compaction modules are conditional adapters or depend on absent packages.
- The worktree is dirty and lacks the complete historical/test context needed to distinguish current behavior from dormant code paths.
