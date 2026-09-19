# External Runtime Paradigm Scan (Batch 1)

> Verified: 2026-09-19
>
> Status: historical scan only. The 2026-09-19 decision abandoned further
> adjacent-harness expansion, so the recommendations for further study below
> are not active work.
>
> Scope: lightweight adjacent-circle comparison of three externally maintained Agent runtimes against DeepSeek Harness and Claude Code.
>
> Boundary: external findings are research input only. This document does not change P0 scope or the subtraction log.

## 1. Purpose and selection rule

This scan asks whether Batch 1 has missed a materially different runtime paradigm. It is not a feature-count survey and does not rank products by capability breadth.

A candidate entered this scan only if:

- it has a first-party source repository or normative specification;
- its current revision, release state, maintenance state, and license can be checked;
- its control model differs materially from both core samples along at least one of execution, durability, remote execution, workflow, permissions, or recovery.

Every subsection separates:

- **Fact**: directly observed in the pinned revision.
- **Interpretation**: the narrow meaning for spool research.
- **Unresolved**: what this lightweight scan does not establish.

## 2. Candidate selection

| Candidate | Pinned identity | Why selected | Research disposition |
|---|---|---|---|
| OpenHands Software Agent SDK | `1.49.2`, commit [`28e8ed2`](https://github.com/OpenHands/software-agent-sdk/tree/28e8ed273617992e9556410804f54937cc059878) | Conversation runtime with an append-only event tree, local/remote workspace split, WebSocket replay, and risk-based confirmation | Worth a bounded deep dive after Batch 1 |
| Aider | `0.86.3.dev`, commit [`5dc9490`](https://github.com/Aider-AI/aider/tree/5dc9490bb35f9729ef2c95d00a19ccd30c26339c) | Single-process coding loop where Git commits, not an event service, are the transaction and recovery mechanism | Keep as product-workflow reference, not a runtime donor |
| LangGraph | `langgraph 1.2.11`, commit [`c81c135`](https://github.com/langchain-ai/langgraph/tree/c81c13533ee48c1ae0ef2de314737ef0c455f2be) | Explicit graph/superstep runtime with checkpointed state, interrupts, time travel, and pluggable persistence | Worth a targeted persistence/interrupt study, later than P0 |

### Deferred or rejected for this scan

- **Goose, OpenCode, and other local CLI agents**: deferred because their local command loop would overlap Aider without adding a clearly distinct durability or execution model to this bounded scan.
- **AutoGen**: rejected as a current implementation sample. Its repository is in maintenance mode and directs new users to Microsoft Agent Framework.
- **Closed cloud agents**: not selected because a current, licensable source/runtime cannot be inspected.
- **General workflow engines**: not selected because they do not own an Agent loop or coding-agent tool contract.

## 3. OpenHands Software Agent SDK

### Identity and maturity

**Fact**

- Runtime repository: [OpenHands/software-agent-sdk](https://github.com/OpenHands/software-agent-sdk) at commit `28e8ed273617992e9556410804f54937cc059878` (2026-09-18).
- Package version: `openhands-sdk 1.49.2` and `openhands-agent-server 1.49.2` in the [SDK package manifest](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/pyproject.toml#L1-L5) and [server package manifest](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-agent-server/pyproject.toml#L1-L5).
- Latest observed release: `v1.49.2` on 2026-09-17.
- Repository status: active, not archived; license MIT.
- The former `OpenHands/OpenHands` repository now owns Agent Canvas and frontend/control-center concerns. The canonical runtime, tools, conversations, workspaces, REST/WebSocket API, and TypeScript client boundary are owned by `software-agent-sdk`.

**Interpretation**

- OpenHands is no longer best modeled as a single monolithic agent repository. Its strongest comparison point is now the SDK/server boundary.
- The split is evidence that a mature product can separate control surfaces from one durable conversation runtime.

**Unresolved**

- This scan did not run a live server, reconnect through WebSocket, or execute a coding task.
- Cross-repository compatibility and release skew between Agent Canvas, the TypeScript client, SDK, and server were not exercised.

### Runtime paradigm

**Fact**

- `Conversation` is a factory: a local workspace returns `LocalConversation`; a `RemoteWorkspace` returns `RemoteConversation` ([`conversation.py#L34-L59`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/conversation/conversation.py#L34-L59), [`conversation.py#L150-L161`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/conversation/conversation.py#L150-L161)).
- The event is the durable unit. `EventLog` stores immutable events with IDs and parent links, scans them back into an index, and reconstructs an active branch through `path_to_root()` ([`event_store.py#L34-L45`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/conversation/event_store.py#L34-L45), [`event_store.py#L95-L130`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/conversation/event_store.py#L95-L130)).
- Event append uses locking and duplicate/parent validation before persisting the event payload ([`event_store.py#L188-L238`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/conversation/event_store.py#L188-L238)).
- The event model is a tree, not only a chat transcript. `Event.parent_id` supports sibling branches, and the event log can resolve the active leaf-to-root path ([`event.py#L31-L48`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/event/base.py#L31-L48)).
- Remote clients consume ordered session frames. The session socket replays durable events after `after_seq`, separates durable from transient frames, and then switches to live delivery ([`session_socket.py#L175-L233`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-agent-server/openhands/agent_server/session_socket.py#L175-L233), [`session_socket.py#L314-L417`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-agent-server/openhands/agent_server/session_socket.py#L314-L417)).

**Interpretation**

- OpenHands is event-driven and event-sourced at the conversation boundary. The live transport is a projection of a durable log, not the source of truth.
- Branching, replay, and remote reconnects are designed into the event model rather than bolted onto a transcript-only session format.

**Unresolved**

- Compaction, long-lived event-log growth, and cross-process corruption behavior need separate testing.
- The lightweight scan did not compare server file storage against the actual production/cloud persistence path.

### Core loop and event model

**Fact**

- `LocalConversation.run()` repeatedly acquires conversation state and calls `agent.step()` until finished, paused, stuck, interrupted, or a run limit is reached ([`local_conversation.py#L1902-L2034`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L1902-L2034)).
- `Agent._step()` checks pending actions, prepares or condenses LLM messages, makes one model request, classifies the response, and dispatches tool calls, content, or empty/no-content handling ([`agent.py#L636-L834`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/agent/agent.py#L636-L834)).
- Multiple tool calls from one response are handled as an action batch. The batch truncates calls after `Finish`, tracks blocked actions, and can execute tools in parallel ([`agent.py#L185-L371`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/agent/agent.py#L185-L371)).

**Interpretation**

- The nearest conceptual match is DeepSeek Harness: step-oriented execution plus durable conversation events.
- OpenHands adds a stronger client/server subscription boundary and a first-class event-tree branch model.

### Tools, permissions, and execution boundary

**Fact**

- Actions and observations are typed events. Tool execution returns observations that are appended back to the conversation event stream.
- Security analyzers classify action risk; analysis failure defaults to `HIGH` rather than failing open ([`analyzer.py`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/security/analyzer.py)).
- Confirmation policy is pluggable: `AlwaysConfirm`, `NeverConfirm`, and `ConfirmRisky` can decide based on risk and a configured threshold ([`confirmation_policy.py#L9-L61`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/security/confirmation_policy.py#L9-L61)).
- The confirmation path is represented in the conversation loop as `WAITING_FOR_CONFIRMATION`; the next run can execute pending actions after user approval ([`local_conversation.py#L1906-L1913`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L1906-L1913), [`agent.py#L652-L661`](https://github.com/OpenHands/software-agent-sdk/blob/28e8ed273617992e9556410804f54937cc059878/openhands-sdk/openhands/sdk/agent/agent.py#L652-L661)).

**Interpretation**

- OpenHands has separated the policy decision from the UI prompt. That is directly relevant to spool's allow/ask/deny requirement.
- Event durability also makes permission decisions auditable without a parallel bespoke log.

**Unresolved**

- This scan did not validate the complete policy chain for workspace escape, destructive shell commands, or network access.
- Client-defined tools and remote tool execution still need end-to-end tests.

### Session, cancellation, and recovery

**Fact**

- Session state can be reconstructed from immutable events and a selected active branch.
- The remote session socket has an explicit resume cursor and replays durable frames after disconnection.
- `LocalConversation.send_message()` records a user message event; `run()` continues to process concurrent user messages according to FIFO/state-lock behavior.
- Approval recovery, conversation lease, and restore behavior have dedicated tests under `tests/agent_server/` and `tests/cross/`.

**Interpretation**

- OpenHands provides the strongest adjacent evidence that conversation durability and remote observation should be one mechanism, not two unrelated implementations.

**Unresolved**

- Crash recovery timing, partial writes, stale-event behavior under multi-process contention, and migration compatibility were not reproduced.

## 4. Aider

### Identity and maturity

**Fact**

- Repository: [Aider-AI/aider](https://github.com/Aider-AI/aider) at commit `5dc9490bb35f9729ef2c95d00a19ccd30c26339c` (2026-05-22).
- Source version: `0.86.3.dev` ([`aider/__init__.py#L1-L6`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/__init__.py#L1-L6)); latest published release observed is `v0.86.0` (2025-08-09).
- License: Apache-2.0.
- Maintenance: repository is not archived, but the last observed commit is four months before this scan. Treat it as a stable product reference whose active development cadence is slower than OpenHands or LangGraph.

**Interpretation**

- Aider is valuable as a distilled coding-agent workflow, but it is not the best source for a new durable runtime architecture.

**Unresolved**

- This scan did not determine whether the slower cadence reflects stabilization, staffing limits, or a pending successor.

### Runtime paradigm

**Fact**

- `Coder.run()` performs a synchronous terminal input loop; each turn enters `run_one()` ([`base_coder.py#L876-L892`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L876-L892)).
- `run_one()` invokes `send_message()`, then permits a bounded reflected-message loop for edit-format or execution feedback ([`base_coder.py#L924-L944`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L924-L944)).
- `send_message()` mutates in-memory chat messages, formats the prompt, checks token limits, calls the model, and performs bounded retries for provider and output-limit failures ([`base_coder.py#L1419-L1520`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1419-L1520)).

**Interpretation**

- Aider's primary loop is an in-process REPL, not a service or graph.
- Its reliability mechanism leans on Git checkpoints and explicit reflection rather than a durable runtime event log.

### Tools, permissions, and Git boundary

**Fact**

- Aider does not expose a general typed tool registry. It specializes in edit formats, repository maps, shell/test commands, and Git operations.
- Before edits, it can commit dirty work; after edits, it can create one Aider-attributed Git commit for the turn ([`base_coder.py#L2375-L2423`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L2375-L2423)).
- `/undo` only reverses a commit created by Aider in the current chat and refuses unsafe cases such as pushed commits, merge commits, or dirty changed files ([`commands.py#L553-L650`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/commands.py#L553-L650)).
- Shell commands generated by the coder require explicit confirmation; command output is added to chat only after a separate confirmation ([`base_coder.py#L2434-L2485`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L2434-L2485)).

**Interpretation**

- Git is Aider's transaction ledger. It provides user-visible rollback and attribution with much less runtime machinery.
- This is a strong product interaction pattern and a weak concurrency/remote-execution model.

**Unresolved**

- The scan did not assess the full safety of edit parsing, shell-command derivation, or Git attribution.

### Session, context, and recovery

**Fact**

- Chat history is a Markdown transcript; input and LLM histories are separate files ([`io.py#L230-L359`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/io.py#L230-L359), [`io.py#L1117-L1136`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/io.py#L1117-L1136)).
- Context compaction summarizes earlier messages while retaining a recent tail ([`history.py#L27-L123`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/history.py#L27-L123)).
- Recovery after a bad edit is primarily `/undo` plus retained command output, not reconstruction from a runtime event log.

**Interpretation**

- Aider demonstrates that Git-native rollback can be enough for a local single-user coding agent.
- It does not provide the crash-resilient session reconstruction or multi-client reconnect semantics expected from spool's P0 session model.

**Unresolved**

- Behavior after process death during an edit or commit was not reproduced.

### Differentiation from the core samples

- Against DeepSeek Harness: Aider has no profile composition tree, persistent event surface, or equally rich step settlement model.
- Against Claude Code: Aider's advantage is not loop completeness but the simplicity and legibility of Git-as-transaction and `/undo`.

## 5. LangGraph

### Identity and maturity

**Fact**

- Repository: [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) at commit `c81c13533ee48c1ae0ef2de314737ef0c455f2be` (2026-09-18).
- Current Python package version in the pinned tree: `langgraph 1.2.11` ([`pyproject.toml#L6-L13`](https://github.com/langchain-ai/langgraph/blob/c81c13533ee48c1ae0ef2de314737ef0c455f2be/libs/langgraph/pyproject.toml#L6-L13)).
- Repository status: active, not archived; license MIT.
- Persistence adapters include in-memory, SQLite, and Postgres checkpoint packages.

**Interpretation**

- LangGraph is a runtime substrate rather than a coding-agent product. It is useful for testing durable control-flow assumptions, not for copying a coding-agent surface.

### Runtime paradigm

**Fact**

- `Pregel` owns graph nodes, channels, checkpointers, interrupts, and streaming execution ([`pregel/main.py#L450-L870`](https://github.com/langchain-ai/langgraph/blob/c81c13533ee48c1ae0ef2de314737ef0c455f2be/libs/langgraph/langgraph/pregel/main.py#L450-L870)).
- `PregelLoop` advances work in ticks. Before execution it can interrupt; after execution it persists a checkpoint and can interrupt again ([`pregel/_loop.py#L599-L724`](https://github.com/langchain-ai/langgraph/blob/c81c13533ee48c1ae0ef2de314737ef0c455f2be/libs/langgraph/langgraph/pregel/_loop.py#L599-L724)).
- Checkpointing is not implicit for every graph. Without a checkpointer, interrupts and durable resume cannot be used. `Command(resume=...)` explicitly raises if no checkpointer exists.

**Interpretation**

- The core difference is topology: LangGraph executes a graph of nodes by superstep, while DeepSeek, Claude Code, OpenHands, and Aider center on a model/tool loop.
- The superstep boundary gives a clean place to checkpoint effects, inspect state, or require human input.

### Tools, permissions, and human control

**Fact**

- Tools are ordinary callable nodes or tool nodes. The runtime does not provide a built-in coding-agent sandbox or workspace permission model.
- `interrupt()` suspends graph execution and returns a value when resumed ([`types.py#L880-L887`](https://github.com/langchain-ai/langgraph/blob/c81c13533ee48c1ae0ef2de314737ef0c455f2be/libs/langgraph/langgraph/types.py#L880-L887)).
- `Command(resume=...)` provides the resume payload ([`types.py#L827-L879`](https://github.com/langchain-ai/langgraph/blob/c81c13533ee48c1ae0ef2de314737ef0c455f2be/libs/langgraph/langgraph/types.py#L827-L879)).
- Tests cover interruption, checkpoints, resuming, parallel interrupts, subgraph resumes, and state history ([`test_interruption.py`](https://github.com/langchain-ai/langgraph/blob/c81c13533ee48c1ae0ef2de314737ef0c455f2be/libs/langgraph/tests/test_interruption.py), [`test_pregel.py`](https://github.com/langchain-ai/langgraph/blob/c81c13533ee48c1ae0ef2de314737ef0c455f2be/libs/langgraph/tests/test_pregel.py)).

**Interpretation**

- LangGraph's "permission" is really a general interruption/resume mechanism. Product-specific allow/ask/deny policy still belongs above it.
- The checkpoint/interrupt separation is a concrete model for resumable approval, but not a complete security model.

**Unresolved**

- Whether the checkpoint cost, schema migration burden, and concurrency semantics are justified for a single-user local coding agent is not established.

### Session, persistence, and recovery

**Fact**

- `BaseCheckpointSaver` defines thread lookup, listing, checkpoint writes, writes tied to tasks, and thread deletion ([`checkpoint/base/__init__.py#L177-L330`](https://github.com/langchain-ai/langgraph/blob/c81c13533ee48c1ae0ef2de314737ef0c455f2be/libs/checkpoint/langgraph/checkpoint/base/__init__.py#L177-L330)).
- The runtime can restore state, replay from a checkpoint, and branch/time-travel.
- Persistence is pluggable; durability therefore depends on the selected saver and its concurrency guarantees.

**Interpretation**

- LangGraph offers the clearest reference for durable workflow semantics, but it also demonstrates the cost of exposing too much checkpoint machinery at the product layer.

**Unresolved**

- Cross-backend equivalence, production failure recovery, and checkpoint garbage collection were not tested here.

### Differentiation from the core samples

- Against DeepSeek Harness: LangGraph separates graph topology from model/tool execution and makes checkpoints a host-selected service.
- Against Claude Code: LangGraph does not own prompt assembly, coding tools, or a terminal product workflow; its value is the durability/control substrate.

## 6. Mechanism-level comparison

This table is an **Interpretation** based on the pinned external sources and the current internal atlases.

| Mechanism | DeepSeek Harness | Claude Code | OpenHands SDK | Aider | LangGraph |
|---|---|---|---|---|---|
| Primary execution unit | Turn and step | User submission and query-loop iteration | Conversation step/action batch | REPL turn with bounded reflections | Superstep between graph checkpoints |
| Durable source of truth | Session event surface plus persisted session | Caller transcript plus query projection | Immutable conversation event tree | In-memory chat, Markdown history, Git commits | Checkpoint and pending writes |
| Tool boundary | Mounted tool service and model-facing schemas | Assembled built-in/MCP tool pool and permission pipeline | Typed actions/observations and remote workspace | Edit formats plus shell/test/Git commands | Arbitrary node/tool callables |
| Permission model | Approval and permission policy in runtime | Permission pipeline shared by interactive/headless | Risk analyzer plus confirmation policy | Explicit shell prompts and Git safeguards | No product policy; interrupt/resume only |
| Remote execution | Product surfaces share core runtime; remote/sandbox integrations exist | Headless/SDK and remote host support | First-class local/remote conversation factory and agent server | Local process and local Git repository | Host-defined executors; not agent-specific |
| Recovery | Rebuild from durable events, cancellation settlement, compaction | Query projection, transcript, compaction and SDK resume | Event replay, branch selection, WebSocket cursor, leases | `/undo` and Git history | Checkpoint replay, resume, time travel |
| Multi-agent seam | Inbox injection and extensible loop | Agent/SDK integrations and feature-gated coordination | Sender metadata, ACP agents, subagents/server APIs | Primarily single-agent | Graph/subgraph and fan-out/fan-in |
| Main missing lesson for spool | - | Product-grade prompt/permission ergonomics | Event tree and remote cursor are materially different | Git-native undo is a strong UX reference | Checkpoint/interrupt is a general durable workflow model |

Internal comparison sources:

- [DeepSeek runtime atlas](../../source-atlas/deepseek-harness/01-entrypoints-runtime.md)
- [Claude Code runtime atlas](../../source-atlas/claude-code/01-entrypoints-runtime.md)
- [DeepSeek Trace A](../../source-atlas/traces/trace-a-deepseek-harness.md)
- [Claude Code Trace A](../../source-atlas/traces/trace-a-claude-code.md)

## 7. Paradigm checklist

| Paradigm | Covered by | Conclusion |
|---|---|---|
| Event-driven runtime | OpenHands, DeepSeek | Yes. OpenHands adds an explicit event tree and client replay cursor. |
| Workflow/checkpoint runtime | LangGraph | Yes. It is materially different, but mostly a later durability/control reference. |
| Remote execution | OpenHands and A2A | Yes. Remote workspace/server boundaries are a distinct architecture, not just another tool. |
| Persistence and resume | OpenHands, LangGraph, DeepSeek | Yes. The scan found at least three materially different persistence models. |
| Multi-agent | OpenHands seams and A2A | Yes at protocol/seam level; not a P0 requirement. |
| Background/queue/steer | ACP v2 draft, DeepSeek inbox | Yes. This is becoming a protocol-level concern rather than a UI-only feature. |
| Model-runtime co-design | Provider SDKs and MCP evolution | Partially covered here; remains a separate frontier-radar item. |

## 8. Recommendations for further study

1. **Deep-dive OpenHands event durability and remote replay.** Compare its event tree, WebSocket cursor, lease handling, and confirmation policy against spool's planned append-only session and future sandbox seam.
2. **Use Aider as a rollback/UX reference, not as a core architecture source.** Extract lessons about Git-native review, `/undo`, and explicit shell confirmation without adopting its in-memory runtime.
3. **Study LangGraph only where durability semantics are unresolved.** Focus on checkpoint boundary placement, interrupt/resume, and write ordering; do not import its full graph abstraction into P0.
4. **Keep external mechanisms behind a probe gate.** The current evidence is sufficient to justify research, not product-scope changes.

## 9. Unresolved items

- No external runtime was executed in this scan.
- OpenHands remote failure recovery, multi-process locking, compaction, and storage growth were not reproduced.
- Aider's maintenance direction and process-crash behavior remain unclear.
- LangGraph cross-backend persistence guarantees and operational overhead were not benchmarked.
- The comparison does not yet include a real coding-task trace for any external runtime.
