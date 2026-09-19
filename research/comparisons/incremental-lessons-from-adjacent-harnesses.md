# Incremental Lessons From Adjacent Harnesses

> Verified: 2026-09-19
>
> Status: abandoned on 2026-09-19. The comparison is retained as historical
> evidence only. Its priority table and probe recommendations are not active
> work.
>
> Purpose: identify what Codex, OpenCode, Gemini CLI, Goose,
> mini-SWE-agent, OpenHands, Cline, and Crush add beyond the two core
> sources already studied.
>
> Existing baseline:
> [DeepSeek Harness](../source-atlas/deepseek-harness/README.md) and
> [Claude Code](../source-atlas/claude-code/README.md).
>
> Related landscape:
> [Open-source harness radar](../landscape/candidates/open-source-harness-radar-2026-09.md)
> and
> [Codex and China agent landscape](../landscape/candidates/codex-and-china-agent-open-source-2026-09.md).

## 1. Classification rule

Each capability is assigned one of four outcomes:

| Outcome | Meaning |
|---|---|
| `covered` | DeepSeek Harness, Claude Code, or the existing synthesis already establishes the capability and its main semantics |
| `deeper` | The capability is already known, but the adjacent project provides a materially more precise contract, state machine, or failure model |
| `new` | The capability or semantic distinction is not established by the current core atlas and comparison set |
| `scope-excluded` | Interesting, but it belongs to a deferred product or research area |

`new` does not automatically mean P0. It only means the existing core
research has not already answered it.

## 2. High-level result

Most adjacent projects repeat the same architecture that spool has already
learned from DeepSeek Harness and Claude Code:

- one model/tool loop;
- a tool registry with schema validation and permission hooks;
- session persistence, resume, cancellation, and compaction;
- commands, skills, hooks, MCP, plugins, and protocol adapters;
- CLI/TUI, headless execution, SDK, and multiple product surfaces;
- subagents, background work, LSP, provider abstraction, and telemetry.

The genuinely incremental lessons are concentrated in:

1. executable-aware command policy;
2. split filesystem and proxy-only network enforcement;
3. source-keyed context epochs and safe provider-turn admission;
4. generated multi-client runtime protocols and daemon lifecycle;
5. an operation state machine derived only from durable history;
6. shadow-Git checkpoint and re-propose semantics;
7. event-tree branching and remote replay/lease semantics.

## 3. Capability-by-capability comparison

| Capability family | Already learned from DeepSeek Harness / Claude Code | Repeat in adjacent projects | Incremental lesson | Outcome for spool |
|---|---|---|---|---|
| Turn/step/model loop | Shared state machine, turn and step boundaries, retries, terminal reasons | Codex, OpenCode, Gemini, Goose, mini, OpenHands, Cline, Crush | No architectural novelty; projects differ mostly in packaging and language | `covered` |
| Streaming settlement | Live stream is separate from durable completion; partial output and cancellation need explicit settlement | Codex, OpenCode, mini | Codex/OpenCode add more client protocol detail, not a new runtime concept | `covered` |
| Tool registry and pipeline | Typed schemas, admission, permission, dispatch, cancellation, result normalization, truncation, spill | Every project | Goose makes dynamic provider stability explicit, but DSH already has scoped dynamic tool registration | `covered` |
| Shell execution | Fresh subprocess by default and optional persistent shell; foreground/background jobs; output spill | Codex, mini, Crush | mini's one-shot subprocess is not new; DSH already documents both fresh and persistent shell forms | `covered` |
| Session persistence and resume | Append-only or durable transcript, projection, migration, resume, crash repair | Codex, OpenCode, Goose, OpenHands, Cline, Crush | Codex adds rollout storage maintenance and app-server thread recovery; OpenHands adds branch/replay primitives | `deeper` |
| Compaction | Model-visible baseline changes while durable history remains; preserve task state and tool-pair validity | Codex, OpenCode, Gemini, Goose | OpenCode treats compaction as the start of a new context epoch with a new baseline and snapshot | `deeper` |
| Commands, skills, hooks | Multiple invocation classes, trust boundaries, event hooks, declarative instruction content | Every product-grade project | Gemini adds consent revalidation when extension content changes; that is a security refinement, not a new extension category | `deeper` |
| MCP and protocol adapters | Tools-only MCP, SDK JSON-RPC, ACP, persistent sessions, permissions, cancellation | Codex, Gemini, Goose, mini indirectly, Cline, Crush | Codex app-server and OpenCode HTTP API are broader first-party client contracts than the studied SDK/ACP paths | `new` |
| Permissions | User/project/local/managed rules, allow/ask/deny, fail-closed behavior, audit | Codex, Gemini, OpenCode, Cline, Crush | Codex and Gemini make rule identity and policy matching more explicit across command paths, tool annotations, subagents, and MCP identity | `deeper` |
| Sandbox modes | Read-only, workspace-write, full access; bwrap, Landlock, Seatbelt, Windows restricted token; fail closed | Codex, Gemini | Codex adds nested read-only carveouts, protected `.git`/`.codex`, symlink/hard-link handling, and backend-specific fail-closed rules | `new` |
| Network confinement | Network is a policy dimension; remote sandbox providers can apply egress controls | Codex | Codex documents a managed proxy path with network namespace isolation and a bridge constrained to configured proxy endpoints | `new` |
| Command authorization | Dangerous-command classification, exact argv and risk classes are proposed but not fully solved | Codex, Gemini | Codex `execpolicy` uses executable identity and prefix rules, resolves absolute program paths, merges multiple rule sources, and takes the strictest decision | `new` |
| File rollback | File-history snapshots and session resume exist in Claude Code | Gemini, Cline | Gemini atomically checkpoints files, conversation, and the pending tool call, then restores and re-proposes that call | `new` |
| Context sources | Dynamic runtime context is durably sourced and policy changes append notices | OpenCode, Gemini | OpenCode formalizes stable source keys, lazy reconcile, provider-turn admission, baseline context, context snapshots, epochs, removal messages, and stale-while-revalidate semantics | `new` |
| Context transformation pipeline | Compaction, tool masking, truncation, and summaries exist | Gemini, OpenCode | Gemini exposes a graph/pipeline with processors, triggers, hysteresis, invariants, and hot-start calibration | `deeper`; likely too complex for P0 |
| LSP integration | Both core sources already have LSP configuration, diagnostics, or a model-visible LSP tool | Crush, Gemini, Cline | Crush's LSP-first product design is a packaging choice, not a missing mechanism | `covered` |
| Subagents and background jobs | Provider registries, one-shot/continuable children, jobs, cancellation, budgets | Goose, Cline, Gemini, OpenHands | Product breadth grows, but the core mechanism is already established and intentionally deferred | `scope-excluded` |
| Workflow engines | DSH already has workflow packages, worker execution, fan-out, and agent calls | Goose, Cline, OpenHands | Goose's operation state machine is a different formulation of control flow, but not a required missing feature | `scope-excluded` |
| Operation state machine | DSH reloads persisted sessions and derives behavior from durable events; Claude uses an explicit query state machine | Goose | Goose removes hidden loop state by treating each behavior as an ordered operation that is applicable or not, and reloading the conversation between passes | `new` conceptual alternative |
| Event tree and branching | DSH uses append-only events plus surface replacement; Claude transcript carries replacement and snapshot records | OpenHands | OpenHands reconstructs an active branch through immutable parent-linked events and exposes branch selection as a core runtime concept | `new`, P1 probe |
| Remote replay | DSH combines durable history with live stream frames; Claude has remote/WebSocket session transport | OpenHands, Codex, OpenCode | Replay after `after_seq`, session movement, leases, and multi-client reconnect ownership become explicit runtime invariants | `deeper`, P1 |
| Multi-client protocol | SDK and ACP exist, but their contracts are narrower | Codex, OpenCode, Crush | A canonical versioned protocol with generated schemas and a client/server boundary as the primary architecture | `new`, P1 unless P0 headless integration demands it |
| Product-surface reuse | One shared runtime across CLI, headless, and future adapters is already adopted | Codex, OpenCode, Cline, Crush | Cline demonstrates SDK, CLI, IDE, desktop, schedules, and connectors over one engine, but that breadth is explicitly outside P0 | `scope-excluded` |
| Session import and interoperability | No current P0 requirement | Cline | Importing Claude Code, Codex, and OpenCode sessions is a migration/product feature | `scope-excluded` |
| Minimal-agent baseline | Product-grade recovery and safety require more machinery | mini | A tiny linear loop is useful to quantify the value and cost of every spool mechanism, not to replace the runtime | `new` evaluation method |
| Queue/cancellation race semantics | DSH and Claude cover queued input, cancellation, and permission queues | Crush | Crush uses accept reservations, per-session sequence marks, and dispatch locks so a cancel covers accepted but not future work | `deeper`, later concurrency probe |

## 4. Actual new lessons, ranked

### 4.1 Codex security semantics

The most important non-duplicate material is in the security model:

- executable identity and resolved absolute program paths;
- prefix-rule matching with strictest-decision merge;
- split filesystem policy with nested read-only and denied carveouts;
- protected repository metadata even under a writable root;
- explicit handling of symlink and hard-link aliases;
- proxy-only network mode with namespace isolation;
- fail closed when the selected backend cannot represent the requested
  policy.

This extends the existing security comparison rather than repeating it.

Historical assessment: `probe` now, then `adapt` into the first sandbox
implementation if macOS testing confirms the behavior.

### 4.2 OpenCode context epochs

OpenCode adds a complete semantic layer above "dynamic context":

- stable context-source keys and scoped producers;
- baseline system context and model-hidden snapshot;
- context epochs for provider-cache stability;
- lazy reconcile only at a safe provider-turn boundary;
- durable mid-conversation system messages containing the exact admitted
  text;
- explicit update and removal rendering;
- unavailable context with stale-while-revalidate behavior;
- session movement forcing a new baseline.

DSH has durable sourced contexts and live policy notices, but OpenCode defines
a stricter lifecycle and ordering contract.

Historical assessment: `probe`; directly relevant to context correctness and
provider-cache stability, but the full model is more elaborate than P0 needs.

### 4.3 Canonical client protocol

Codex and OpenCode turn the client/server seam into a first-class product
contract:

- Codex uses app-server, JSON-RPC schemas, daemon lifecycle, thread recovery,
  and multiple transports.
- OpenCode treats the HTTP API as authoritative, generates clients from it,
  and runs embedded clients through the same router and handlers.

Existing DSH SDK JSON-RPC and Claude SDK/ACP evidence establish the category
but not this level of contract ownership.

Historical assessment: `probe` before freezing the session event format; likely P1
for a public protocol, but useful for keeping P0 CLI/headless adapters thin.

### 4.4 Gemini checkpoint and consent

Two bounded lessons are new:

- restoring files, conversation history, and the original tool call as one
  user-visible checkpoint;
- revalidating extension consent and integrity when extension content changes.

The first can become a concrete recovery/undo probe. The second should inform
the P0 extension trust model if project extensions can change after approval.

Historical assessment: checkpoint `probe`; consent rule `adopt` when extensions
are implemented.

### 4.5 Goose operation state machine

Goose proposes a different formulation:

- behavior is a function of persisted conversation;
- ordered operations declare applicability;
- the first applicable operation runs;
- the machine reloads the session between passes;
- message metadata records idempotence facts instead of hidden in-memory state.

This does not add a missing feature, but it is a useful architectural
alternative when reviewing hooks, plan transitions, automatic continuation,
or future autonomy.

Historical assessment: `watch` and use as a design probe if the loop accumulates
implicit state.

### 4.6 OpenHands event tree and replay

OpenHands provides the clearest non-duplicate session-format alternative:

- immutable events with parent links;
- active branch selection;
- remote replay after a sequence cursor;
- reconnect and lease semantics.

This should be compared directly with the DSH append-only surface and the
Claude snapshot/replacement transcript before freezing spool's session schema.

Historical assessment: session-format `probe`; remote execution remains `later`.

### 4.7 mini as a complexity baseline

mini does not add a runtime mechanism that DSH lacks. Its value is measurement:

- linear history equals model history;
- one bash action per model response;
- stateless subprocess environment;
- no tool-calling protocol requirement;
- explicit step, cost, time, and format-error limits.

Historical assessment: `adopt` as a benchmark reference, not as the production
architecture.

## 5. What is mostly duplicate

The following should not be promoted as new architecture work:

- another CLI/TUI or headless surface;
- another generic tool registry or schema-validated tool loop;
- another MCP client implementation;
- another skills/commands/hooks system;
- another provider adapter layer;
- another LSP client;
- another subagent implementation;
- another generic checkpoint of files or messages;
- another background-job or workflow graph;
- another broad multi-platform product shell.

These can still be read for implementation detail or failure cases, but they
do not justify changing P0 by themselves.

## 6. Historical priority snapshot (inactive)

The table records the original comparison result. It is not active work.

| Priority | Work item | State | Why |
|---|---|---|---|
| 1 | Compare Codex and DSH command/security policy semantics | `probe` | Fills a real gap in executable identity, split paths, and network confinement |
| 2 | Run an OpenCode-style context-epoch/source-order probe | `probe` | Determines how dynamic context should be admitted without breaking provider cache or session replay |
| 3 | Compare Codex app-server and OpenCode HTTP API session contracts | `probe` | Prevents CLI/headless/SDK adapters from growing incompatible session semantics |
| 4 | Compare Gemini checkpoint/repropose UX with Claude file history | `probe` | Defines a user-visible undo contract without turning it into full session branching |
| 5 | Compare OpenHands event tree with the DSH surface model | `probe` | Required before freezing session persistence |
| 6 | Review Goose operation state machine if implicit loop state appears | `watch` | Useful alternative design, not a current requirement |
| 7 | Add mini-SWE-agent as a minimal benchmark baseline | `adopt` | Measures whether spool complexity earns its cost |
| 8 | Cline and Crush | `watch` | Mostly repeat known capabilities; retain for migration, product breadth, or concurrency detail |

## 7. Unresolved

- No adjacent project was executed against the same repository task in this
  pass.
- Codex `execpolicy`, OpenCode context epochs, Gemini checkpoints, Goose
  operations, and OpenHands branches have not been reproduced locally.
- The comparison separates high-level capability categories; it does not claim
  every implementation detail is identical.
- Session-format, policy, and context probes must be completed before any
  stable decision replaces the current `probe` status.
