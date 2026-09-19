# MCP, ACP, and A2A Boundary Comparison

> Verified: 2026-09-19
>
> Scope: protocol boundaries relevant to a coding-agent runtime.
>
> Rule: protocol support is not a product commitment; external findings do not enter P0 without a separate decision.

## 1. Naming and source baseline

**ACP ambiguity**

There are multiple projects using the acronym ACP. This document uses the **Agent Client Protocol** maintained by the `agentclientprotocol` organization because its boundary is between an editor/client and a coding agent. It does not use IBM/BeeAI Agent Communication Protocol or any unrelated ACP.

| Protocol | Pinned identity | Current status | License / governance |
|---|---|---|---|
| Model Context Protocol (MCP) | [`24efd6e`](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/24efd6e7cbd7a074e6b3b781eb370891df40afad), release [`2026-07-28`](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28) | Active; specification release plus current draft tree | Licensing transition from MIT to Apache-2.0 for new code/spec contributions; non-spec docs are CC-BY-4.0 |
| Agent Client Protocol (ACP) | [`d3c1dd7`](https://github.com/agentclientprotocol/agent-client-protocol/tree/d3c1dd78c5f25afbc37a755ebd1982b43dd97069), latest observed schema release `1.23.0` | v1 stable; v2 published as a draft on 2026-07-20 | Apache-2.0 |
| Agent2Agent Protocol (A2A) | [`afda831`](https://github.com/a2aproject/A2A/tree/afda8316c64951a2ecb2a0d3d10867405d2b4095), latest observed release `1.0.1` | Active; v1 specification, multiple protocol bindings | Apache-2.0 |

## 2. One-line boundary model

| Protocol | Primary relation | Unit exchanged | What it is designed to standardize |
|---|---|---|---|
| MCP | Host/client to context and tool server | Request/notification over tool, resource, prompt, and extension primitives | How one agent or application obtains context and invokes external capabilities |
| ACP | Editor/client to coding agent | Session, prompt lifecycle, session updates, permission requests, file/terminal bridge calls | How a client controls and observes an autonomous coding agent |
| A2A | Independent agent/client to remote agent | Task, message, artifact, and task status | How opaque agent systems delegate and collaborate across process or organizational boundaries |

**Interpretation**

- MCP deepens one runtime.
- ACP controls and observes one coding-agent runtime.
- A2A connects multiple runtimes as peers.

## 3. MCP 2026-07-28

### Fact: scope and core model

- MCP explicitly focuses on context exchange and does not dictate how the AI application uses an LLM or manages context ([architecture, line 23](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/24efd6e7cbd7a074e6b3b781eb370891df40afad/docs/docs/2026-07-28/learn/architecture.mdx#L23)).
- The host creates one MCP client per server. Servers may run locally over stdio or remotely over Streamable HTTP ([architecture, lines 27-76](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/24efd6e7cbd7a074e6b3b781eb370891df40afad/docs/docs/2026-07-28/learn/architecture.mdx#L27-L76)).
- The data layer is JSON-RPC-based and includes discovery, server primitives, client elicitation, and utility features. Sampling is deprecated as of this protocol version ([architecture, lines 77-95](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/24efd6e7cbd7a074e6b3b781eb370891df40afad/docs/docs/2026-07-28/learn/architecture.mdx#L77-L95)).
- The release describes MCP as stateless at the protocol layer: requests carry protocol version and relevant capabilities in `_meta`, and `server/discover` advertises versions/capabilities ([architecture, line 111](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/24efd6e7cbd7a074e6b3b781eb370891df40afad/docs/docs/2026-07-28/learn/architecture.mdx#L111)).
- The three core server primitives are tools, resources, and prompts ([architecture, lines 117-142](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/24efd6e7cbd7a074e6b3b781eb370891df40afad/docs/docs/2026-07-28/learn/architecture.mdx#L117-L142)).
- The Tasks extension lets a server return a durable task handle for long-running work, with polling, input requests, cancellation, and optional notifications ([Tasks extension](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/24efd6e7cbd7a074e6b3b781eb370891df40afad/docs/extensions/tasks/overview.mdx)).

### Fact: state, retries, and permissions

- MCP does not own the host's conversation state. The host remains responsible for model history, retries, model selection, and how tool output is injected.
- Tool execution is model-controlled in the interaction model, but the specification expects applications to provide oversight through availability controls, approval dialogs, permission settings, and activity logs ([server concepts](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/24efd6e7cbd7a074e6b3b781eb370891df40afad/docs/docs/2026-07-28/learn/server-concepts.mdx)).
- MCP authorization and transport security are host/server concerns. The protocol does not replace a coding-agent workspace policy.

### Interpretation

- MCP is a strong extension seam because it standardizes capability discovery and invocation without requiring spool to own every integration. Any move into P0 still requires a separate internal decision.
- It should not become spool's session or permission model. MCP task state is not a coding conversation, and MCP tool approval is policy supplied by the host.
- The stateless request metadata model reduces protocol-layer session coupling but increases the importance of a host-side event/history model.

### Unresolved

- Compatibility across older MCP revisions and SDKs is not established by this scan.
- The cost of dynamic discovery, tool-list changes, Tasks extension support, and remote authorization in a local-first product needs a prototype.

## 4. ACP v1 stable and v2 draft

### Fact: stable v1 boundary

- ACP defines JSON-RPC requests and notifications between Agents and Clients. Agents are typically subprocesses of an editor-like client ([overview, lines 6-45](https://github.com/agentclientprotocol/agent-client-protocol/blob/d3c1dd78c5f25afbc37a755ebd1982b43dd97069/docs/protocol/v1/overview.mdx#L6-L45)).
- The normal flow is `initialize`, optional authentication, `session/new` or `session/load`, `session/prompt`, streamed `session/update`, optional file/permission/terminal calls, `session/cancel`, and a prompt response with a stop reason ([overview, lines 15-39](https://github.com/agentclientprotocol/agent-client-protocol/blob/d3c1dd78c5f25afbc37a755ebd1982b43dd97069/docs/protocol/v1/overview.mdx#L15-L39)).
- ACP delegates important capabilities to the client: permission requests, text-file reads/writes, terminal create/output/wait/kill/release, elicitation, and session updates ([overview, lines 114-205](https://github.com/agentclientprotocol/agent-client-protocol/blob/d3c1dd78c5f25afbc37a755ebd1982b43dd97069/docs/protocol/v1/overview.mdx#L114-L205)).
- The protocol supports session creation, optional load/resume, modes, cancellation, and structured content such as plans and tool calls.

### Fact: v2 draft direction

- v2 is explicitly a draft and should be feature-gated and not shipped as a default until stabilization ([v2 draft announcement](https://github.com/agentclientprotocol/agent-client-protocol/blob/d3c1dd78c5f25afbc37a755ebd1982b43dd97069/docs/announcements/acp-v2-draft.mdx)).
- v2 moves beyond a prompt request owning the full turn: prompt response acknowledges the user message, while session updates can continue and the agent reports an idle state ([v2 draft](https://github.com/agentclientprotocol/agent-client-protocol/blob/d3c1dd78c5f25afbc37a755ebd1982b43dd97069/docs/announcements/acp-v2-draft.mdx)).
- v2 standardizes stable IDs and patch semantics for streamed messages/tool calls, structured file changes, and more extensible permission subjects.
- The schema version constant still identifies v1 as the latest stable version unless the unstable-v2 feature is enabled ([`version.rs`](https://github.com/agentclientprotocol/agent-client-protocol/blob/d3c1dd78c5f25afbc37a755ebd1982b43dd97069/agent-client-protocol-schema/src/version.rs)).

### Interpretation

- ACP is the closest external match to spool's future editor/client integration surface.
- Its client-owned filesystem and terminal capabilities are useful because they let an agent run without owning the user's host environment, but they require careful permission mapping.
- v2's move beyond a single turn confirms that background work, shared-session observation, and idle/queue semantics are becoming protocol-level requirements.

### Unresolved

- ACP v1 conformance across current clients/agents, session persistence guarantees, and permission recovery were not tested.
- v2 is unstable and cannot be used as a P0 dependency.

## 5. A2A v1

### Fact: scope and task model

- A2A connects independent, potentially opaque agent systems without requiring access to each other's internal state, memory, or tools ([specification, lines 15-23](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/specification.md#L15-L23)).
- Core data structures include `Task`, `Message`, `Part`, `Artifact`, and `AgentCard`. The task is the stateful unit of work; messages are turns; artifacts are deliverables.
- The canonical data model is protocol-agnostic. JSON-RPC, gRPC, and HTTP/REST bindings map the same abstract operations ([specification, lines 50-103](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/specification.md#L50-L103)).
- Operations include send message, send streaming message, get/list/cancel task, subscribe to task, and push-notification configuration. The protobuf service is the normative source ([`a2a.proto#L19-L143`](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/specification/a2a.proto#L19-L143)).
- Streaming uses protocol-specific streams; push notifications use webhooks for disconnected/long-running clients. Security guidance explicitly treats webhook URLs as SSRF and replay risks ([streaming and async](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/topics/streaming-and-async.md)).

### Relationship to MCP

- The A2A project describes MCP as vertical: it connects one agent to tools/resources.
- It describes A2A as horizontal: it connects independent agents across a boundary ([A2A and MCP, lines 12-23](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/topics/a2a-and-mcp.md#L12-L23)).

### Interpretation

- A2A is not needed to make a single coding agent work.
- Its durable task and resubscription model are useful research inputs for future background agents, but importing A2A concepts into P0 would add a network product surface before the local core is stable.

### Unresolved

- A2A authorization scoping, task retention, artifact integrity, push-notification authentication, and cross-vendor interoperability still require implementation-level validation.

## 6. Boundary matrix

| Dimension | MCP | ACP v1 stable | A2A v1 |
|---|---|---|---|
| Main relationship | Host/client to server | Client/editor to coding agent | Independent agent to remote agent |
| Primary unit | Tool/resource/prompt request | Session and prompt lifecycle | Task |
| Who owns conversation history | Host | Agent and/or client, by capability | Remote agent/task service |
| Tool execution ownership | Server, requested by host/model | Agent, often mediated by client file/terminal permissions | Remote agent; opaque to caller |
| Permission ownership | Host policy around MCP calls | Client permission requests and capability negotiation | Transport/application security; not a coding workspace policy |
| Long-running work | Tasks extension | Session updates, cancellation, resume capabilities | Task lifecycle plus streaming/webhooks |
| Recovery model | Host-owned; optional Tasks handle | `session/load`/resume capabilities | Task get/list/subscribe and push notification |
| Interoperability seam for spool | Tool/context integrations | Editor/client adapters | Future multi-agent delegation |
| P0 relevance | Reserve an adapter seam; one protocol path can be P0 extension work | Not required for first local P0; watch stable v1 and v2 draft | Not P0 |

## 7. Recommendations

1. **Study MCP before implementing ACP or A2A.** It has the clearest bounded integration value, but this finding does not by itself add MCP to P0.
2. **Design the internal session/event contract so a future ACP adapter can be a projection.** Do not make ACP types the internal session model.
3. **Keep A2A in the frontier/watch layer.** It addresses remote collaboration and long-running tasks, not the local coding loop.
4. **Track ACP v2 but do not depend on the draft.** The stable v1 shape is the compatibility baseline.

## 8. Unresolved items

- No protocol conformance suite or live cross-implementation test was run.
- MCP SDK version skew, ACP multi-client semantics, and A2A push-notification security remain unverified in the spool environment.
- MCP licensing is transitional; any code reuse requires file-level review even though the direction is Apache-2.0.

## Sources

- [MCP release 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28)
- [ACP v1 overview](https://github.com/agentclientprotocol/agent-client-protocol/blob/d3c1dd78c5f25afbc37a755ebd1982b43dd97069/docs/protocol/v1/overview.mdx)
- [ACP v2 draft](https://github.com/agentclientprotocol/agent-client-protocol/blob/d3c1dd78c5f25afbc37a755ebd1982b43dd97069/docs/announcements/acp-v2-draft.mdx)
- [A2A specification](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/specification.md)
