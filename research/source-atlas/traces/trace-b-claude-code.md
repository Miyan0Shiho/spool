# Trace B: Claude Code Repository Coding Turn

> Mirror revision: `5c4f331be6f162bb2f409a2435e9b989bedfafe3`
>
> Goal: trace a representative multi-step coding task through repository understanding, reads/searches, permissions, edits, shell verification, repair, and final response.

## Evidence Scale

- **High**: direct source call chain spans every named stage.
- **Medium**: stage is implemented but depends on feature/provider/config or a representative tool choice.
- **Low**: expected product behavior is inferred rather than shown by a complete source path.

## Scope and Representative Path

There is no fixed task fixture in this mirror. The trace below uses the source-defined path for a typical coding request that selects:

```text
Glob/Grep or shell search
  -> Read
  -> Edit/Write
  -> Bash test command
  -> optional Edit repair
  -> final text response
```

Tool choice is model-driven; the runtime guarantees the execution lifecycle, not this exact sequence on every task.

## Step 1: Task Turn Starts

**Fact, High**

- Interactive submission enters `REPL.onSubmit -> handlePromptSubmit -> onQuery -> onQueryImpl`.
- Headless submission enters `runHeadless -> ask -> QueryEngine.submitMessage`.
- Both callers invoke `query()` after assembling the current conversation, system prompt, user context, system context, tools, permission context, and abort controller.

Sources:

- `src/screens/REPL.tsx`, symbols `onSubmit`, `onQueryImpl`.
- `src/QueryEngine.ts`, symbol `submitMessage`.
- `src/query.ts`, symbol `query`.

## Step 2: Repository Understanding Begins With Search/Read

**Fact, High**

Candidate discovery/read tools include:

- `GlobTool`: path/pattern expansion and file listing.
- `GrepTool`: content search.
- `FileReadTool`: bounded text, image, notebook, and PDF reads.
- `BashTool`: arbitrary shell discovery commands when needed.

The model chooses these through tool schemas; no planner forces the order.

Sources:

- `src/tools/GlobTool/GlobTool.ts`.
- `src/tools/GrepTool/GrepTool.ts`.
- `src/tools/FileReadTool/FileReadTool.ts`.
- `src/tools/BashTool/BashTool.tsx`.

## Step 3: Search Tool Calls Enter the Common Tool Pipeline

**Fact, High**

After the model emits `tool_use`, `queryLoop` records tool-use blocks and chooses:

- `StreamingToolExecutor` when its gate is enabled; or
- `runTools()` after the stream completes.

Both call `runToolUse()`.

`runToolUse()` executes:

1. input/schema validation;
2. PreToolUse hooks;
3. permission resolution;
4. `tool.call()`;
5. progress and result mapping;
6. PostToolUse or failure hooks;
7. model-facing `tool_result`.

Sources:

- `src/query.ts`, tool branch.
- `src/services/tools/StreamingToolExecutor.ts`.
- `src/services/tools/toolOrchestration.ts`, symbol `runTools`.
- `src/services/tools/toolExecution.ts`, symbol `runToolUse`.

**Interpretation**

- Search/read calls are read-only for permission and concurrency purposes only when their tool-specific predicates classify the exact input that way.

## Step 4: Read Results Update File State

**Fact, High**

- `FileReadTool` caches content, mtime, offset, and limit in `readFileState`.
- Identical unchanged reads can return a compact "file unchanged" result instead of resending content.
- A partial read is marked as partial and cannot satisfy later edit staleness checks.
- Nested instructions/skills may be added as attachments based on the file path.

Source: `src/tools/FileReadTool/FileReadTool.ts`, symbols `call`, `callInner`, `readFileState`.

**Interpretation**

- The tool result has two audiences: the model, which receives content, and the runtime, which records a read precondition for future writes.

## Step 5: Permission Is Decided Before Mutation

**Fact, High**

The general permission pipeline evaluates:

1. blanket deny rule;
2. blanket ask rule;
3. tool-specific permission logic;
4. bypass-immune user-interaction requirements;
5. content-specific ask rules;
6. path safety checks;
7. bypass mode;
8. blanket allow rule;
9. default ask conversion.

For an interactive request, `useCanUseTool()` pushes a `ToolUseConfirm` into the REPL queue and races:

- local user approval/rejection;
- PermissionRequest hooks;
- a Bash classifier where applicable;
- remote bridge/channel responses where enabled.

For headless/SDK, `StructuredIO.createCanUseTool()` races the SDK permission prompt against local PermissionRequest hooks.

Sources:

- `src/utils/permissions/permissions.ts`, symbol `hasPermissionsToUseToolInner`.
- `src/hooks/useCanUseTool.tsx`.
- `src/hooks/toolPermission/handlers/interactiveHandler.ts`.
- `src/cli/structuredIO.ts`, symbol `createCanUseTool`.

**Interpretation**

- Permission UI is a transport adapter over a shared policy engine; it is not tool-local logic.

**Unresolved**

- Exact winner/timing behavior for every concurrent hook/classifier/UI combination.

## Step 6: Edit Preconditions Are Checked

**Fact, High**

`FileEditTool.validateInput()` and the initial section of `call()`:

- expand and normalize the path;
- enforce deny and safety rules;
- reject secret-bearing team-memory writes;
- enforce maximum file size;
- read/detect encoding;
- require a prior complete read;
- compare mtime and optionally content for external changes;
- resolve the actual matched string;
- reject ambiguous multiple matches unless replacement-all is requested;
- validate settings-file edits.

`FileWriteTool` applies equivalent checks and requires a prior read for existing files.

Sources:

- `src/tools/FileEditTool/FileEditTool.ts`, symbols `validateInput`, `call`.
- `src/tools/FileWriteTool/FileWriteTool.ts`, symbols `validateInput`, `call`.

**Interpretation**

- The model is required to build edit context before mutating a file, reducing blind overwrites.

## Step 7: File History Snapshot Is Taken

**Fact, High**

Before the edit/write and when file history is enabled:

- `fileHistoryTrackEdit()` captures the pre-edit state keyed to the parent assistant message;
- file-history snapshot messages are persisted through session storage;
- resume reconstructs snapshot chains.

Sources:

- `src/tools/FileEditTool/FileEditTool.ts`, symbol `call`.
- `src/tools/FileWriteTool/FileWriteTool.ts`, symbol `call`.
- `src/utils/fileHistory.ts`.
- `src/utils/sessionStorage.ts`, symbol `recordFileHistorySnapshot`.

**Interpretation**

- Code rewind is tracked as file state, not inferred later from Git.

## Step 8: File Mutation Is Applied

**Fact, High**

For Edit:

- current contents are read again within the write section;
- staleness is checked immediately before mutation;
- the replacement is applied with the same matching logic used by validation;
- the file-state cache is updated.

For Write:

- the parent directory is ensured;
- prior file history is recorded;
- current metadata is checked;
- the full contents are written;
- LSP and VS Code notifications are sent when available;
- the file-state cache is updated.

Sources:

- `src/tools/FileEditTool/FileEditTool.ts`, symbol `call`.
- `src/tools/FileWriteTool/FileWriteTool.ts`, symbol `call`.

**Unresolved**

- Atomicity under all filesystem failures and editors that modify the file between the final check and write.

## Step 9: Tool Result Is Returned to the Model

**Fact, High**

The tool lifecycle:

- maps the typed output into a `tool_result` block;
- applies per-tool and per-message size handling;
- yields a synthetic user message containing the result;
- runs PostToolUse hooks, which may add context or stop continuation;
- records the result through the caller's persistence path.

Sources:

- `src/services/tools/toolExecution.ts`, symbols `addToolResult`, `runPostToolUseHooks`.
- `src/utils/toolResultStorage.ts`, symbol `processToolResultBlock`.
- `src/hooks/useLogMessages.ts`.
- `src/QueryEngine.ts`, symbol `submitMessage`.

**Interpretation**

- A tool result is itself a conversation input. The next model request includes the result and may continue the same user turn.

## Step 10: Query Loop Starts the Next Step

**Fact, High**

After tools complete:

- `queryLoop` appends assistant messages, tool results, and attachments;
- refreshes tools if needed;
- checks max-turn and abort conditions;
- creates the next `State` with `reason: next_turn`;
- calls the model again.

Source: `src/query.ts`, symbol `queryLoop`, `next: State`.

**Interpretation**

- A coding task is a repeated model/tool state machine, not a model call followed by local orchestration.

## Step 11: Verification Uses Bash

**Fact, High**

For a test/build/lint command:

- `BashTool.checkPermissions()` calls `bashToolHasPermission()`.
- The permission layer uses AST/legacy parsing, exact/prefix/wildcard rules, prompt classifiers, safety validators, operator/path/redirection checks, and possibly sandbox auto-allow.
- `BashTool.call()` runs `runShellCommand()`.
- `exec()` selects the shell, wraps the command with the sandbox when required, opens a no-follow output file, and spawns the process.
- Progress and output are collected through `ShellCommand`/`TaskOutput`.
- Semantic nonzero-exit results become tool errors; otherwise the result is returned as normal output.

Sources:

- `src/tools/BashTool/BashTool.tsx`, symbols `checkPermissions`, `call`, `runShellCommand`.
- `src/tools/BashTool/bashPermissions.ts`, symbol `bashToolHasPermission`.
- `src/utils/Shell.ts`, symbol `exec`.
- `src/utils/ShellCommand.ts`.

**Evidence strength for sandbox execution: Medium**

- The adapter and wrapper call exists, but the actual platform sandbox implementation is delegated to `@anthropic-ai/sandbox-runtime`, whose dependency source is not present in the mirror.

## Step 12: Failed Verification Produces Another Model Iteration

**Fact, High**

- Nonzero/semantically failed Bash output is converted into an error tool result.
- The error result is normalized into the next model request.
- The model can read files again, edit, and re-run verification.
- Bash tool failure in streaming mode can cancel sibling Bash executions but does not cancel independent Read/WebFetch-style tools.

Sources:

- `src/tools/BashTool/BashTool.tsx`, symbol `call`.
- `src/services/tools/toolExecution.ts`, error branch.
- `src/services/tools/StreamingToolExecutor.ts`, sibling-error branch.

**Interpretation**

- Repair is model-driven. The runtime supplies truthful failure state rather than a hard-coded retry strategy.

## Step 13: Final Response and Turn Completion

**Fact, High**

- When no tool follow-up is required, Stop hooks run.
- The last assistant message is inspected for success/failure and result text.
- Interactive UI renders the final message and calls turn-completion callbacks.
- Headless `QueryEngine` yields `SDKResultMessage`; `print.ts` maps it to text, JSON, or stream output and determines the process exit code.

Sources:

- `src/query/stopHooks.ts`, symbol `handleStopHooks`.
- `src/QueryEngine.ts`, result construction.
- `src/cli/print.ts`, output and exit-code logic.
- `src/screens/REPL.tsx`, turn-completion cleanup.

**Unresolved**

- There is no deterministic source guarantee that the model actually edits, tests, or reports correctly; those are task-quality properties requiring benchmarks.

## Sequence Diagram

```text
Model response: tool_use(Search/Read)
  |
  v
runToolUse
  +--> PreToolUse hook
  +--> permission decision
  +--> read/search
  +--> tool_result
  |
  v
next model step
  |
  v
Model response: tool_use(Edit/Write)
  |
  v
runToolUse
  +--> pre-edit validation
  +--> permission
  +--> file-history snapshot
  +--> atomic write / LSP notify
  +--> diff result
  |
  v
next model step
  |
  v
Model response: tool_use(Bash test)
  |
  v
runToolUse
  +--> Bash security/permission
  +--> sandbox decision
  +--> spawn process
  +--> streamed output
  +--> success/error tool_result
  |
  +--> failure => model repair loop
  |
  v
Stop hooks
  |
  v
final response / SDK result
```

## Failure and Cancellation Semantics

**Fact, High**

- User abort propagates through the active `AbortController`.
- Aborted shell commands are tree-killed.
- Streaming tool execution synthesizes rejection/error results for unfinished tools.
- Non-streaming execution waits for the active tool lifecycle before returning.
- PostToolUseFailure hooks run after tool errors.
- Bash errors are the only observed errors that proactively cancel sibling streaming tools.

**Unresolved**

- Exact process-reaping and persisted-state behavior for every OS and command type.

## Evidence Limits

- No end-to-end task fixture in the mirror proves that a model follows this representative sequence.
- `node_modules` is absent, so the trace cannot be exercised from this mirror without dependency restoration.
- Search/edit/test selection is model behavior, not runtime policy.
- File-history, sandbox, LSP, and several advanced tool paths are feature-gated.
- The mirror lacks tests and the deleted native shim sources.
