# Batch 4: Extensions and Product Surfaces

> Status: Batch 4 evidence synthesis
>
> Date: 2026-09-19
>
> Authority: [`../../research/PLAN.md`](../PLAN.md)
>
> Scope: L6 interaction, L7 extensions and integration, L8 advanced surfaces
>
> Decisions are not changed by this document. The P0/P1 section contains
> research recommendations only.

## 1. Source Baselines

| Source | Revision | Use in this comparison |
|---|---|---|
| DeepSeek Harness | `c291e7961a515f6d7af9304e7fd1d257929aef26`, `0.1.5-rc.2`, MIT, clean checkout | Primary source for composable runtime, protocol adapters, and shared product surfaces |
| Claude Code mirror | `5c4f331be6f162bb2f409a2435e9b989bedfafe3`, package label `999.0.0-restored`, dirty mirror without a license | Behavior and implementation-mechanism analysis only |

Source provenance is recorded in
[`source-provenance.md`](../source-atlas/00-provenance/source-provenance.md).
The Claude Code mirror contains local deletions and metadata changes. Findings
below are limited to the files present in this inspected revision and are not
treated as an official release contract.

External first-party references used for protocol shape only:

- [MCP specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [ACP v1 overview](https://agentclientprotocol.com/protocol/v1/overview)
- [ACP prompt turn](https://agentclientprotocol.com/protocol/v1/prompt-turn)
- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools)

## 2. Conclusion

**Fact.** DeepSeek Harness and Claude Code solve extension in opposite order:

- DeepSeek Harness starts from a general Cordis plugin composition. Commands,
  skills, hooks, MCP tools, protocols, and product surfaces are packages or
  application bundles mounted into the same runtime tree.
- Claude Code starts from one command/skill registry and one query engine.
  Plugins are mostly declarative bundles of commands, agents, skills, hooks,
  MCP/LSP configuration, and settings. Arbitrary in-process custom tools are
  routed through the separate Agent SDK in-process MCP path.

**Interpretation.** spool should copy neither top-level plugin architecture.
The useful common denominator is a small set of explicit seams:

1. A declarative command/skill registry that does not require executing
   third-party package code.
2. A stable tool registry that can receive native, SDK, and MCP tools through
   one execution and permission pipeline.
3. A surface adapter boundary so CLI/TUI, headless, and later protocol shells
   drive the same core runtime rather than reimplementing the agent loop.

This supports a narrow P0: declarative project extensions plus a stable tool
registry seam. MCP, hooks, package plugins, SDK, ACP, IDE, Desktop, and Web are
later expansions unless the benchmark changes the priority.

## 3. Extension Point Model

| Extension point | Process boundary | Model-visible | Human approval boundary |
|---|---|---|---|
| Commands | Usually same host process or declarative prompt content | Depends: local command result may stay out of model history; prompt command can enter it | Trusted application/plugin code; some commands add their own confirmation |
| Skills | File/provider content loaded into host memory | Yes, summary first and body on invocation | No separate sandbox; skill body can influence model behavior |
| Hooks | External command, prompt, agent, or HTTP call depending on host | Can inject context or block/ask on actions | Highest-risk automation seam; needs workspace trust and explicit policy |
| MCP tools | External process or network endpoint | Yes | Must enter the host's normal tool consent and permission path |
| Plugins/bundles | In-process code or declarative manifest depending on host | Indirectly through contributed features | Trusted installation boundary; package code is not sandboxed merely by being a plugin |
| Custom tools | Same process through a host API or in-process MCP bridge | Yes | Same tool permission path; annotations are metadata, not enforcement |
| SDK/ACP | Separate protocol client or process | Through the composed agent runtime | The controller owns approval decisions or delegates them to a human |
| Product shells | Replace presentation and input adapters, not the loop | Through common events and commands | Shell maps approvals and output; core retains policy semantics |

## 4. Extension Mechanisms

### 4.1 Commands

**Fact: DeepSeek Harness.**

- [`CommandRuntime.register()`](../../.references/deepseek-harness/packages/interaction/commands/src/index.ts)
  accepts a plugin-owned `CommandDefinition` with name, description, optional
  input metadata, and a direct UI handler.
- `execute()` records `command/run` before invocation and `command/done` after
  settlement. A command does not create a model message merely because it was
  invoked.
- The registry is layered by scope. A scoped command shadows a global command
  for the receiving agent.
- Registration returns an effect disposer, so unload or HMR unregisters the
  command. See
  [`CommandRuntime`](../../.references/deepseek-harness/packages/interaction/commands/src/index.ts)
  and
  [`commands`](../../.references/deepseek-harness/packages/interaction/commands/README.md).
- Interactive adapters consume the registry; headless and ACP do not expose
  this human-command surface.

**Fact: Claude Code.**

- [`loadAllCommands()`](../../.references/claude-code/src/commands.ts) merges bundled
  skills, built-in plugin skills, skill directories, workflows, plugin
  commands, plugin skills, and built-in commands into one `Command[]`.
- Markdown-backed commands and `SKILL.md` files are discovered from managed,
  user, and project configuration directories by
  [`loadMarkdownFilesForSubdir()`](../../.references/claude-code/src/utils/markdownConfigLoader.ts)
  and
  [`getSkillDirCommands()`](../../.references/claude-code/src/skills/loadSkillsDir.ts).
- `Command` is a union of prompt, local, and local-JSX commands. Frontmatter can
  select allowed tools, model, effort, inline or forked context, and
  command-scoped hooks. See
  [`types/command.ts`](../../.references/claude-code/src/types/command.ts) and
  [`createSkillCommand()`](../../.references/claude-code/src/skills/loadSkillsDir.ts).
- Command discovery is memoized and refreshed through explicit cache-clearing
  functions such as `clearCommandsCache()` and
  `clearCommandMemoizationCaches()`.

**Interpretation.** Claude Code deliberately unifies commands and skills as
one command model. DeepSeek Harness keeps human commands separate from skills
and model tools. spool should keep the concepts separate in runtime types even
if one Markdown loader can parse both, because local UI action, prompt
expansion, and model-invocable instruction content have different security and
lifecycle semantics.

**Unresolved.**

- Claude command `version` metadata is present in the command type, but no
  enforced compatibility or migration rule was found in the inspected mirror.
- DeepSeek command handlers are trusted same-process code. The source does not
  define a general capability sandbox around a command handler.

### 4.2 Skills

**Fact: DeepSeek Harness.**

- [`SkillRegistry`](../../.references/deepseek-harness/packages/skill/skill/src/index.ts)
  merges providers into a host and per-scope layered registry.
- [`skill-filesystem`](../../.references/deepseek-harness/packages/skill/skill-filesystem/src/index.ts)
  ranks project `.dsh/skills`, project `.agents/skills`, custom roots, user
  roots, and bundled skills. It supports directory bundles and flat Markdown
  files, not recursive `**/SKILL.md`.
- [`tool-skill`](../../.references/deepseek-harness/packages/skill/tool-skill/src/index.ts)
  injects only name and description into the session catalog. The full body is
  loaded on the model's `skill` tool call.
- Provider registration and runtime skill registration are effect-scoped and
  invalidate discovery caches on disposal.

**Fact: Claude Code.**

- `/skills/<name>/SKILL.md` is a directory-only format.
  The legacy `/commands/` loader still accepts single Markdown files and
  transforms a directory `SKILL.md` into a command named after its directory.
- Skills are represented as `prompt` commands and therefore share the command
  registry, invocation UI, and model-invocation filtering.
- Frontmatter controls model invocation, user invocation, allowed tools,
  model, effort, path activation, forked execution, and hooks.
- [`SkillTool`](../../.references/claude-code/src/tools/SkillTool/SkillTool.ts)
  resolves the command, applies invocation policy, and either expands the
  skill in the current context or runs it in a forked agent.

**Interpretation.** Both products treat skills as progressive context
disclosure rather than executable tool code. The key spool decision is
whether skill frontmatter may register hooks. Claude Code permits this; DeepSeek
Harness keeps hooks as separate bridge configuration. For P0, the safer design
is content and metadata only, with hooks excluded.

**Unresolved.**

- Claude skill frontmatter hooks are source-present in the inspected mirror,
  but their shipped, default-on status and version compatibility are not
  established by the mirror.
- Neither product defines a skill ABI version in the normalized skill shape.
  The unit of compatibility is currently the host release plus frontmatter
  parser behavior.

### 4.3 Hooks

**Fact: DeepSeek Harness.**

- The shared engine is
  [`hook-protocol`](../../.references/deepseek-harness/packages/hooks/hook-protocol/src/index.ts).
  It validates matchers, runs commands through the shell seam, decodes output,
  merges decisions, and records `hook/invoked` and `hook/result`.
- The Claude Code and Codex bridges subscribe to runtime events including
  session start, pre-step, pre-tool, post-tool, and turn stopping.
- Only command hooks are executed. HTTP, MCP-tool, prompt, and agent hook forms
  are skipped with a warning.
- Decision precedence is `deny > ask > allow`. Exit code 2 blocks with stderr
  as the reason; other failures are non-blocking.
- `continue: false` is recorded but has no run-level hard-stop effect.
  `updatedInput` is parsed but not honored.
- Hook commands run through `ctx.shell` and its active sandbox policy rather
  than spawning directly.

**Fact: Claude Code.**

- [`hooks` utilities](../../.references/claude-code/src/utils/hooks.ts) implement the
  hook runtime and lifecycle.
- The persisted hook schema supports command, prompt, agent, and HTTP hook
  types in
  [`schemas/hooks.ts`](../../.references/claude-code/src/schemas/hooks.ts).
- Hook configuration can come from user, project, local, managed, plugin,
  skill, or in-memory session sources. Plugin and skill hooks are converted to
  native matchers.
- Workspace trust is enforced before hooks execute. Non-interactive SDK mode
  treats trust as implicit.
- A hook `allow` does not bypass existing deny/ask rules. `updatedInput` is
  honored in the permission-decision path.

**Interpretation.** Hooks are the highest-risk extension point. They combine
event-driven control with arbitrary commands and can turn a content extension
into code execution. spool should not ship hooks in the first extension path.
If added, start with command hooks only, a fixed event allowlist, workspace
trust, no implicit `allow` override, and a visible audit trail.

**Unresolved.**

- DeepSeek `continue: false` and input rewriting have no effective run-level
  behavior yet.
- Hook ABI/version negotiation is absent in both products. Compatibility
  follows the host release and event payload schema.

### 4.4 MCP

**Fact: DeepSeek Harness.**

- [`mcp-client`](../../.references/deepseek-harness/packages/mcp/mcp-client/src/index.ts)
  supports stdio and Streamable HTTP transports. Each configured server is one
  plugin instance with a stable `serverName`.
- [`syncTools()`](../../.references/deepseek-harness/packages/mcp/mcp-client/src/tools.ts)
  drains paginated `tools/list`, constructs a complete generation, then swaps
  registrations atomically. Disposal unregisters that generation.
- Public names are `mcp__<serverName>__<rawName>`, normalized to DeepSeek
  function-name constraints with a hash when normalization is lossy.
- MCP tools enter `ctx.tools.register()` and therefore use the normal local
  tool execution pipeline.
- The bridge supports MCP tools only. MCP resources and prompts are not
  consumed.
- Stdio child environments start from a scrubbed parent environment and merge
  only explicit variables.

**Fact: Claude Code.**

- [`McpServerConfigSchema`](../../.references/claude-code/src/services/mcp/types.ts)
  recognizes stdio, SSE, HTTP, WebSocket, IDE SSE/WebSocket, SDK, and
  claude.ai proxy server types.
- [`client.ts`](../../.references/claude-code/src/services/mcp/client.ts) imports MCP
  tool, resource, prompt, elicitation, root, and OAuth-related SDK types.
  MCP tools are converted to native `Tool` definitions; resource and auth
  tools are also present.
- [`assembleToolPool()`](../../.references/claude-code/src/tools.ts) combines built-in
  and MCP tools, removes denied MCP tools, and gives built-ins precedence on a
  name collision.
- Plugin-provided MCP servers are namespaced and deduplicated against manual
  servers. Manual configuration wins.
- MCP tools pass through the normal `canUseTool` permission path. Hook and
  settings deny/ask rules still apply.

**Interpretation.** MCP is the cleanest cross-vendor tool-extension seam, but
it is larger than a command/skill loader because it adds process or network
lifecycles, authentication, reconnection, schema adaptation, name collision
rules, and untrusted output. spool should design the tool registry so MCP can
be added without changing the agent loop, while keeping MCP itself in P1 unless
third-party tools become a P0 release blocker.

**Unresolved.**

- Claude Code's mirror uses wildcard MCP SDK dependency ranges with no lockfile
  in the inspected checkout, so its exact protocol revision is not pinned.
- MCP prompt-to-skill behavior is feature-gated by `MCP_SKILLS`; source
  presence does not establish baseline availability or maturity.
- DeepSeek Harness supports tools only. The cost of adding resources, prompts,
  roots, sampling, and elicitation is not represented by current source code.
- MCP tool annotations are untrusted hints. The external specification
  explicitly requires clients not to treat them as authorization.

### 4.5 Plugins and Bundles

**Fact: DeepSeek Harness.**

- The public package model is a Cordis plugin. A plugin exports `name`,
  optional `inject`, and `apply(ctx, config)` and registers effects on the
  runtime context.
- An application bundle is a static patch layer declared through
  `dsh.bundle.patch`. `dsh plugin` forwards package management to pnpm and
  reconciles `dsh.profile.bundles`.
- [`composeProfile()`](../../.references/deepseek-harness/apps/cli/src/profile-boot.ts)
  stacks bundle patches, profile patches, home patches, and invocation
  overlays before boot.
- Bundle membership changes on disk require a restart. A live-reload profile
  can reload patch files, but plugin code is still trusted in-process code.
- `packages/extensions` is a different mechanism: model-authored dynamic
  Cordis packages use a `node:vm` sandbox, immutable package versions, and
  browser-half approval. Its own documentation states that the VM is not a
  security boundary and dynamic packages should be treated like bash access.

**Fact: Claude Code.**

- [`PluginManifestSchema`](../../.references/claude-code/src/utils/plugins/schemas.ts)
  describes declarative contributions: commands, agents, skills, hooks,
  output styles, MCP servers, LSP servers, settings, user configuration, and
  channels.
- [`createPluginFromPath()`](../../.references/claude-code/src/utils/plugins/pluginLoader.ts)
  scans conventional directories and loads all declared components.
- Plugin command, skill, agent, and hook caches are refreshed through explicit
  clear/reload paths.
- Plugin versions are used for versioned cache paths and update detection.
  Explicit manifest version, marketplace version, git SHA, or `unknown` are
  the observed fallback order.
- The manifest has no custom executable tool callback. A plugin extends tools
  through MCP or the separate Agent SDK in-process MCP path.

**Interpretation.** A package registry is a platform commitment. It is not
required for a stable third-party extension path if commands and skills can be
loaded from project files. spool should avoid a marketplace and arbitrary
in-process plugin ABI in P0. If tool extensibility is required, MCP is a
smaller trust boundary than loading third-party host code.

**Unresolved.**

- Claude Code's plugin schema evolves independently of individual component
  schemas. No general cross-version migration contract was established from
  the mirror.
- DeepSeek profile bundles share package-manager version semantics, but there
  is no separate plugin ABI version.

### 4.6 Custom Tools

**Fact: DeepSeek Harness.**

- `ctx.tools.register(defineTool(...))` is the native custom-tool path. The
  definition includes model schema, canonical output schema, execute callback,
  optional presentation, timeout, and concurrency metadata.
- [`ToolRuntime`](../../.references/deepseek-harness/packages/core/tools/src/index.ts)
  owns the execution pipeline:
  `tools/pre-execute`, monotonic guards, `tools/execute`,
  `tools/post-execute`, `finalizeContent`, and `tools/result`.
- Registration is an effect and disposal unregisters the tool.
- Native tool definitions are trusted same-process contributions. Raw
  JSON-Schema definitions are accepted and validate their own input.

**Fact: Claude Code.**

- SDK custom tools use `tool()` plus `createSdkMcpServer()` and are passed to
  `query()` through `mcpServers`.
- The mirror exposes `createSdkMcpServer()` in
  [`agentSdkTypes.ts`](../../.references/claude-code/src/entrypoints/agentSdkTypes.ts)
  as a public SDK type/entrypoint stub. Runtime setup is implemented by
  [`setupSdkMcpClients()`](../../.references/claude-code/src/services/mcp/client.ts),
  using `SdkControlClientTransport`.
- The official first-party documentation states that the SDK custom-tool
  server runs in-process in the application and is addressed through the MCP
  tool contract.
- External plugin manifests do not directly register arbitrary custom tools;
  MCP is the compatibility boundary.

**Interpretation.** If spool exposes an in-process custom-tool API, it should
be framed as a trusted host API, not a third-party plugin ABI. Third-party
tools should enter through MCP. The internal registry should still normalize
both paths into one `ToolDefinition` and one permission pipeline.

**Unresolved.**

- The mirror does not establish the full public SDK process model; several
  SDK entrypoint functions are stubs in the restored source.
- Tool annotations are not enforcement. Both products rely on host policy for
  read-only, destructive, and concurrency semantics.

### 4.7 SDK

**Fact: DeepSeek Harness.**

- [`sdk`](../../.references/deepseek-harness/packages/sdk/README.md) is a family
  of protocol, client, and server packages. Clients drive a complete runtime
  over newline-delimited JSON-RPC on stdio.
- The TypeScript client launches `dsh` with a named profile and ordered patch
  files. Python uses the same wire contract and a bundled runtime.
- The protocol exposes `initialize`, `session.prompt`, `session.event`,
  `session.status`, `subagent.*`, and `shutdown`.
- It has no per-session close or prompt-cancel method. Client-to-server
  notifications and server-to-client requests are unimplemented.
- `dsh --profile sdk` and `sdk-minimal` are profiles, not separate agent
  implementations. They reuse the surrounding runtime composition.

**Fact: Claude Code.**

- [`QueryEngine.submitMessage()`](../../.references/claude-code/src/QueryEngine.ts)
  owns query lifecycle and session state. It calls the shared lower-level
  [`query()`](../../.references/claude-code/src/query.ts).
- The headline operator calls the same `query()` function.
- [`runAgent()`](../../.references/claude-code/src/tools/AgentTool/runAgent.ts) also
  calls `query()`, so subagents share the query engine rather than a separate
  loop.
- The official Agent SDK overview states that the SDK exposes the same tools,
  agent loop, and context management as Claude Code, with Python and
  TypeScript libraries plus a CLI subprocess path for other languages.

**Interpretation.** SDK compatibility is about protocol stability, not just
code reuse. DeepSeek serves a pinned runtime subprocess over a narrow wire;
Claude exposes a library plus a subprocess fallback. spool should not freeze an
SDK wire until its session events, cancellation, errors, and tool schema are
stable.

**Unresolved.**

- DeepSeek's SDK wire has no explicit protocol version negotiation in the
  inspected documentation.
- The Claude Code mirror does not expose the full published SDK implementation
  or its exact subprocess boundary.

### 4.8 ACP

**Fact: DeepSeek Harness.**

- [`dsh-acp`](../../.references/deepseek-harness/packages/acp/acp/src/index.ts)
  is an automation-only ACP server over JSON-RPC stdio.
- `initialize` advertises ACP protocol version, image prompt support when the
  route supports it, Streamable HTTP MCP support, and the session list,
  resume, and close capabilities.
- Supported calls include session creation, list, resume, close, model and
  reasoning-effort configuration, prompt, cancel, semantic updates, and
  one-shot permission requests.
- ACP clients are trusted controllers. The bridge supports absolute workspace
  paths and validates MCP launch declarations before publishing a session.
- The bridge intentionally omits commands, plans, terminals, client file
  operations, elicitation, fork, load, and deletion.
- Permissions are one-shot allow-once or reject-once. Unknown responses do not
  create durable grants.

**Fact: Claude Code mirror.**

- No ACP SDK import or ACP method implementation was found in the inspected
  source tree.
- Claude Code has separate IDE, remote-control, SDK, and MCP server surfaces,
  but they are not presented through ACP in this mirror.

**Fact: external ACP v1.**

- Baseline calls are `initialize`, `session/new`, `session/prompt`, and
  `session/cancel`; the client provides `session/request_permission` and
  receives `session/update`.
- Optional capabilities include session load, modes, client file operations,
  terminals, commands, plans, elicitation, and authentication.
- Initialization negotiates versions and capabilities. Custom behavior uses
  `_meta`, underscore-prefixed methods, or advertised custom capabilities.

**Interpretation.** ACP is a strong P1 automation protocol because it gives
IDE or orchestrator clients a standardized session, event, cancellation, and
permission contract. It should not be implemented before the local core has a
stable session event stream and permission model. Starting with the DSH-like
automation subset is more honest than advertising unsupported UI capabilities.

**Unresolved.**

- Claude Code may expose ACP through an external component not present in this
  mirror. No conclusion about the shipped product is drawn from source
  absence.
- ACP version compatibility currently depends on the client SDK and
  capability negotiation; the exact forward-compatibility policy for spool is
  not defined.

### 4.9 CLI/TUI, IDE, Desktop, and Web

**Fact: DeepSeek Harness.**

- `dsh` is the sole public Node launcher. Headless, SDK, ACP, and Web are
  profiles or aliases rather than separate bins.
- The base bundle supplies the shared model connection, tool set, persistence,
  and permission defaults to all base-backed surfaces.
- [`web-app`](../../.references/deepseek-harness/packages/bundle/web-app/README.md)
  adds the browser host and client while keeping the base runtime. The shipped
  Web GUI is in-process with the host runtime and uses the same tools and
  safety defaults.
- [`apps/desktop`](../../.references/deepseek-harness/apps/desktop/README.md) is
  an Electron shell around a bundled `dsh` runtime and separate plugin state.
  It shares sessions, settings, credentials, and workspaces through the common
  DSH home.
- No first-party IDE shell was found in the pinned package layout. ACP is the
  general editor-facing integration path.

**Fact: Claude Code mirror.**

- The interactive TUI is the direct in-process surface:
  [`main.tsx`](../../.references/claude-code/src/main.tsx) mounts the REPL and Ink UI.
- Headless and SDK mode use
  [`StructuredIO`](../../.references/claude-code/src/cli/structuredIO.ts),
  [`runHeadless()`](../../.references/claude-code/src/cli/print.ts), and
  `QueryEngine`, while the REPL calls the same lower-level `query()`.
- IDE integration is a connector boundary, not a separate editor runtime.
  [`detectIDEs()`](../../.references/claude-code/src/utils/ide.ts) reads IDE lockfiles
  and connects through IDE MCP transports or RPC.
- The mirror contains a Desktop handoff command and Claude Desktop MCP-config
  reader, but no bundled desktop shell.
- Remote Web and mobile access are implemented through the remote-control
  bridge and WebSocket session transport:
  [`bridgeMain()`](../../.references/claude-code/src/bridge/bridgeMain.ts),
  [`RemoteSessionManager`](../../.references/claude-code/src/remote/RemoteSessionManager.ts),
  and
  [`SessionsWebSocket`](../../.references/claude-code/src/remote/SessionsWebSocket.ts).
  The inspected mirror contains no local Web UI.

**Interpretation.** The product surface should be a client of stable runtime
events, commands, and permission requests. DeepSeek proves that profiles can
share one core; Claude proves that multiple hosts can share one query engine.
Neither result justifies building several shells at once. CLI/TUI and headless
are sufficient P0 validation surfaces; Desktop, IDE, and Web should follow only
after the runtime contract is stable.

**Unresolved.**

- DeepSeek's Electron Desktop release has platform signing, packaging, and
  update complexity not covered by the shared-runtime conclusion.
- Claude Desktop and Claude Code Web are external product surfaces in this
  mirror. Their full runtime boundaries cannot be established from local
  source.

## 5. Shared Core Runtime

### DeepSeek Harness

**Fact.** All base-backed surfaces assemble a named profile over `dsh-base`.
The profile changes the mounted host/client rows, not the definition of an
agent, tool, session, or persistence service. Web, headless, SDK, and ACP
therefore share the same core services while exposing different drivers.

**Interpretation.** This is the strongest source-backed example of
"surface as composition". spool should make the command line and TUI adapters
consume the same runtime handles used later by a desktop process. Surface
logic should own presentation and input, never tool execution or permission
state transitions.

### Claude Code

**Fact.** `QueryEngine` and `query()` are reused by headless/SDK paths, the
REPL, and subagents. Remote bridges carry serialized SDK messages and
permission-control messages over WebSocket. IDE integration attaches through
MCP/RPC boundaries. Plugin components are loaded into the same command,
skill, hook, and tool collections rather than into a second runtime.

**Interpretation.** Claude's strongest architecture lesson is not its plugin
manifest. It is the shared query engine plus a typed stream of events and
permission requests that can be adapted to multiple surfaces.

## 6. Version Compatibility Matrix

| Extension point | DeepSeek Harness | Claude Code mirror | spool implication |
|---|---|---|---|
| Commands | No command ABI version; plugin effect lifecycle | Command `version` metadata exists, but no enforced compatibility rule found | Keep command schema explicit and additive; do not claim version enforcement |
| Skills | No skill ABI version; provider controls parsing | `SKILL.md` and frontmatter parser are host-release coupled | Version the parser, not the prompt body |
| Hooks | Host event names plus bridge dialect; partial Claude/Codex compatibility | Host event names plus persisted hook schema; no handshake | Use a small event allowlist and reject unknown events loudly |
| MCP | SDK dependency plus local name/schema normalization; tools-only | SDK dependency range is not pinned in the mirror; broad transport matrix | Pin the MCP SDK and publish supported transport/capability subset |
| Plugins | Package-manager versions and bundle patch layers; in-process ABI tied to package versions | Plugin version is primarily cache/update identity | Keep third-party package ABI out of P0 |
| Custom tools | Native in-process API has no serialization boundary | Public SDK API plus in-process MCP contract | Separate trusted native tools from third-party MCP tools |
| SDK | Newline JSON-RPC contract; no explicit negotiation found | Agent SDK releases and changelogs are versioned, but mirror internals are incomplete | Add wire/version fields before public release |
| ACP | Pinned ACP SDK, capability negotiation, limited advertised surface | Not present in mirror | Advertise only implemented capabilities and negotiate |
| Product surfaces | Surface bundles can pin `/startup` or `/live` patch lifecycle | Surfaces share query but have separate release/runtime plumbing | Version the runtime event contract, not the UI component tree |

## 7. P0/P1 Recommendation

These are research recommendations, not entries in the subtraction log.

### P0

1. **Adopt a declarative project extension path.**

   Support project-level Markdown commands and skills with a small, documented
   frontmatter subset. Keep command discovery, skill discovery, and model tool
   registration as separate typed views even if they share a file loader.

2. **Reserve the tool registry seam from day one.**

   Native tools, future MCP tools, and any future trusted SDK tools should
   converge on one tool definition and one execution pipeline:
   admission, permission, dispatch, cancellation, result normalization, and
   audit.

3. **Make CLI/TUI and headless/SDK-style invocation share one agent runtime.**

   The acceptance evidence should show identical session events and permission
   decisions across interactive and non-interactive execution.

4. **Do not execute third-party package code in P0.**

   No marketplace, no arbitrary in-process plugin ABI, and no model-authored
   runtime package loader. A declarative extension path is enough to satisfy
   the current P0 extension requirement.

### P1

1. **MCP tools-only client.**

   Start with stdio, then add Streamable HTTP if needed. Pin the MCP SDK,
   support tools only, normalize names, isolate generations, and route every
   call through the existing permission pipeline.

2. **Hooks, command-only first.**

   Add workspace trust, a fixed event set, explicit sandbox policy, audit
   events, and no implicit override of deny/ask rules.

3. **SDK JSON-RPC and ACP.**

   Prototype only after session events, cancellation, errors, and permission
   outcomes are stable. Publish a protocol/version handshake and clearly list
   unsupported methods.

4. **Desktop, IDE, and Web shells.**

   Build one shell at a time on the stable runtime event/permission contract.
   Do not build a second agent loop, a second tool registry, or a separate
   permission model for a shell.

### Keep out of the current scope

- Third-party in-process plugin packages.
- Plugin marketplaces and automatic dependency installation.
- Full MCP resources, prompts, roots, sampling, and elicitation.
- ACP commands, plans, terminals, client file operations, and elicitation.
- Desktop, IDE, Web, and mobile shells built in parallel.
- A plugin system that treats annotations or manifests as security policy.

## 8. Unresolved and Next Evidence

1. Run a command/skill collision probe in a clean fixture to determine the
   intended precedence and user visibility of duplicate names.
2. Run a hooks probe to confirm whether hook `allow` can ever bypass a
   user-level deny or workspace boundary in the shipped Claude Code release.
3. Pin an MCP SDK version and test tools-only interoperability for pagination,
   tool-list change, cancellation, image output, structured output, and
   server restart.
4. Define whether spool's first extension path is project-only or also loads
   user-level extensions. Precedence and trust cannot be left implicit.
5. Define the minimum stable session event schema needed by CLI/TUI, headless,
   and future protocol adapters before freezing any SDK or ACP wire.
6. Record product-surface decisions only after real task benchmarks show that
   the shared runtime is stable enough to support a second shell.
