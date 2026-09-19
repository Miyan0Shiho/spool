# Open-Source Agent Harness Radar

> Verified: 2026-09-19
>
> Status: abandoned on 2026-09-19. Historical evidence only; creates no
> follow-up work or product-scope change.
>
> Purpose: expand the adjacent-source sample beyond Claude Code and DeepSeek
> Harness without turning product-surface breadth into implementation scope.
>
> Authority: [`../../../research/PLAN.md`](../../PLAN.md)
>
> Product boundary:
> [`../../../docs/product/scope.md`](../../../docs/product/scope.md)

## 1. Selection rule

This radar promotes a project only when it exposes a materially different
answer to at least one of these questions:

- What owns the agent loop?
- What is the durable source of truth?
- How are tools, permissions, and execution isolated?
- How are context and provider state reconstructed across turns?
- How are CLI, IDE, desktop, SDK, and protocol clients kept on one runtime?
- What can be removed while remaining useful?

Popularity is not a selection criterion. Current maintenance, source access,
license, and explanatory value are.

## 2. Current shortlist

| Priority | Project | Pinned revision and release | Language | License | Current state | Unique reason to study |
|---|---|---|---|---|---|---|
| P0 | [OpenAI Codex](https://github.com/openai/codex/tree/ed12cc75d34f7cb5e3b08c8ac0c14e6bc7f67c4f) | `ed12cc75d34f7cb5e3b08c8ac0c14e6bc7f67c4f`; `rust-v0.155.1` | Rust | Apache-2.0 | Active; release 2026-09-18 | Production local runtime, JSON-RPC app-server, OS sandbox backends, multi-surface architecture |
| P0 | [OpenCode](https://github.com/anomalyco/opencode/tree/285cff53da18b1fc234fa709236ef1e6573b7f22) | `285cff53da18b1fc234fa709236ef1e6573b7f22`; `v1.18.31` | TypeScript / Bun | MIT | Active; canonical repository moved to `anomalyco/opencode` | Long-lived server and generated client contract shared by TUI, web, desktop, and SDK |
| P1 | [Gemini CLI](https://github.com/google-gemini/gemini-cli/tree/cfbcaa8df13ea4610bb379b377b56d62980c0032) | `cfbcaa8df13ea4610bb379b377b56d62980c0032`; main at `0.62.0-nightly...`, latest stable `v0.60.0` | TypeScript | Apache-2.0 | Active; release 2026-09-15 | Explicit policy engine, context graph and pressure pipeline, checkpointing, ACP/A2A adapters |
| P1 | [mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent/tree/04d809ceab9df28f9adaed044884180159172930) | `04d809ceab9df28f9adaed044884180159172930`; `v2.4.6` | Python | MIT | Active; release 2026-07-23 | Minimal linear loop and environment/model abstractions as a complexity baseline |
| P2 | [Goose](https://github.com/aaif-goose/goose/tree/d57c9a4d73289e86245d9df19201376fc0db03fe) | `d57c9a4d73289e86245d9df19201376fc0db03fe`; `v1.51.0` | Rust | Apache-2.0 | Active; canonical repository moved to `aaif-goose/goose` | Agent loop assembled from persisted, ordered operations rather than a fixed in-memory loop |
| P2 | [OpenHands software-agent-sdk](https://github.com/OpenHands/software-agent-sdk/tree/28e8ed273617992e9556410804f54937cc059878) | `28e8ed273617992e9556410804f54937cc059878`; `v1.49.2` | Python | MIT | Active; release 2026-09-17 | Event-tree conversation, branch selection, remote workspace, replayable session socket |
| Product study | [Cline](https://github.com/cline/cline/tree/d48afb3542b07cbb6d17b40d7c536aadc9cbf041) | `d48afb3542b07cbb6d17b40d7c536aadc9cbf041`; latest observed release `desktop-v0.0.32` | TypeScript | Apache-2.0 | Active; release 2026-09-18 | One engine across SDK, CLI, desktop, IDE, scheduled agents, and multi-agent teams |
| Study only | [Crush](https://github.com/charmbracelet/crush/tree/b14f686653a8a8a2e2613583cd8f96189c4dc3e2) | `b14f686653a8a8a2e2613583cd8f96189c4dc3e2`; `v0.95.0` | Go | FSL-1.1-MIT | Active; release 2026-09-16 | Compact Go server/client runtime with LSP-aware tools and session queues |

The pinned revisions were verified through `git ls-remote`. Release and
maintenance facts were verified through GitHub repository and release APIs on
2026-09-19.

## 3. What the expanded sample reveals

### 3.1 There is no single agent architecture

The sample spans at least seven distinct patterns:

| Pattern | Representative | Defining property |
|---|---|---|
| Minimal model loop | mini-SWE-agent | One bash action per turn, linear history, replaceable model and environment |
| Local coding runtime | Codex | One core runtime with OS-specific sandboxing and multiple product clients |
| Service runtime | OpenCode | Durable server state and HTTP/event contracts consumed by every shell |
| Composition runtime | DeepSeek Harness | Capabilities mounted as plugins around a session-oriented core |
| Operation state machine | Goose | Persisted conversation drives an ordered set of applicable operations |
| Policy/context-heavy agent | Gemini CLI | Context processing and policy decisions are first-class subsystems |
| Event-sourced agent | OpenHands SDK | Immutable events and parent links reconstruct branchable conversation state |

This means "follow the leader" is the wrong mental model. The useful question
is which combination of loop, state, permission, and surface boundaries fits
spool's P0.

### 3.2 Mature products increasingly separate the core from product surfaces

- Codex calls its Rust core the business logic used by multiple UIs and exposes
  an app-server JSON-RPC surface with generated schemas.
- OpenCode defines a public `HttpApi`, generates clients from it, and runs a
  persistent server shared by TUI, web, desktop, and SDK clients.
- Crush has an explicit client/server boundary over HTTP and Unix sockets.
- Cline states that the SDK is the same engine behind CLI, desktop, VS Code,
  and JetBrains surfaces.
- Gemini CLI implements ACP and A2A adapters above the core.

**Interpretation.** spool should not let TUI, headless, and future desktop code
own separate agent loops. A stable runtime contract is the common denominator,
even if P0 ships only CLI/TUI and headless clients.

### 3.3 Durable state and model-visible context are different representations

- Codex has rollout/history structures, compaction, context managers, and a
  separate app-server thread model.
- OpenCode explicitly distinguishes durable Session history from a projected
  provider turn, system context, context snapshots, and context epochs.
- OpenHands stores immutable parent-linked events and reconstructs an active
  branch for action.
- DeepSeek Harness and Claude Code independently reinforce the same boundary.

**Interpretation.** The durable record should not be the prompt. Context is a
projection governed by a safe provider-turn boundary. This is stronger than a
"store message array and truncate it" design.

### 3.4 Permission and enforcement are different facts

- Gemini CLI has a rule-based policy engine and a separate sandbox policy
  manager; missing policy or confirmation paths fail closed.
- Codex separates command policy from OS enforcement and documents Seatbelt,
  bubblewrap/Landlock, and Windows backend differences.
- OpenCode evaluates permission rules and can hide denied tools before
  execution.
- DeepSeek Harness and Claude Code again provide the core comparison baseline.

**Interpretation.** `allow`/`ask`/`deny` cannot be conflated with "sandbox was
applied." A decision and its enforcement result must both be observable.

### 3.5 Simplicity is a valid independent architecture

mini-SWE-agent intentionally has:

- one bash action per model response;
- linear messages as both trajectory and provider history;
- stateless subprocess actions rather than a persistent shell;
- swappable model and environment interfaces;
- no required tool-calling protocol.

**Interpretation.** mini is not a product architecture donor, but it is the
best control sample for deciding whether spool machinery is earning its cost.
Every P0 mechanism should answer what failure it prevents that the minimal
baseline cannot handle.

## 4. Deep-dive order

### P0-A: Codex

Study these mechanisms:

- `codex-rs/core`: runtime business logic, history, compaction, tools, context.
- `codex-rs/app-server` and `codex-rs/app-server-protocol`: client/server
  contract and generated JSON schemas.
- `codex-rs/linux-sandbox`, `codex-rs/execpolicy`, and core sandbox policy:
  decision versus enforcement.
- thread resume, rollout storage, turn interruption, and approval flows.

Do not import:

- the full ecosystem of apps, plugins, marketplace, accounts, and remote
  services;
- product-specific experimental features;
- generated code or schema naming merely to look structurally similar.

Why first: it is the closest production-grade reference to spool's intended
local runtime and P0 scope.

### P0-B: OpenCode

Study these mechanisms:

- `packages/opencode/src/server`: HTTP API, events, routing, workspace scoping.
- `packages/opencode/src/session`: provider-turn projection, compaction,
  retries, overflow, tool settlement.
- `CONTEXT.md`: context source, epoch, snapshot, promotion, and update semantics.
- permission evaluation and tool visibility.
- generated SDK/client boundaries across product shells.

Do not import:

- the entire desktop/web/platform package matrix;
- every provider and model compatibility behavior;
- the full configuration and plugin surface into P0.

Why second: it provides the clearest clean separation between a long-lived
runtime service and multiple thin clients.

### P1-A: Gemini CLI

Study these mechanisms:

- `packages/core/src/policy`: rule matching, approval modes, sandbox policy.
- `packages/core/src/context`: graph, processors, pressure triggers,
  compaction, token accounting.
- checkpointing through a shadow Git repository.
- `packages/cli/src/acp`: protocol projection and fail-closed confirmation.
- extension consent and integrity boundaries.

Do not import:

- Gemini-specific authentication, model routing, and product quotas;
- the full A2A or browser/subagent product surface into P0;
- context-pipeline complexity before a simpler compaction baseline passes
  recovery tests.

Why: it is the strongest reference for policy and context subsystems, but it
also demonstrates how those subsystems can expand far beyond a coding-agent
core.

### P1-B: mini-SWE-agent

Study these mechanisms:

- `DefaultAgent.run()/step()/query()/execute_actions()`;
- the model, environment, and run-script interfaces;
- flat trajectory serialization;
- independent subprocess actions and sandbox substitutions.

Use it to:

- define the simplest benchmark baseline;
- test whether each spool runtime feature improves completion, recovery, or
  safety under the fixed task suite;
- generate reproducible trajectories for comparison.

Do not treat benchmark percentage claims as locally verified. The project
documents its performance; spool has not reproduced it.

### P2-A: Goose

Study `crates/goose-agent` and `goose-context-management` if spool needs a more
general state-machine formulation. The core idea is that an agent is a
persisted conversation plus an ordered set of operations, and the machine can
reload and re-derive behavior rather than relying on hidden in-memory state.

This is conceptually valuable, but Goose is explicitly a general-purpose agent.
Its MCP, recipes, local inference, desktop, and custom distribution surfaces
are broader than spool's P0.

### P2-B: OpenHands software-agent-sdk

Use the existing
[`runtime-paradigm-scan.md`](../products/runtime-paradigm-scan.md) as the
starting point. Deep-dive only the event-tree, active-branch, remote session
replay, lease, and confirmation mechanisms when the session-format probe
requires them.

## 5. Product and study boundaries

### Cline

Cline is valuable for observing how one engine is exposed as SDK, CLI, desktop,
IDE extension, scheduled automation, connectors, and multi-agent teams.

Treat it as a product-surface study, not the next core runtime deep dive. Its
monorepo breadth would pull spool toward platform features that
`docs/product/scope.md` explicitly defers or freezes.

### Crush

Crush has a clear Go client/server design and LSP-aware tooling, but its
`FSL-1.1-MIT` license permits only non-competing purposes before the future
MIT grant. A coding-agent product is plausibly a competing use. Therefore:

- behavior and architecture may be studied;
- implementation code must not be copied into spool;
- any later reuse requires a separate legal and scope review.

## 6. Removed or deprioritized candidates

| Candidate | Current evidence | Disposition |
|---|---|---|
| Continue | README states the repository is no longer actively maintained and is read-only; final `v2.0.0` release | Do not use as a current architecture baseline |
| Roo Code | Repository is archived; last release `v3.54.0` on 2026-05-15 | Watch history only |
| Plandex | Main branch last pushed 2025-10-03; latest observed release `cli/v2.2.1` from 2025-07-16 | Stale for this radar |
| SWE-agent | README states most development moved to mini-SWE-agent, which superseded it | Keep as research lineage; prefer mini |
| AutoGen | Maintenance mode; redirects new work to Microsoft Agent Framework | Do not promote as a current implementation sample |

## 7. Historical download manifest

This manifest is retained only to show what was inspected during the abandoned
pass. It is not a to-do list and must not trigger new downloads.

For a light source checkout, use blobless partial clones rather than copying
entire monorepos:

```sh
mkdir -p .research/landscape

git clone --depth 1 --filter=blob:none \
  https://github.com/openai/codex.git \
  .research/landscape/codex

git clone --depth 1 --filter=blob:none \
  https://github.com/anomalyco/opencode.git \
  .research/landscape/opencode

git clone --depth 1 --filter=blob:none \
  https://github.com/google-gemini/gemini-cli.git \
  .research/landscape/gemini-cli

git clone --depth 1 --filter=blob:none \
  https://github.com/SWE-agent/mini-swe-agent.git \
  .research/landscape/mini-swe-agent
```

The current pass did not place these repositories in the workspace. It used
temporary metadata-only clones and upstream source URLs to verify architecture,
license, and current revision without adding several hundred megabytes to the
research tree.

## 8. Historical decision snapshot

The original conclusions are preserved below as a historical snapshot. They
were superseded by the 2026-09-19 decision to abandon the adjacent-source
expansion.

1. Promote Codex and OpenCode to the next adjacent-source deep dives.
2. Keep Gemini CLI as the policy/context specialist and mini-SWE-agent as the
   complexity baseline.
3. Keep Goose and OpenHands in the second wave, tied to concrete open
   questions.
4. Treat Cline as a product-surface case study only.
5. Treat Crush as behavioral evidence only because of its license.
6. Do not add Continue, Roo Code, Plandex, or SWE-agent to the active sample.
7. Do not change P0 scope based on this radar alone.

## 9. Unresolved

- None of the promoted projects was run locally in this pass.
- Codex and OpenCode source were not yet mapped to the same L0-L8 depth as the
  two core samples.
- The proposed P0 deep dives still need file-level source maps and one Trace A
  or Trace C each.
- Cline's open-source surface was not separated from its hosted Hub and
  JetBrains product boundaries.
- License conclusions are scoped to the audited repository-level text and are
  not a full transitive dependency audit.
