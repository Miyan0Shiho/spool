# Claude Code Source Mirror: L0-L2 Entrypoints and Runtime

> Mirror revision: `5c4f331be6f162bb2f409a2435e9b989bedfafe3`
>
> Package label: `999.0.0-restored`
>
> Scope: L0 provenance boundary, L1 entry/assembly, L2 query and model runtime.

## Evidence Scale

| Strength | Meaning in this mirror |
|---|---|
| High | Directly observed in two or more current source files, or in one current source file with an explicit type/control-flow contract. |
| Medium | Directly observed in one current source file, but behavior depends on feature gates, environment, or a package that is absent from the mirror. |
| Low | Inferred from comments, generated source maps, or a path that cannot be exercised because files/tests/build metadata are missing. |

Definitions used below:

- **Fact**: directly observed in the pinned mirror at paths listed in the entry.
- **Interpretation**: the most conservative reading of those facts.
- **Unresolved**: cannot be established from this mirror without runtime execution, tests, history, or official source.

## L0: Provenance and Usable Boundary

### L0-01 Mirror revision and package identity

**Fact, High**

- Git `HEAD` is `5c4f331be6f162bb2f409a2435e9b989bedfafe3`.
- `package.json` names the package `@anthropic-ai/claude-code`, labels it `999.0.0-restored`, requires Bun `>=1.3.5`, and points development/start scripts at `src/dev-entry.ts`.
- The package metadata claims a license file, but no license file is present in the current worktree.

Sources:

- `package.json`
- `git rev-parse HEAD`

**Interpretation**

- The revision is reproducible only as source material. It is not a licensed or officially supported product source tree.
- Package identity and scripts describe a reconstructed development workspace, not an upstream release process.

**Unresolved**

- Original bundled artifact versions, source maps, feature-flag configuration, release channel, and exact production code generation cannot be independently verified.

### L0-02 Dirty worktree and research impact

**Fact, High**

The inspected worktree is dirty:

- Modified: `.DS_Store`, `package.json`, `tsconfig.json`.
- Deleted: `bun.lock`, `readme.md`, all tracked files under `shims/`, and four `vendor/*-src/index.ts` files.
- The local `package.json` removes several `file:` dependencies that point into the deleted `shims/`.
- `tsconfig.json` no longer includes `vendor/**/*` or `shims/**/*`.

Sources:

- `git status --short`
- `package.json`
- `tsconfig.json`

**Interpretation**

- The source tree is analyzable, but the local worktree is not a complete restored build.
- Claims about native modules, browser integration shims, computer-use shims, and full typecheck/build success are outside this snapshot.
- Entrypoint behavior involving those deleted packages is excluded from high-strength conclusions.

**Unresolved**

- Whether the pinned commit could build after restoring the deleted files and lockfile.
- Whether the deleted shims are required on macOS for the exact functions represented by their names.

### L0-03 Development launcher

**Fact, High**

- `src/dev-entry.ts` defines `defaultMacro`, scans local source files for unresolved relative imports, and sets `globalThis.MACRO` only when a build-time macro is absent.
- `--version` and `--help` exit early.
- If unresolved relative imports remain, the launcher prints a restoration diagnostic and exits.
- If no unresolved imports remain, it dynamically imports `src/entrypoints/cli.tsx`.

Source: `src/dev-entry.ts`, symbols `defaultMacro`, `collectMissingRelativeImports`.

**Interpretation**

- The checked-in development launcher deliberately fails closed for an incomplete restoration.
- The normal packaged CLI path is not identical to this launcher.

**Unresolved**

- The deleted or missing modules that would be detected in the fully restored mirror.
- Whether the source-map reconstruction had a generated build step absent from the current package scripts.

## L1: Entrypoints, Assembly, and Startup

### L1-01 Primary CLI bootstrap

**Fact, High**

- `src/entrypoints/cli.tsx` defines `main()` and invokes it as a top-level side effect.
- The function checks inexpensive special entry modes before importing `src/main.tsx`.
- It updates environment/process configuration, records startup checkpoints, and dynamically loads specialized command paths.
- With no special path selected, it starts early-input capture and imports `main` from `src/main.tsx`.

Source: `src/entrypoints/cli.tsx`, symbols `main`, `profileCheckpoint`.

**Interpretation**

- The CLI uses a layered bootstrap so fast paths avoid evaluating the full command, UI, and networking graph.
- Many branches are conditional and therefore are **Medium** evidence for shipped behavior.

**Unresolved**

- Which branches exist in a given external build.
- Whether generated feature flags eliminate or retain each specialized path.

### L1-02 Main command graph

**Fact, High**

- `src/main.tsx` exports `main()` and defines `run()`.
- `run()` constructs the Commander command, registers global options and subcommands, and dispatches the normal prompt path.
- Interactive mode uses `launchRepl`; print/headless mode dynamically imports `runHeadless` from `src/cli/print.ts`.
- Startup resolves settings, authentication/provider state, MCP configuration, plugins, agents, commands, tools, permissions, and session state before entering one of those UI modes.

Sources:

- `src/main.tsx`, symbols `main`, `run`, `startDeferredPrefetches`.
- `src/cli/print.ts`, symbol `runHeadless`.
- `src/replLauncher.tsx`, symbol `launchRepl`.

**Interpretation**

- `main.tsx` is the composition root for product surface selection.
- The model loop itself is not owned by `main.tsx`; it is handed to the REPL path or headless orchestrator after tool/command/MCP state is assembled.

**Unresolved**

- The exact order of every asynchronous prefetch and feature-gated branch at runtime.
- Whether all Commander subcommands are present in a shipped build.

### L1-03 Initialization and configuration

**Fact, High**

- `src/entrypoints/init.ts` exports a memoized `init()`.
- It enables configuration, applies safe environment variables before trust, configures proxy/mTLS/network agents, registers cleanup, starts remote settings and policy limit loading when eligible, and performs post-trust telemetry initialization through `initializeTelemetryAfterTrust()`.
- It explicitly separates pre-trust safe configuration from post-trust full environment application.

Sources:

- `src/entrypoints/init.ts`, symbols `init`, `initializeTelemetryAfterTrust`, `setMeterState`.
- `src/interactiveHelpers.tsx`, symbol `showSetupScreens`.

**Interpretation**

- Startup assembly has a workspace-trust boundary even though tool permission mode is a separate concept.
- Settings and network initialization are shared across interactive and headless paths.

**Unresolved**

- Which settings sources and policy providers are authoritative under every enterprise configuration.

### L1-04 Tool and command assembly

**Fact, High**

- `src/tools.ts` exports `getAllBaseTools`, `getTools`, `assembleToolPool`, and `getMergedTools`.
- `getAllBaseTools()` is the exhaustive built-in tool inventory and conditionally includes feature-gated tools.
- `getTools()` filters disabled and blanket-denied tools and supports a reduced mode.
- `assembleToolPool()` combines built-ins and MCP tools, keeps built-ins first, sorts each partition, and deduplicates by name.
- `src/commands.ts` similarly merges built-ins, skill directories, bundled skills, plugin commands, MCP commands, and workflow commands.

Sources:

- `src/tools.ts`, symbols `getAllBaseTools`, `getTools`, `assembleToolPool`.
- `src/commands.ts`, symbols `loadAllCommands`, `getCommands`, `getSkillToolCommands`.

**Interpretation**

- Model-visible capability surface is assembled before the query loop and can be refreshed during or between turns.
- Tool and command assembly are separate registries that meet in prompt construction and tool execution.

**Unresolved**

- Full external-build tool inventory because several entries are dead-code-eliminated or environment gated.

### L1-05 Headless and SDK entry

**Fact, High**

- `runHeadless()` in `src/cli/print.ts` reads structured input, assembles tools, MCP clients, commands, agents, permissions, initial messages, session state, and output format.
- Its streaming loop calls `ask()` from `src/QueryEngine.ts` for each queued prompt.
- `ask()` creates a `QueryEngine`, delegates to `QueryEngine.submitMessage()`, and replaces the caller's read-file cache in `finally`.
- `StructuredIO` translates permission requests, hook callbacks, elicitation, MCP messages, control requests, and SDK messages over NDJSON/stdio or remote transports.

Sources:

- `src/cli/print.ts`, symbols `runHeadless`, `runHeadlessStreaming`.
- `src/QueryEngine.ts`, symbols `QueryEngine`, `submitMessage`, `ask`.
- `src/cli/structuredIO.ts`, symbols `StructuredIO`, `createCanUseTool`, `sendRequest`.

**Interpretation**

- The headless/SDK path is a first-class runtime consumer, not just a thin terminal wrapper.
- Permission prompts and hook decisions can be delegated to an SDK host while the core permission pipeline remains in-process.

**Unresolved**

- Exact public SDK compatibility because `src/entrypoints/agentSdkTypes.ts` contains public-function stubs in the restored mirror and `src/entrypoints/sdk/runtimeTypes.ts` degrades several public types to `Record<string, unknown>`.

## L2: Query and Model Runtime

### L2-01 Query ownership

**Fact, High**

- `QueryEngine` owns one conversation's mutable messages, abort controller, read-file state, permission denials, and total usage.
- Each `submitMessage()` call starts one user turn and may contain multiple query-loop iterations.
- Interactive `REPL` calls `query()` directly. Headless/SDK calls `ask() -> QueryEngine.submitMessage() -> query()`.

Sources:

- `src/QueryEngine.ts`, class `QueryEngine`, method `submitMessage`.
- `src/screens/REPL.tsx`, symbol `onQueryImpl`.
- `src/query.ts`, function `query`.

**Interpretation**

- `query()` is the shared model/tool loop; `QueryEngine` is a headless/SDK adapter around it.
- "Turn" is a user-visible submission. The query loop may iterate several model/tool steps inside that turn.

**Unresolved**

- Future consolidation of interactive and QueryEngine-specific session handling is indicated in comments but is not complete in this revision.

### L2-02 Prompt and context inputs

**Fact, High**

- `fetchSystemPromptParts()` produces `defaultSystemPrompt`, `userContext`, and `systemContext`.
- `getUserContext()` loads project/user instruction content and the current date.
- `getSystemContext()` collects a conversational snapshot of Git status when enabled.
- `QueryEngine.submitMessage()` may replace the default system prompt, append memory mechanics, append a caller prompt, and add coordinator user context.
- `REPL.onQueryImpl()` performs the equivalent assembly using `getSystemPrompt()`, `getUserContext()`, `getSystemContext()`, and `buildEffectiveSystemPrompt()`.
- `query()` calls `prependUserContext()` for request messages and `appendSystemContext()` for the final system prompt.

Sources:

- `src/utils/queryContext.ts`, symbol `fetchSystemPromptParts`.
- `src/context.ts`, symbols `getUserContext`, `getSystemContext`.
- `src/QueryEngine.ts`, symbol `submitMessage`.
- `src/screens/REPL.tsx`, symbol `onQueryImpl`.
- `src/query.ts`, symbol `queryLoop`, for the prepend/append call sites.
- `src/utils/api.ts`, symbols `prependUserContext`, `appendSystemContext`.

**Interpretation**

- Prompt-cache stability is a first-class design concern: context is split into stable cache-key prefix pieces and per-request message content.
- User/project instructions are loaded during context assembly, while nested or conditional memory can also arrive later as attachments.

**Unresolved**

- Exact prompt bytes vary by model, feature flags, environment, and session state; they are not reproduced in this atlas.

### L2-03 Query state machine

**Fact, High**

- `queryLoop()` keeps a `State` containing messages, tool context, auto-compaction tracking, max-output-token recovery count, pending tool summary, stop-hook state, turn count, and the previous transition reason.
- Each iteration emits `stream_request_start`, prepares a message view, applies context reduction, invokes the model, processes tool calls, and either stops or constructs the next state.
- `Continue` transitions such as `next_turn`, stop-hook blocking, token-budget continuation, max-output recovery, and compaction continuation are explicit state transitions.

Sources:

- `src/query.ts`, types `QueryParams`, `State`, `Terminal`.
- `src/query/transitions.ts`, function `transitionQueryState`.
- `src/query/config.ts`, type `QueryConfig`.

**Interpretation**

- The runtime is a generator-driven state machine rather than a recursive task function.
- The generator boundary lets REPL, headless, SDK, tests, and subagents consume the same message/event stream.

**Unresolved**

- The intended long-term extraction of `queryLoop()` into a pure state reducer is described as future work, not achieved in this revision.

### L2-04 Model request construction

**Fact, High**

- `query()` delegates model calls through `deps.callModel`, whose production implementation is `queryModelWithStreaming()`.
- `queryModelWithStreaming()` wraps `queryModel()` with streaming VCR support.
- `queryModel()` resolves provider/model metadata, builds beta headers, determines tool-search exposure, builds API tool schemas, normalizes messages, repairs tool-result pairing, strips unsupported blocks, updates usage, and creates the SDK stream.
- Request construction receives already assembled `systemPrompt`, `messages`, `thinkingConfig`, `tools`, abort signal, and an options object.

Sources:

- `src/query/deps.ts`, symbol `productionDeps`.
- `src/services/api/claude.ts`, symbols `queryModelWithStreaming`, `queryModel`, `addCacheBreakpoints`, `buildSystemPromptBlocks`.

**Interpretation**

- Provider-specific adaptation happens below the query state machine.
- The model adapter owns schema exposure, prompt caching, tool pairing repair, and streaming fallback.

**Unresolved**

- Exact API parameter set for each model/provider because feature gates, model capabilities, and public/private builds change request construction.

### L2-05 Streaming event handling

**Fact, High**

- The SDK stream is consumed inside `queryModel()`.
- Message start, content-block start/delta/stop, message delta, message stop, errors, and fallback behavior are handled in the model adapter.
- The adapter yields normalized `StreamEvent`, `AssistantMessage`, or `SystemAPIErrorMessage` values.
- `QueryEngine.submitMessage()` updates usage from `message_start`, `message_delta`, and `message_stop`, preserves `stop_reason`, and optionally forwards partial events.
- REPL's `handleMessageFromStream()` maps stream events into spinner state, streaming text, streaming tool input, and completed messages.

Sources:

- `src/services/api/claude.ts`, symbol `queryModel`.
- `src/QueryEngine.ts`, symbol `submitMessage`.
- `src/utils/messages.ts`, symbol `handleMessageFromStream`.

**Interpretation**

- Streaming is not only a UI concern. Tool-use blocks can be discovered before the stream ends and, when enabled, begin execution early.

**Unresolved**

- Byte-for-byte ordering and provider-specific event behavior without a recorded runtime trace.

### L2-06 Turn continuation and tool loop

**Fact, High**

- During streaming, every assistant tool-use block is added to `toolUseBlocks`; this, not `stop_reason`, is the primary loop-continuation signal.
- After the stream, the loop either returns, continues for recovery/stop-hook reasons, or executes tools.
- `StreamingToolExecutor` may run compatible tools while the model stream is still open.
- Otherwise `runTools()` partitions calls into concurrent-safe batches and serial non-safe batches.
- Tool-result messages are appended to the next state and another model request is made.

Sources:

- `src/query.ts`, symbols `queryLoop`, `toolUseBlocks`, `toolResults`.
- `src/services/tools/StreamingToolExecutor.ts`.
- `src/services/tools/toolOrchestration.ts`, symbol `runTools`.

**Interpretation**

- The stable unit is a "step"; the agentic turn continues while tools produce new model-visible results or a recovery transition requires another request.

**Unresolved**

- Production gate frequency for the streaming executor and its effect on latency/error rate.

### L2-07 Stop and continuation hooks

**Fact, High**

- After a model response with no tool follow-up, `handleStopHooks()` runs `Stop` hooks unless the last message is an API error.
- A hook can report a blocking error, prevent continuation, or emit progress/attachments.
- Blocking errors are inserted into the next state and cause another iteration; `preventContinuation` returns a terminal result.
- `StopFailure` hooks run on API-error termination.

Sources:

- `src/query.ts`, symbol `queryLoop`.
- `src/query/stopHooks.ts`, symbol `handleStopHooks`.

**Interpretation**

- "Model stopped" is not automatically the end of a user turn; local policy can extend or block it.

**Unresolved**

- Hook behavior in shipped builds varies by settings source, trust, feature gates, and external vs internal builds.

### L2-08 Cancellation and abort propagation

**Fact, High**

- `ToolUseContext` carries an `AbortController`.
- `QueryEngine.interrupt()` aborts that controller.
- REPL keybinding handling calls its active abort controller and clears the permission queue.
- `query()` passes the signal into `callModel()`.
- `queryModel()` passes the signal to the SDK request and handles `APIUserAbortError` separately from timeouts.
- The query loop treats an abort during streaming or tools as a terminal path and emits an interruption message except for submit-interrupts.

Sources:

- `src/Tool.ts`, type `ToolUseContext`.
- `src/QueryEngine.ts`, method `interrupt`.
- `src/hooks/useCancelRequest.ts`, symbol `CancelRequestHandler`.
- `src/query.ts`, symbols `queryLoop`, abort checks.
- `src/services/api/claude.ts`, symbol `queryModel`.

**Interpretation**

- Cancellation is cooperative and signal-based at every major boundary.
- Synthetic tool results may be required to keep the persisted message graph valid after interruption.

**Unresolved**

- Exact provider/SDK abort timing and whether every child process is reaped promptly on all platforms.

### L2-09 Streaming fallback and recovery

**Fact, High**

- `queryModel()` can fall back from streaming to non-streaming after stream creation or streaming failure when not disabled.
- It can perform bounded non-streaming timeout handling.
- It can surface fallback-triggered model errors to `query()`.
- `query()` implements separate recovery paths for maximum-output-token stop, prompt-too-long/media errors, and model fallback.

Sources:

- `src/services/api/claude.ts`, symbols `executeNonStreamingRequest`, `queryModel`.
- `src/query.ts`, recovery branches in `queryLoop`.

**Interpretation**

- Recovery semantics are distributed between provider adapter and query state machine.
- Streaming-to-non-streaming fallback is intentionally dangerous when tool execution already started; the source contains an explicit gate intended to avoid duplicate tool execution.

**Unresolved**

- Which fallback paths are enabled for each build/provider.
- Whether all recovery paths have tests in the original upstream repository; tests are absent from this mirror.

## Minimal End-to-End Runtime

```text
CLI bootstrap
  -> main command graph
  -> settings/auth/MCP/plugin/tool assembly
  -> interactive REPL or headless runner
  -> process user input and context
  -> queryLoop
       -> context reduction
       -> model adapter
       -> streamed assistant events
       -> tool execution when tool_use blocks exist
       -> stop hooks / recovery / next iteration
  -> transcript and caller-visible messages
```

The important architectural boundary is **not** "CLI calls API." It is:

```text
UI/headless caller
  -> shared query state machine
  -> provider adapter
  -> tool orchestrator
  -> transcript/session boundary
```

## Mirror Limitations

- No complete upstream Git history, tests, fixtures, CI configuration, lockfile, or license.
- `node_modules` is absent, so build, typecheck, and runtime execution cannot be relied on from this mirror.
- Public SDK functions in `src/entrypoints/agentSdkTypes.ts` are stubs in this restored tree.
- The pinned package metadata referenced deleted local shim dependencies; the dirty package metadata removes those `file:` entries.
- Many behaviors are feature-gated, provider-gated, environment-gated, or explicitly internal.
- Source files include generated source-map payloads; this atlas cites the pre-map source.
- The worktree is dirty relative to the pinned commit, and the current dirty files were used only where explicitly stated.
