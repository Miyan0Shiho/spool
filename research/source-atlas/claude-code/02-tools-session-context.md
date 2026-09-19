# Claude Code Source Mirror: L3-L4 Tools, Session, and Context

> Mirror revision: `5c4f331be6f162bb2f409a2435e9b989bedfafe3`
>
> Scope: tool contracts and lifecycle, representative tool implementations, transcript persistence, reconstruction, context loading, and compaction.

## Evidence Scale

- **High**: multiple current source paths agree, or a single file has a complete explicit lifecycle.
- **Medium**: behavior is directly visible but feature/provider/environment gated, or depends on an absent package.
- **Low**: comments/source maps reveal intent but no complete current implementation can be verified.

## L3: Tool System

### L3-01 Core contract

**Fact, High**

`Tool` in `src/Tool.ts` is a capability contract, not just an API schema. It can define:

- `call()`, `inputSchema`, optional `outputSchema`;
- `description()`, `prompt()`, `validateInput()`, `checkPermissions()`;
- `isEnabled()`, `isReadOnly()`, `isConcurrencySafe()`, `isDestructive()`;
- `interruptBehavior()`, `requiresUserInteraction()`, `shouldDefer()`;
- result-to-API mapping;
- UI rendering for use, progress, rejection, error, and grouped calls;
- classifier/display metadata such as `toAutoClassifierInput()`, `getToolUseSummary()`, and `getActivityDescription()`.

`buildTool()` fills conservative defaults: concurrency unsafe, not read-only, not destructive, no classifier input, and a passthrough permission result.

Source: `src/Tool.ts`, types `Tool`, `ToolDef`, `ToolResult`, `ToolUseContext`; function `buildTool`.

**Interpretation**

- Tool execution, model serialization, permissions, UI, and telemetry are designed around one shared contract.
- The default concurrency posture is fail-conservative; tools must explicitly opt into parallel execution.

**Unresolved**

- Whether all registered tools fully satisfy the optional contract in a shipped build.

### L3-02 Tool pool assembly

**Fact, High**

- `getAllBaseTools()` is the exhaustive built-in inventory.
- `getTools()` applies disable/deny/mode filtering and can return a reduced Bash/Read/Edit surface.
- `assembleToolPool()` merges built-ins and MCP tools, keeps built-ins first, sorts each partition, and deduplicates by name with built-ins winning.
- `refreshTools` on `ToolUseContext` lets the query loop refresh the pool between turns after MCP changes.

Sources:

- `src/tools.ts`, symbols `getAllBaseTools`, `getTools`, `assembleToolPool`.
- `src/query.ts`, symbol `queryLoop`.

**Interpretation**

- Tool availability is an assembled runtime state, not a static global list.

### L3-03 Scheduling and concurrency

**Fact, High**

- `runTools()` partitions consecutive calls into batches.
- Parsed input is evaluated through `isConcurrencySafe()`. A parse or safety-check failure is treated as non-concurrent.
- Consecutive concurrent-safe calls run through `all()` with a configurable maximum, default `10`.
- Non-concurrent calls run serially.
- Context modifiers from concurrent tools are queued and applied after the batch; non-concurrent modifiers apply immediately.

Source: `src/services/tools/toolOrchestration.ts`, symbols `runTools`, `partitionToolCalls`, `runToolsConcurrently`, `runToolsSerially`.

**Interpretation**

- The scheduler protects stateful tools without forcing all tools to be serial.

**Unresolved**

- Per-tool concurrency truth under malformed input or feature-gated behavior.

### L3-04 Early streaming execution

**Fact, High**

`StreamingToolExecutor` can start a tool as soon as its complete `tool_use` block arrives:

- tracks status `queued | executing | completed | yielded`;
- allows concurrent-safe tools to overlap;
- blocks non-concurrent tools behind active work;
- buffers final messages but can yield progress immediately;
- discards partial work on streaming fallback;
- emits synthetic error results for sibling cancellation, user interruption, or fallback;
- cancels sibling Bash tools only when a Bash tool errors.

Source: `src/services/tools/StreamingToolExecutor.ts`.

**Interpretation**

- The controller is designed around API validity first: every accepted tool use must eventually have a matching tool result.

**Unresolved**

- Production latency benefit and failure rate because the feature is gate-controlled and tests are absent.

### L3-05 Canonical tool lifecycle

**Fact, High**

`runToolUse()` in `src/services/tools/toolExecution.ts` implements this pipeline:

1. Resolve tool and validate input schema.
2. Create a tool-use ID/telemetry span.
3. Run PreToolUse hooks and derive a possible permission decision.
4. Call the permission pipeline, interactive handler, or SDK prompt.
5. Stop or synthesize a rejection result when denied.
6. Pass processed/updated input to `tool.call()`.
7. Convert progress callbacks into progress messages.
8. Apply tool-result size persistence/truncation.
9. Run PostToolUse hooks.
10. Produce model-facing `tool_result` and any progress/attachment messages.
11. On errors, classify/log the error, run PostToolUseFailure hooks, and return an error tool result.

Source: `src/services/tools/toolExecution.ts`, symbols `runToolUse`, `streamedCheckPermissionsAndCallTool`, `checkPermissionsAndCallTool`.

**Interpretation**

- Tool call semantics are centralized. Individual tools provide behavior, permissions, schemas, and rendering, but not the runtime lifecycle.

**Unresolved**

- Exact hook ordering when multiple asynchronous hooks race a user decision.

### L3-06 Permission integration

**Fact, High**

- The general permission pipeline is implemented in `src/utils/permissions/permissions.ts`.
- Tool-specific permission logic is called through `tool.checkPermissions()`.
- Interactive tools are queued through `ToolUseConfirm`; SDK hosts receive `can_use_tool` control requests.
- Permission hooks can allow, deny, pass through, update input, or persist permission updates.
- Denial produces an error tool result or an abort depending on the decision.

Sources:

- `src/hooks/useCanUseTool.tsx`.
- `src/hooks/toolPermission/PermissionContext.ts`.
- `src/cli/structuredIO.ts`, symbol `createCanUseTool`.
- `src/services/tools/toolExecution.ts`.

### L3-07 Representative read lifecycle

**Fact, High**

`FileReadTool`:

- validates path and deny rules before filesystem I/O for UNC-sensitive cases;
- adds path-derived skills when enabled;
- deduplicates identical unchanged file ranges using `readFileState`;
- handles text, image, notebook, and PDF reads;
- bounds text by configured size/token limits;
- stores read metadata/content in the file-state cache;
- maps content to a model-facing tool result with line-number formatting or native media blocks.

Source: `src/tools/FileReadTool/FileReadTool.ts`, symbols `FileReadTool`, `call`, `callInner`, `validateInput`.

**Interpretation**

- `readFileState` is both a staleness guard and a context-efficiency cache.

### L3-08 Representative edit/write lifecycle

**Fact, High**

`FileEditTool` and `FileWriteTool`:

- validate path safety, deny rules, team-memory secret policy, and settings-file constraints;
- require the target to have been read through the read state cache;
- compare mtime and, where possible, content to detect changes since read;
- create a file-history snapshot before writes when enabled;
- perform an atomic read-modify-write section;
- update stored content/timestamp after writing;
- notify LSP and IDE clients;
- produce structured diff/output for UI and model result.

Sources:

- `src/tools/FileEditTool/FileEditTool.ts`, symbols `validateInput`, `call`.
- `src/tools/FileWriteTool/FileWriteTool.ts`, symbols `validateInput`, `call`.

**Interpretation**

- Model-visible editing is stateful: a read in the same session is part of the write precondition.

**Unresolved**

- Cross-process safety against non-cooperating editors after the final staleness check.

### L3-09 Representative shell lifecycle

**Fact, High**

`BashTool.call()`:

- delegates to `runShellCommand()` unless applying a simulated `sed` edit;
- streams progress from the shell;
- asks the shell layer to apply sandbox wrapping when requested;
- collects combined stdout/stderr, exit status, interruption, background task ID, and persisted output metadata;
- detects semantic error output and converts it to `ShellError`;
- supports auto-backgrounding and explicit background execution;
- persists large output and returns a preview/path.

`src/utils/Shell.ts` then:

- selects bash/zsh or PowerShell provider;
- builds the command and CWD tracking;
- optionally wraps with `SandboxManager`;
- opens a no-follow task output file;
- spawns a detached process where required;
- passes a `TaskOutput` abstraction to `ShellCommand`.

Sources:

- `src/tools/BashTool/BashTool.tsx`, symbols `BashTool`, `call`, `runShellCommand`.
- `src/utils/Shell.ts`, symbol `exec`.
- `src/utils/ShellCommand.ts`, symbols `ShellCommandImpl`, `wrapSpawn`.

**Interpretation**

- Shell execution owns process lifetime and output storage; BashTool owns model-facing semantics and UI progress.

### L3-10 Result size and persistence

**Fact, High**

- Tool result persistence is controlled by each tool's `maxResultSizeChars`.
- `getPersistenceThreshold()` clamps finite tool limits to the global default; non-finite limits opt out.
- Oversized text is written under the session directory and replaced with a bounded preview plus file reference.
- `enforceToolResultBudget()` additionally limits aggregate `tool_result` size per wire message and records replacement decisions in the transcript.
- Background/shell output is written to task files with a 5 GB hard disk cap and incremental/tail readers.

Sources:

- `src/utils/toolResultStorage.ts`, symbols `getPersistenceThreshold`, `processToolResultBlock`, `enforceToolResultBudget`.
- `src/utils/task/diskOutput.ts`, symbols `DiskTaskOutput`, `MAX_TASK_OUTPUT_BYTES`, `getTaskOutput`.

**Interpretation**

- Large output handling is layered: per-tool limits, aggregate per-message limits, and background task file caps.

**Unresolved**

- Exact effective thresholds depend on live feature configuration.

## L4: Session, Transcript, and Context

### L4-01 Transcript representation

**Fact, High**

- Session transcripts are JSONL files under a config-home project directory.
- Transcript entries include messages plus metadata, compact boundaries, file-history snapshots, attribution snapshots, content replacements, queue operations, and context-collapse records.
- Messages participate in a `parentUuid` chain. `progress` is explicitly not a transcript or chain participant in the current format.
- Legacy progress entries are bridged during load rather than treated as conversation nodes.

Sources:

- `src/utils/sessionStorage.ts`, symbols `isTranscriptMessage`, `isChainParticipant`, `loadTranscriptFile`.
- `src/types/logs.ts`, transcript and entry types.

**Interpretation**

- Persistence is event-log-like but remains optimized for message-chain reconstruction rather than strict event sourcing.

**Unresolved**

- Schema stability across shipped releases.

### L4-02 Session file materialization and writes

**Fact, High**

- `Project` owns write queues and lazily materializes a session file on the first user/assistant message.
- `recordTranscript()` filters non-loggable entries, deduplicates UUIDs, assigns parent links when needed, and appends ordered entries.
- Assistant writes may be fire-and-forget for latency; user and compact-boundary writes can be awaited.
- `QueryEngine` persists new user input before entering the model loop so an accepted prompt survives an early crash.
- `flushSessionStorage()` allows callers to force queued writes.

Sources:

- `src/utils/sessionStorage.ts`, class `Project`, symbols `recordTranscript`, `flushSessionStorage`.
- `src/QueryEngine.ts`, symbol `submitMessage`.

**Interpretation**

- The writer prioritizes low-latency UI/streaming but provides forced-flush points before externally visible completion.

**Unresolved**

- Actual durability on abrupt power loss or filesystem failure.

### L4-03 Transcript reconstruction

**Fact, High**

`loadTranscriptFile()`:

- reads JSONL entries;
- can skip large pre-compaction regions and recover selected metadata by scanning;
- collects summaries, titles, tags, worktree state, snapshots, replacements, and collapse records;
- applies preserved-segment relinks and snip removals;
- calculates leaf UUIDs;
- builds the parent chain for resume;
- includes recovery for orphaned parallel tool-result chains and legacy progress entries.

Source: `src/utils/sessionStorage.ts`, symbols `loadTranscriptFile`, `applyPreservedSegmentRelinks`, `applySnipRemovals`, `recoverOrphanedParallelToolResults`.

**Interpretation**

- Resume tolerates several historical transcript mutations instead of assuming one current canonical format.

**Unresolved**

- Whether every corrupt/partial-write case is recoverable.

### L4-04 Session resume

**Fact, High**

- `getLastSessionLog()` loads a session and builds the latest non-sidechain conversation chain.
- `loadConversationForResume()` and `processResumedConversation()` restore session ID, mode, worktree, agent setting, file-history state, attribution state, content replacements, and context-collapse state.
- CLI and SDK resume paths have separate adapters but share the same persisted transcript facts.
- Subagent transcripts are stored beside the session under `subagents/`, with metadata sidecars for resume.

Sources:

- `src/utils/sessionStorage.ts`, symbols `getLastSessionLog`, `getAgentTranscript`, `getAgentTranscriptPath`.
- `src/utils/sessionRestore.ts`, symbol `processResumedConversation`.
- `src/utils/listSessionsImpl.ts`, symbol `listSessionsImpl`.

**Interpretation**

- A session is more than its visible messages; resume restores enough surrounding state to continue safely.

**Unresolved**

- Missing external state such as remote worktrees or deleted files can only be handled best-effort.

### L4-05 Project instructions and context files

**Fact, High**

- `getUserContext()` discovers and combines instruction/memory files through `getMemoryFiles()` and `getClaudeMds()`.
- `FileReadTool` can load nested memory/instruction attachments when a nested path is touched.
- User/project instructions are deduplicated through loaded path state and file-state caches.
- `processUserInput` can add attachment messages for explicitly mentioned files and other context.

Sources:

- `src/context.ts`, symbol `getUserContext`.
- `src/utils/claudemd.ts`.
- `src/utils/attachments.ts`, symbol `memoryFilesToAttachments`.

**Interpretation**

- Project instructions are assembled from both the turn prefix and lazily injected context attachments.

**Unresolved**

- Exact precedence and load rules across managed, user, project, local, import, and conditional instruction files.

### L4-06 Context analysis and projections

**Fact, High**

- The full session message array remains available to UI and persistence.
- Query input is projected through compact/snip/collapse mechanisms.
- `buildMessageLookups()` and normalization/grouping functions build UI projections from the full history.
- Tool result replacement state is reconstructed on resume so the model sees byte-identical persisted previews.

Sources:

- `src/query.ts`, symbol `queryLoop`.
- `src/utils/messages.ts`, symbol `buildMessageLookups`.
- `src/utils/toolResultStorage.ts`, symbol `reconstructContentReplacementState`.

**Interpretation**

- The architecture separates durable history, model projection, UI projection, and cache-safe replacement state.

### L4-07 Query-time context reduction

**Fact, High**

Before the model call, the query loop can apply, in order:

- aggregate tool-result budget;
- history snip;
- microcompaction;
- context-collapse projection;
- automatic compaction;
- blocking-limit check.

Sources:

- `src/query.ts`, symbol `queryLoop`.
- `src/services/compact/microCompact.ts`.
- `src/services/compact/autoCompact.ts`.

**Interpretation**

- Cheap/reversible reductions run before expensive summarization.

**Unresolved**

- Which layers are enabled in external builds.

### L4-08 Microcompaction and content clearing

**Fact, High**

- `microcompactMessages()` supports cached and time-based paths.
- It targets compactable tool-result content rather than arbitrary messages.
- Cached microcompaction uses provider cache-edit semantics when available.
- Time-based microcompaction clears older compactable tool results after a configured inactivity gap.
- External/non-supported configurations fall through to automatic compaction.

Source: `src/services/compact/microCompact.ts`, symbols `microcompactMessages`, `maybeTimeBasedMicrocompact`.

**Interpretation**

- Microcompaction trades historical tool-result fidelity for context space while preserving the rest of the conversation.

### L4-09 Automatic full compaction

**Fact, High**

- Thresholds reserve output space and include warning/error buffers.
- A consecutive-failure circuit breaker prevents an infinite compaction loop.
- `compactConversation()` asks for a summary, creates a compact-boundary message and summary messages, and may preserve selected recent messages.
- Post-compaction restoration can re-inject recent file state, plan state, invoked skill content, async-agent status, and SessionStart hook context.
- A reduced transcript segment is written for the pre-compaction history.
- Metadata is re-appended so resume selection remains detectable.

Sources:

- `src/services/compact/autoCompact.ts`, symbols `shouldAutoCompact`, `autoCompactIfNeeded`.
- `src/services/compact/compact.ts`, symbols `compactConversation`, `partialCompactConversation`, `createPostCompactFileAttachments`.

**Interpretation**

- Compaction is not simple truncation. It creates a new model-visible baseline while preserving selected operational facts.

**Unresolved**

- Summary quality, token thresholds, and exact preservation behavior across providers/models.

### L4-10 Reactive and alternative compaction

**Fact, High**

- Reactive compaction can respond to provider prompt-too-long/media errors when enabled.
- Session-memory compaction can be attempted before legacy full compaction.
- Context collapse maintains a commit/snapshot projection when enabled.
- Snip compaction provides a separate boundary/removal mechanism.

Sources:

- `src/services/compact/reactiveCompact.ts`.
- `src/services/compact/sessionMemoryCompact.ts`.
- `src/services/contextCollapse/*`.
- `src/services/compact/snipCompact.ts`.

**Evidence strength: Medium** because several modules are conditionally loaded and some current files are thin feature adapters.

### L4-11 Recovery after interruption

**Fact, High**

- The current query can be aborted without discarding already persisted user messages.
- Synthetic interruption/tool-result messages preserve API pairing.
- Session load bridges legacy progress and recovers orphaned parallel tool results.
- Resume reconstructs replacement state and file-history/attribution snapshots.
- A user interrupt before a meaningful response can restore the prompt in the interactive path.

Sources:

- `src/query.ts`, abort and synthetic-result branches.
- `src/utils/sessionStorage.ts`, reconstruction helpers.
- `src/screens/REPL.tsx`, auto-restore logic.

**Interpretation**

- Recovery is distributed: query repair, transcript repair, and UI restoration each handle part of the failure.

**Unresolved**

- End-to-end behavior for process kill, machine crash, concurrent session writers, and remote hydration.

## Tool and Context Invariants

```text
assistant tool_use
  -> permission decision
  -> tool execution
  -> tool_result
  -> transcript
  -> next model request
```

```text
durable session history
  != model-visible projected context
  != UI-rendered message projection
  != background task output files
```

## Evidence Limits

- No test suite or fixture set is present to verify every lifecycle branch.
- `node_modules` is absent, so build, typecheck, and runtime execution cannot be relied on from this mirror.
- Native/shim-backed tools are not fully analyzable because the local shim sources are deleted.
- Several compaction paths are feature-gated, provider-specific, or marked experimental.
- The current worktree is dirty relative to the pinned commit.
