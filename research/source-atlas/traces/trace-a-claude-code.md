# Trace A: Claude Code Pure Model Turn

> Mirror revision: `5c4f331be6f162bb2f409a2435e9b989bedfafe3`
>
> Goal: trace user input through prompt/context assembly, model streaming, turn termination, transcript persistence, and caller/UI output without assuming that a tool call occurs.

## Evidence Scale

- **High**: current source shows the full named call chain and state transition.
- **Medium**: one live implementation branch is visible, but feature/provider/runtime conditions affect it.
- **Low**: only comments, generated metadata, or a reconstructed path support the claim.

## Path Summary

There are two supported callers of the same core query loop:

1. **Interactive REPL**
   `PromptInput -> REPL.onSubmit -> handlePromptSubmit -> processUserInput -> REPL.onQuery -> REPL.onQueryImpl -> query -> queryModelWithStreaming -> handleMessageFromStream -> useLogMessages -> Messages`.
2. **Headless/SDK**
   `runHeadless -> runHeadlessStreaming -> ask -> QueryEngine.submitMessage -> processUserInput -> query -> queryModelWithStreaming -> SDKMessage stream -> StructuredIO/print output`.

Trace A below records the common model-turn semantics and calls out caller-specific differences.

## Step 1: User Input Becomes Local Messages

**Fact, High**

### Interactive

- `REPL.onSubmit` normalizes prompt input, expands pasted references, handles history, creates a fresh abort controller, and calls `handlePromptSubmit`.
- `handlePromptSubmit` calls `processUserInput`.
- `processUserInput` delegates to `processUserInputBase`, then runs user-prompt hooks when `shouldQuery` remains true.
- The resulting messages can include the user prompt and attachment/system messages.

Sources:

- `src/screens/REPL.tsx`, symbols `onSubmit`, `onQuery`.
- `src/utils/processUserInput/processUserInput.ts`, symbols `processUserInput`, `processUserInputBase`.

### Headless/SDK

- `QueryEngine.submitMessage()` receives a string or content-block array and calls `processUserInput`.
- Input can also be queued from a stream through `StructuredIO`.

Sources:

- `src/QueryEngine.ts`, symbol `submitMessage`.
- `src/cli/structuredIO.ts`, symbol `StructuredIO`.

**Interpretation**

- Prompt preprocessing is intentionally shared between REPL and headless paths.

**Unresolved**

- Exact parser behavior for all input modes and attachments cannot be confirmed without fixtures.

## Step 2: Conversation History Is Added to the Turn

**Fact, High**

- Interactive: `onQueryImpl` receives the full `messagesIncludingNewMessages` array from `messagesRef`.
- Headless: `QueryEngine` appends `messagesFromUserInput` to its mutable message store before calling `query`.
- `query()` preserves the caller-supplied message array and creates an iteration-local `messagesForQuery` view.

Sources:

- `src/screens/REPL.tsx`, symbols `messagesRef`, `onQueryImpl`.
- `src/QueryEngine.ts`, symbol `submitMessage`.
- `src/query.ts`, symbol `queryLoop`.

**Interpretation**

- The transcript message array is the shared ordered history. Query-local reduction is a projection and does not change the caller's full history immediately.

**Unresolved**

- The exact message shape after every slash-command, attachment, or hook path.

## Step 3: Prompt and Context Parts Are Assembled

**Fact, High**

The runtime assembles:

- `systemPrompt`: model instructions and tool/integration context.
- `userContext`: user/project instruction content and current date.
- `systemContext`: conversation-start system context, including a Git snapshot when enabled.
- `messages`: conversation history plus the current turn's user/attachment messages.

Interactive path:

- `getSystemPrompt(...)`
- `getUserContext()`
- `getSystemContext()`
- `buildEffectiveSystemPrompt(...)`

Headless path:

- `fetchSystemPromptParts(...)`
- optional memory-mechanics prompt
- optional appended caller prompt
- optional coordinator user context

Sources:

- `src/screens/REPL.tsx`, symbol `onQueryImpl`.
- `src/QueryEngine.ts`, symbol `submitMessage`.
- `src/utils/queryContext.ts`, symbol `fetchSystemPromptParts`.
- `src/context.ts`, symbols `getUserContext`, `getSystemContext`.

**Interpretation**

- The three context pieces are a cache-key prefix. Message-level attachments are added afterward so the stable prefix can remain cacheable.

**Unresolved**

- Exact system-prompt content varies by model, tools, MCP state, feature flags, and private build configuration and is not reproduced here.

## Step 4: Local Context Reduction Runs Before the Model Call

**Fact, High**

Before invoking the model, `queryLoop` may:

- apply the aggregate tool-result size budget;
- apply snip compaction when enabled;
- run microcompaction;
- project context-collapse state when enabled;
- run automatic compaction;
- reject the turn at the blocking token limit when compaction cannot help;
- prepend `userContext` and append `systemContext`.

Sources:

- `src/query.ts`, symbol `queryLoop`.
- `src/utils/toolResultStorage.ts`, symbol `applyToolResultBudget`.
- `src/services/compact/autoCompact.ts`, symbol `autoCompactIfNeeded`.
- `src/services/compact/microCompact.ts`, symbol `microcompactMessages`.

**Interpretation**

- The model sees a projected context, not necessarily the original full history.
- The caller retains richer history for UI and resume.

**Unresolved**

- Production thresholds and enabled mechanisms vary by provider, model, feature gate, and user configuration.

## Step 5: The Model Request Is Built

**Fact, High**

`queryLoop` calls `deps.callModel()` with:

- projected messages;
- final system prompt;
- thinking config;
- current tools;
- abort signal;
- model/permission/query/provider options.

`productionDeps()` binds this to `queryModelWithStreaming()`.

Inside `queryModel()`:

- provider/model strings and beta headers are resolved;
- tool schema exposure is computed;
- messages are normalized for the API;
- tool-use/tool-result pairing is repaired;
- unsupported or excess content is stripped;
- prompt-cache markers are applied;
- the SDK stream is created and consumed.

Sources:

- `src/query/deps.ts`, symbol `productionDeps`.
- `src/services/api/claude.ts`, symbols `queryModelWithStreaming`, `queryModel`, `ensureToolResultPairing`, `addCacheBreakpoints`.

**Interpretation**

- The query state machine operates on internal message types; the provider adapter owns wire-format normalization.

**Unresolved**

- Exact request headers, beta flags, and parameter combinations by account/provider/model.

## Step 6: Streamed Events Become Internal Events

**Fact, High**

`queryModel()` consumes provider stream parts and yields normalized internal events or messages:

- `message_start` establishes partial response metadata and usage;
- `content_block_start` creates text/thinking/tool-use blocks;
- `content_block_delta` updates content or partial tool input;
- `content_block_stop` yields a completed assistant content-block message;
- `message_delta` supplies final usage and `stop_reason`;
- `message_stop` closes the response;
- a complete non-streaming path yields one assistant message.

For headless/SDK consumers, `QueryEngine.submitMessage()` maps:

- `message_start` to current-message usage reset;
- `message_delta` to usage update and stop-reason capture;
- `message_stop` to total-usage accumulation;
- optional partial events to `SDKPartialAssistantMessage`;
- complete assistant/user messages to normalized SDK messages.

For REPL, `handleMessageFromStream()` maps:

- `stream_request_start` to spinner mode `requesting`;
- text deltas to streaming text;
- tool input deltas to streaming tool-use placeholders;
- thinking deltas/events to streaming thinking;
- complete messages to the transcript state.

Sources:

- `src/services/api/claude.ts`, symbol `queryModel`.
- `src/QueryEngine.ts`, symbol `submitMessage`.
- `src/utils/messages.ts`, symbol `handleMessageFromStream`.

**Interpretation**

- Provider stream events are converted into a stable internal event vocabulary before UI/SDK mapping.
- Partial UI state is separate from the authoritative message history.

**Unresolved**

- Ordering under all concurrent fallback, abort, and tool-start conditions.

## Step 7: A Pure Model Turn Terminates

**Fact, High**

A no-tool turn completes when:

- the stream ends;
- no assistant tool-use block was recorded;
- the turn is not in one of the recovery or continuation branches;
- Stop hooks do not request continuation;
- token-budget logic does not request continuation;
- the abort signal is not set.

`queryLoop` then returns a terminal reason such as `completed`.

If the final assistant message is an API error, `StopFailure` hooks run instead of normal Stop hooks.

Sources:

- `src/query.ts`, symbol `queryLoop`.
- `src/query/stopHooks.ts`, symbol `handleStopHooks`.

**Interpretation**

- "No tool call" short-circuits the tool orchestration branch, but not the surrounding context, stop-hook, budget, or recovery state machines.

**Unresolved**

- The set of continuation conditions present in a particular shipped build.

## Step 8: Transcript Persistence

**Fact, High**

### Interactive

- `REPL` uses `setMessages` for UI state and `useLogMessages(messages)` for persistence.
- `useLogMessages` detects full rebuild versus incremental append and calls `recordTranscript`.
- `recordTranscript` filters ephemeral messages, tracks UUIDs already written, assigns parent links for chain participants, and queues JSONL appends.

### Headless/SDK

- `QueryEngine.submitMessage()` calls `recordTranscript` before entering `query`.
- This makes a user message recoverable even if the process dies before the model responds.
- As messages are yielded, assistant messages are usually fire-and-forget persisted; user/compact messages are awaited.

Sources:

- `src/hooks/useLogMessages.ts`.
- `src/QueryEngine.ts`, symbol `submitMessage`.
- `src/utils/sessionStorage.ts`, symbols `recordTranscript`, `flushSessionStorage`.

**Interpretation**

- The transcript is append-oriented and UUID-chain based.
- UI history can retain synthetic or ephemeral values that are not treated as durable transcript entries.

**Unresolved**

- Crash-consistency at every possible write boundary without fault injection.

## Step 9: Caller-Visible Result

**Fact, High**

### Interactive

- Completed messages and progress events update React state.
- `Messages` renders normalized assistant/user/tool messages.
- `onTurnComplete` runs when the query guard closes a successful turn.
- `onQuery` cleanup resets loading state and handles interruption restore behavior.

### Headless

- `QueryEngine.submitMessage()` calculates usage, permissions denials, cost, stop reason, structured output, and duration.
- It yields one terminal `SDKResultMessage` subtype such as `success`, `error_during_execution`, `error_max_turns`, or `error_max_budget_usd`.
- `print.ts` forwards messages through `StructuredIO` when streaming is requested; otherwise it emits the final result as text or JSON.

Sources:

- `src/screens/REPL.tsx`, symbols `onQuery`, `onQueryImpl`.
- `src/components/Messages.tsx`.
- `src/QueryEngine.ts`, symbol `submitMessage`.
- `src/cli/print.ts`, symbol `runHeadless`.

**Interpretation**

- The core loop returns an event stream, while each caller owns final presentation and exit semantics.

**Unresolved**

- Exact output formatting for every output mode and error subtype.

## Sequence Diagram

```text
User
  |
  v
PromptInput / StructuredIO
  |
  v
processUserInput
  |
  +--> user message(s)
  +--> attachments
  +--> UserPromptSubmit hook results
  |
  v
queryLoop
  |
  +--> context reduction/compaction
  +--> prompt/context assembly
  +--> model request
  |      |
  |      +--> streamed text/thinking/tool blocks
  |
  +--> no tool_use => Stop hooks / budget / completion
  |
  v
message stream
  |
  +--> REPL state -> Messages
  +--> QueryEngine -> SDK result stream
  |
  v
recordTranscript / result
```

## Failure and Cancellation Branches

**Fact, High**

- Abort during streaming: provider adapter handles `APIUserAbortError`; query returns an interruption path.
- Abort after tool discovery but before/during tools: synthetic tool results may be emitted to preserve pairing.
- Streaming failure: provider adapter may retry or fall back to non-streaming unless disabled; query may switch models on a dedicated fallback signal.
- Prompt too long/media error: reactive compaction or terminal error handling may run.
- Max output tokens: query may retry with a larger cap or inject a recovery message.
- Stop hook blocking: query appends the hook feedback and starts another model iteration.

Sources:

- `src/query.ts`, recovery and abort branches.
- `src/services/api/claude.ts`, streaming/fallback branches.
- `src/query/stopHooks.ts`, symbol `handleStopHooks`.

**Unresolved**

- Individual fallback enablement and actual failure rates.

## Evidence Limits

- The mirror has no tests or fixtures to confirm the trace on a live process.
- `node_modules` is absent, so the trace cannot be exercised from this mirror without dependency restoration.
- Interactive and headless paths share `query()` but not all setup/persistence code.
- Public SDK functions and several runtime types are stubs/placeholders in this mirror.
- Deleted shims and vendor sources prevent a complete build-level verification.
