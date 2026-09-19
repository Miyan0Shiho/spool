# Capability Matrix

> Status: Batch 5 first-pass synthesis
>
> Date: 2026-09-19
>
> Authority: [`../../RESEARCH_PLAN_V1.md`](../../RESEARCH_PLAN_V1.md)
>
> Product boundary: [`../../DEVELOPMENT_SCOPE_V1.md`](../../DEVELOPMENT_SCOPE_V1.md)

This matrix separates mechanism decisions from later implementation choices.
`adopt` fixes a boundary or requirement. `probe` means the mechanism is
valuable but the concrete design still needs an experiment. `later`, `watch`,
and `reject` keep a capability outside current P0.

## Architecture Alignment

As clarified on 2026-09-19, product code is independently implemented with
Claude Code as the primary reference. Autonomous task orchestration, persistent
goals, and observability are confirmed design concerns, with DeepSeek Harness
as a focused complementary reference, not a runtime dependency. The
[`architecture draft`](../../ARCHITECTURE_V1.md) records candidate boundaries;
it does not silently change P0 release scope or treat the April Claude mirror
as evidence of all behavior in current official documentation.

The user has now confirmed a basic coding-agent first release. Goal,
orchestration, and richer observability are subsequent increments. The
[`P0 plan`](../../docs/architecture/P0_IMPLEMENTATION_PLAN_V1.md) specifies
which parts of mixed runtime/extension tests remain mandatory in P0.

## Matrix

| Capability family | Evidence | Decision | Priority | Current boundary |
|---|---|---|---|---|
| One shared turn/step/model/tool runtime | [Runtime L0-L2](runtime-l0-l2.md) | `adopt` | keep | CLI/TUI, headless, and future protocol adapters must drive one state machine |
| Explicit user-turn and model-step separation | [Runtime L0-L2](runtime-l0-l2.md) | `adopt` | keep | Persist both boundaries; a model response does not automatically complete a turn |
| Structured tool-call continuation | [Runtime L0-L2](runtime-l0-l2.md) | `adopt` | keep | Continuation is derived from tool intent and explicit terminal reasons |
| Durable transcript separated from model-visible projection | [Runtime L0-L2](runtime-l0-l2.md) | `adopt` | keep | Exact event schema/format remains a `probe` |
| Live streaming separated from durable settlement | [Runtime L0-L2](runtime-l0-l2.md) | `adopt` | keep | UI chunks are presentation data; completion derives from durable facts |
| Cooperative cancellation with explicit settlement | [Runtime L0-L2](runtime-l0-l2.md) | `adopt` | keep | Preserve partial visible output and never replay side effects blindly |
| Unified tool registry and execution pipeline | [DeepSeek L3](../source-atlas/deepseek-harness/02-tools-session-context.md), [Claude L3](../source-atlas/claude-code/02-tools-session-context.md) | `adopt` | keep | Admission, permission, dispatch, cancellation, normalization, and audit share one pipeline |
| Provider adapter below the runtime | [Runtime L0-L2](runtime-l0-l2.md) | `adopt` | keep | Provider wire details, schema adaptation, and opaque artifacts stay behind a stable interface |
| Provider fallback and retry ownership | [Runtime L0-L2](runtime-l0-l2.md) | `probe` | unknown | Decide whether retry identity and terminal semantics live in the runtime, adapter, or a split contract |
| Interactive/headless orchestration ownership | [Runtime L0-L2](runtime-l0-l2.md) | `probe` | unknown | Decide how much orchestration can live above the shared runtime without incompatible session or permission semantics |
| Provider opaque reasoning/thinking round-trip | [Frontier radar](../frontier-radar/2026-09-current-mechanism-radar.md) | `probe` | unknown | Must preserve provider artifacts without interpreting them; define capability metadata before coding |
| Context compaction with preserved task state | [DeepSeek L4](../source-atlas/deepseek-harness/02-tools-session-context.md), [Claude L4](../source-atlas/claude-code/02-tools-session-context.md) | `probe` | keep | Preserve goal, edits, verification, unresolved work, tool-call validity, and recovery semantics |
| Append-only durable records and projections | [Execution contracts](../../docs/architecture/EXECUTION_CONTRACTS_V1.md) | `probe` | keep | Prefer a transaction-backed record and parent/child shared storage domain; SQLite driver/schema remain unverified and unapproved as dependencies |
| Permission decisions separate from execution enforcement | [Security comparison](security-and-execution-models.md) | `adopt` | keep | Keep `allow`/`ask`/`deny`, approval outcome, provider, and enforcement completeness separate |
| Fail-closed safety policy | [Security comparison](security-and-execution-models.md) | `adopt` | keep | Missing approval, invalid policy, or unavailable required confinement cannot become allow |
| Multi-dimensional execution policy interface | [Security comparison](security-and-execution-models.md) | `adopt` | keep | P0 may implement only local process/OS sandbox, but the interface reserves filesystem, process, network, privilege, resource, and audit dimensions |
| Sandbox backend and default posture | [Security comparison](security-and-execution-models.md) | `probe` | keep | Validate macOS Seatbelt, Linux bwrap/Landlock, availability, partial enforcement, and unsandboxed semantics through E1-E5 |
| Container, microVM, or remote sandbox as P0 | [Security comparison](security-and-execution-models.md) | `later` | later | Requires measured improvement over OS sandbox and a defined trust boundary |
| Declarative project commands/skills | [Extensions comparison](extensions-and-product-surfaces.md) | `adopt` | keep | P0 extension path uses Markdown with a small frontmatter subset and no arbitrary package execution |
| Hooks | [Extensions comparison](extensions-and-product-surfaces.md) | `later` | later | P1 command-only path after trust, event allowlist, sandbox, and audit are stable |
| MCP tools-only client | [Protocol comparison](../landscape/protocols/mcp-acp-a2a-boundaries.md) | `later` | later | P1 unless the fixed benchmark proves it blocks P0 completion |
| Third-party in-process plugins and marketplaces | [Extensions comparison](extensions-and-product-surfaces.md) | `reject` | cut | No package ABI, automatic installation, marketplace, or model-authored runtime code in P0 |
| SDK JSON-RPC and ACP | [Extensions comparison](extensions-and-product-surfaces.md), [Protocol comparison](../landscape/protocols/mcp-acp-a2a-boundaries.md) | `later` | later | Prototype after session events, cancellation, errors, and permissions stabilize |
| A2A and remote multi-agent delegation | [Protocol comparison](../landscape/protocols/mcp-acp-a2a-boundaries.md) | `watch` | cut | Not required for a single local coding agent |
| Desktop, IDE, and Web shells in parallel | [Extensions comparison](extensions-and-product-surfaces.md) | `later` | later | CLI/TUI and headless validate P0; one product shell at a time afterwards |
| Background shell/process management | [Current scope](../../DEVELOPMENT_SCOPE_V1.md), [Fixed tasks](../landscape/benchmarks/fixed-task-suite.md) | `adopt` | keep | Start, inspect, stop, and safely reconcile processes; distinct from autonomous background agents |
| Subagents and background agents | [DeepSeek L8](../source-atlas/deepseek-harness/03-security-extensions-operations.md), [Claude L8](../source-atlas/claude-code/03-security-extensions-operations.md) | `later` | later | Design coordination and ownership now; implementation remains P1 unless explicitly reprioritized |
| Autonomous task orchestration | [Execution contracts](../../docs/architecture/EXECUTION_CONTRACTS_V1.md), [Subtraction log](../decisions/subtraction-log.md) | `adapt` | later | Agent-led planning plus bounded ready-task dispatch is the extension baseline; the user confirmed delivery after basic P0; arbitrary-script execution remains deferred |
| Persistent goal control | [DeepSeek goal](../../.research/deepseek-harness/packages/goal/goal/README.md), [Architecture draft](../../ARCHITECTURE_V1.md) | `adapt` | later | Separate objective, continuation authority, budget, and evidence; explicitly deferred beyond the basic P0 release |
| Workflow graph and checkpoint runtime | [Runtime paradigm scan](../landscape/products/runtime-paradigm-scan.md) | `watch` | later | LangGraph-style supersteps are not required by the current coding loop |
| Product telemetry | [DeepSeek L8](../source-atlas/deepseek-harness/03-security-extensions-operations.md), [Claude L8](../source-atlas/claude-code/03-security-extensions-operations.md) | `later` | later | Local audit is required; external telemetry is optional and derived |
| Rich task/child-run trajectory views | [P0 plan](../../docs/architecture/P0_IMPLEMENTATION_PLAN_V1.md), [Execution contracts](../../docs/architecture/EXECUTION_CONTRACTS_V1.md) | `later` | later | Rich views follow the base release; durable runtime facts, permissions, errors, and verification remain queryable in P0 |
| Fixed P0 benchmark suite | [Fixed task suite](../landscape/benchmarks/fixed-task-suite.md), [Evaluation evidence](../landscape/benchmarks/runtime-evaluation-and-failure-evidence.md) | `adopt` | keep | 27 frozen tasks plus infrastructure/task-failure separation and immutable results |
| Long-term memory and personalization | [Mechanism notes](../landscape/papers/mechanism-notes.md) | `later` | later | No persistent user-memory product feature before core runtime release |
| RSI or self-modifying harness | [Frontier radar](../frontier-radar/2026-09-current-mechanism-radar.md), [Current scope](../../DEVELOPMENT_SCOPE_V1.md) | `later` | cut | Retained as a long-term product direction; current implementation is deferred, not the vision itself |
| Proactive sensing and workflow flywheel | [Subtraction log](../decisions/subtraction-log.md) | `later` | cut | Remains frozen until the P0 coding runtime passes its release gate |

## P0 Hard Constraints

The following constraints are sufficiently supported to constrain the first
architecture:

1. Product surfaces cannot own forked agent loops.
2. A turn must have a durable terminal reason.
3. Model streaming cannot be the only source of final output.
4. Tool intent, tool execution, and tool results must remain structurally
   linked.
5. Cancellation must leave a valid session and an explicit process/tool state.
6. Permission policy and sandbox enforcement must be separate facts.
7. Required confinement or approval failure must fail closed.
8. P0 extension execution must be declarative, not arbitrary third-party code.
9. Session restoration cannot blindly replay side-effecting operations.
10. Completion claims require a recorded verification command and result.

## Not Yet Decided

- Exact session event names and persistence encoding.
- Driver and schema for the preferred transaction-backed event record, with JSONL export.
- Exact retry ownership between runtime and provider adapter.
- Default approval UX and permanent-grant policy.
- Concrete sandbox backend rollout and fallback behavior.
- Provider artifact capability schema.
- Compaction algorithm and measurement thresholds.
- Package/version boundary for CLI, headless, and future SDK.

## Next Evidence

- Run session-format probes covering event-log projection, parent-linked
  transcript recovery, compaction boundaries, and crash replay.
- Run security experiments E1-E5 before choosing the first sandbox backend.
- Implement the 27 benchmark fixture/evaluator assets before using the suite as
  a release gate.
- Run a tools-only MCP probe before promoting MCP from `later`.
- Run provider round-trip tests for opaque reasoning artifacts.
