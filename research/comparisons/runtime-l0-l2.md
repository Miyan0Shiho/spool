# Batch 1: Runtime L0-L2 Comparison

> Status: evidence synthesis
>
> Date: 2026-09-19
>
> Authority: [`../../RESEARCH_PLAN_V1.md`](../../RESEARCH_PLAN_V1.md)
>
> Scope: entry assembly, agent loop, turn/step state, prompt construction,
> model streaming, continuation, cancellation, and durable session boundaries.

This document compares two different source-evidence levels:

| Source | Revision | Evidence level |
|---|---|---|
| DeepSeek Harness | `c291e7961a515f6d7af9304e7fd1d257929aef26`, `0.1.5-rc.2` | Clean source, tests, generated docs, and Agent Notes; no local test execution |
| Claude Code mirror | `5c4f331be6f162bb2f409a2435e9b989bedfafe3`, `999.0.0-restored` | Dirty source-map mirror without tests, history, complete build, or license |

Canonical source evidence:

- [DeepSeek Harness L0-L2](../source-atlas/deepseek-harness/01-entrypoints-runtime.md)
- [DeepSeek Harness Trace A](../source-atlas/traces/trace-a-deepseek-harness.md)
- [Claude Code L0-L2](../source-atlas/claude-code/01-entrypoints-runtime.md)
- [Claude Code Trace A](../source-atlas/traces/trace-a-claude-code.md)

## Conclusion

**Fact.** Both products converge on a shared runtime below multiple
interaction surfaces, but they draw the ownership boundary differently:

- DeepSeek Harness assembles a product by composing bundles and patches over a
  general component tree. Every product surface ultimately drives the same
  agent/session/LLM/tool services.
- Claude Code begins from a command graph and a shared `query()` state machine.
  The interactive REPL calls `query()` directly, while headless/SDK calls it
  through `QueryEngine`.

**Interpretation.** The common hard constraint is not "build a plugin system"
or "copy either loop." It is that spool needs one model/tool state machine with
an explicit turn/step contract, and all product surfaces must be adapters over
that state machine rather than owning forked loops.

## Runtime Comparison

| Dimension | DeepSeek Harness | Claude Code mirror | Spool implication |
|---|---|---|---|
| Product assembly | Profile selects ordered bundles and patch layers; Loader mounts effective rows | CLI boot graph assembles settings, tools, commands, MCP, and then selects REPL or headless | Keep product assembly outside the runtime core and make surface selection explicit |
| Shared core | Base bundle supplies LLM, session, agent, tools, prompt, compaction, approval, and sandbox services | `query()` is shared; interactive and headless paths have different orchestration around it | A single shared state machine is a hard architectural seam |
| Turn model | A turn contains zero or more steps; a step is one model request plus its requested tools | A user submission is the visible turn; `queryLoop()` may iterate multiple model/tool steps | Persist both user-visible turns and internal model/tool steps, without conflating them |
| Step continuation | Tool-call presence drives another step; explicit `concludesTurn` can close it | Assistant tool-use blocks are the primary continuation signal, not `stop_reason` | Continuation must be derived from structured tool intent and explicit terminal reasons |
| Prompt ownership | Prompt sections, contexts, tools, and variables are assembled before admission; rendered prompt becomes a durable `system/message` | System prompt, user context, and system context are assembled by the caller, then passed to `queryLoop()` | Prompt assembly must be reproducible from durable inputs, not hidden mutable loop state |
| Provider adapter | `LlmRuntime.prepareCall()` binds an adapter generation and returns a one-shot stream | `queryModel()` owns provider metadata, wire normalization, prompt caching, tool pairing, fallback, and streaming | Keep provider wire concerns below the loop, but expose one explicit stream contract |
| Streaming | Live `agent/assistant-stream` frames are transient; durable `assistant/message` embeds the compact stream before terminal end | Provider stream events are normalized inside the query path and mapped differently for REPL and SDK callers | Streaming transport and replayable settlement must be separate concepts |
| Failure/retry | `agent/request-error` may return retry; retry reuses the rendered assembly and does not rerun pre-step admission | `queryLoop()` contains explicit recovery transitions for token limits, prompt/media failures, fallback, and stop hooks | Retry policy belongs to an explicit state transition with stable request identity |
| Cancellation | Cooperative `AbortSignal`; visible partial output becomes an interrupted durable message, otherwise an attempt record is written | Abort controller propagates into model and tools; interruption ends the query path and may synthesize tool results | Cancellation must preserve a valid transcript and distinguish partial output from no output |
| Durable session | Append-only events plus surface replacement/projection; raw attempts and request headers remain replay facts | JSONL transcript with UUID/parent chain and caller-owned full history; model input is a reduced projection | Durable history and model-visible context must be separate representations |
| Caller projection | Headless derives final text from durable owned events; Web combines durable history with live stream frames | REPL and SDK map the same normalized model stream into different surface events | Surface renderers must not be the source of truth for completion |

## Turn and Step Contract

Both implementations support a user-visible turn containing multiple
model/tool iterations. The naming differs, but the semantic contract can be
normalized for spool:

```text
user turn
  -> step 1: model request
       -> optional tool calls
       -> tool results
  -> step 2: model request with updated context
       -> optional tool calls
  -> ...
  -> terminal turn reason
```

Required distinctions:

- A model response is not automatically a completed turn.
- A tool call is structured continuation intent, not an error and not a
  terminal condition.
- Every request attempt needs an identity so retry cannot silently duplicate
  prompt admission or tool execution.
- Every turn and step needs exactly one terminal fact, including cancellation,
  provider failure, blocking policy, and normal completion.
- The final user-visible response must be derived from durable settlements,
  with live stream chunks treated as presentation data.

## Durable State Contract

DeepSeek Harness provides the stronger example of separating durable facts from
live coordination:

- `turn/start`, `step/start`, `assistant/message`, `tool/call`, `tool/result`,
  `step/end`, and `turn/end` form the replayable runtime spine.
- `system/message`, `user/message`, `assistant/message`, and `tool/result` are
  surface events.
- Compaction replaces surface visibility without deleting the append-only log.
- Recovery distinguishes a tool call that never started from one whose outcome
  is unknown.

Claude Code provides the product-facing alternative:

- The full transcript remains richer than the reduced model input.
- Message parent links preserve ordering and enable recovery repair.
- Context reduction is layered and does not immediately rewrite the caller's
  full conversation.

**Interpretation.** Spool should treat the durable event/transcript boundary as
a P0 architecture decision, not an implementation detail. The exact format
still needs a `probe` or design comparison before adoption.

## Cancellation and Recovery Contract

The sources agree on the following constraints:

- Cancellation is cooperative and signal-based.
- Abort must propagate through model requests and tool execution.
- Already-visible assistant output must not disappear merely because the turn
  was interrupted.
- In-flight tool calls must settle into an explicit known state.
- Restoring a session must not replay side-effecting tools blindly.
- Context compaction must preserve task objective, changed files, verification
  state, and unresolved work.

These constraints are strong enough to become P0 design requirements. Exact
event names, persistence encoding, and retry counts remain spool-owned
decisions.

## Evidence Asymmetry

- DeepSeek Harness supports source-level claims with tests and design notes, but
  the tests were not executed locally.
- Claude Code source presence is not proof of stable product availability.
  Features may be gated by flags, provider state, build channel, or missing
  dependencies.
- Claude Code's sandbox execution delegates to a dependency absent from the
  mirror, so only the wrapper and decision path were observed.
- Neither product was exercised with a live provider in this batch.

## Candidate Decisions

These candidate decisions were promoted during Batch 5. The stable product
boundaries are recorded in the subtraction log; the exact session format,
retry ownership, and competing runtime designs remain explicitly unresolved.

| Candidate | Decision | Reference | Reason |
|---|---|---|---|
| One shared turn/step/model/tool state machine | `adopt` | `DEC-003` | Both mature implementations preserve this boundary across surfaces |
| UI/headless/SDK as adapters over the shared loop | `adopt` | `DEC-003` | Prevents behavioral drift and duplicated lifecycle logic |
| Durable transcript separated from model-visible projection | `adopt` | `DEC-004` | Required for replay, compaction, recovery, and caller continuity |
| Live stream separated from durable settlement | `adopt` | `DEC-005` | Streaming must not be the only source of completion or final output |
| Cooperative cancellation with explicit tool settlement | `adopt` | `DEC-023` | Required to avoid corrupt transcripts and duplicate side effects |
| Provider fallback and retry ownership | `probe` | `DEC-029` | Provider adapters expose failures; the exact split between runtime and provider retry identity remains a vertical-spike decision |
| Bundle/patch composition as the spool assembly mechanism | `watch` | None | DeepSeek demonstrates it, but the complexity is not justified by current P0 evidence |
| Interactive and headless orchestration split above the query loop | `probe` | `DEC-027` | Claude does this; DeepSeek keeps one agent runtime with surface bundles |

## Unresolved

- Which durable event schema best supports compaction, crash recovery, and
  future SDK/ACP consumers.
- Whether retry belongs entirely in the runtime or partially in the provider
  adapter.
- How tool calls that were started but not settled should be represented after
  a hard crash.
- What minimum event trace is required for UI replay versus model replay.
- Which runtime behaviors must be reproduced in a vertical spike before the
  session format is frozen.
- Whether spool should use an event log with projection, a parent-linked
  transcript, or a hybrid.
