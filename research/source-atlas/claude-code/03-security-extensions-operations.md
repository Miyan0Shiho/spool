# Claude Code Source Mirror: L5-L8 Security, Interaction, Extensions, and Operations

> Mirror revision: `5c4f331be6f162bb2f409a2435e9b989bedfafe3`
>
> Scope: permissions and sandboxing; interactive/headless surfaces; commands, skills, hooks, MCP, plugins, and SDK; background tasks, persistence, telemetry, settings, and update operations.

## Evidence Scale

- **High**: complete current source path with explicit types and state transitions.
- **Medium**: behavior is directly present but feature/platform/provider gated.
- **Low**: implementation is delegated to an absent dependency, abbreviated by a generated feature adapter, or supported only by comments.

## L5: Security and Permissions

### L5-01 Permission modes

**Fact, High**

The permission model has distinct modes:

- `default`;
- `plan`;
- `acceptEdits`;
- `bypassPermissions`;
- `dontAsk`;
- conditional/private `auto`.

`src/utils/permissions/PermissionMode.ts` owns external mapping and display metadata. `auto` is explicitly not an external mode in the current source.

Source: `src/utils/permissions/PermissionMode.ts`, symbols `PERMISSION_MODE_CONFIG`, `isExternalPermissionMode`, `toExternalPermissionMode`.

**Interpretation**

- Permission mode is a policy switch, not a tool-specific flag.
- Plan and bypass modes have interaction with `prePlanMode`, working-directory rules, and bypass availability state.

### L5-02 Rule model

**Fact, High**

- Permission behavior is `allow | deny | ask`.
- Rules carry a tool name and optional rule content.
- Rule sources include settings sources plus CLI, command, and session sources.
- Tool-level rules match names or MCP server wildcards.
- Content-specific rules are delegated to `tool.checkPermissions()`.
- Permission updates can be applied in memory or persisted to editable settings sources.

Sources:

- `src/utils/permissions/PermissionRule.ts`.
- `src/utils/permissions/PermissionUpdate.ts`.
- `src/utils/permissions/permissions.ts`, symbols `getAllowRules`, `getDenyRules`, `getAskRules`.

**Interpretation**

- The general engine owns source precedence and persistence; each tool owns interpretation of content within that source.

**Unresolved**

- Full precedence when identical rules exist across managed, user, project, local, CLI, command, and session sources.

### L5-03 Core permission decision pipeline

**Fact, High**

`hasPermissionsToUseToolInner()` follows this order:

1. Abort check.
2. Entire-tool deny.
3. Entire-tool ask, with a sandbox auto-allow exception for eligible Bash commands.
4. Tool-specific `checkPermissions()`.
5. Tool-specific deny.
6. Required-user-interaction guard.
7. Content-specific ask rules.
8. Bypass-immune safety checks.
9. Bypass mode.
10. Entire-tool allow.
11. Convert passthrough to ask.

After this function, `hasPermissionsToUseTool()` applies:

- `dontAsk` conversion;
- private auto-mode classifier when enabled;
- headless/background auto-deny with PermissionRequest hook fallback.

Source: `src/utils/permissions/permissions.ts`, symbols `hasPermissionsToUseToolInner`, `hasPermissionsToUseTool`, `checkRuleBasedPermissions`.

**Interpretation**

- Safety checks and explicit user asks are intended to survive bypass mode where flagged as bypass-immune.

**Unresolved**

- Whether every tool consistently sets the appropriate safety decision reason.

### L5-04 Interactive permission handling

**Fact, High**

- `useCanUseTool()` constructs a `PermissionContext`, checks abort state, runs the policy pipeline, and routes `ask` decisions to coordinator/worker/interactive handlers.
- `handleInteractivePermission()` pushes a `ToolUseConfirm` queue item.
- Approval can include updated input, persistent permission updates, user feedback, and content blocks.
- Rejection/abort cancels the permission wait and may abort the whole query.
- Remote bridge, channel responses, PermissionRequest hooks, and Bash classifiers can race local input; a resolve-once guard ensures one winner.

Sources:

- `src/hooks/useCanUseTool.tsx`.
- `src/hooks/toolPermission/PermissionContext.ts`.
- `src/hooks/toolPermission/handlers/interactiveHandler.ts`.
- `src/components/permissions/PermissionRequest.tsx`.

**Interpretation**

- Permission UI is a multi-source race. Local human input is the floor, not necessarily the only responder.

### L5-05 SDK/headless permission handling

**Fact, High**

- `StructuredIO.createCanUseTool()` calls the shared policy pipeline first.
- If policy returns `ask`, it starts PermissionRequest hooks and an SDK `can_use_tool` control request concurrently.
- The first valid result wins.
- Abort sends `control_cancel_request` and rejects the pending request.
- Failure to obtain a host decision resolves to `deny`.

Source: `src/cli/structuredIO.ts`, symbol `createCanUseTool`.

**Interpretation**

- Headless operation is fail-closed when no permission surface responds.

### L5-06 Workspace and path boundaries

**Fact, High**

- Read/write/edit tools validate against working directories, additional directories, explicit permission rules, and internal allowed paths.
- Dangerous files/directories include Git metadata/config, shell startup files, IDE configuration, `.claude`, `.mcp.json`, and related executable hooks/skills.
- Path traversal, UNC/network paths, shell-expansion syntax, glob-in-write, Windows alternate-data-stream/device-name forms, symlink-sensitive checks, and case normalization are handled in path validation.
- Scratchpad, plan, session-memory, task-output, and tool-result directories have explicit internal exceptions with secure permissions and traversal checks.

Sources:

- `src/utils/permissions/filesystem.ts`, symbols `DANGEROUS_FILES`, `DANGEROUS_DIRECTORIES`, `isDangerousFilePathToAutoEdit`.
- `src/utils/permissions/pathValidation.ts`, symbol `validatePath`.

**Interpretation**

- Path security is layered: canonicalization, dangerous-path policy, working-directory policy, and sandbox path policy.

**Unresolved**

- Filesystem race protection for every existing/nonexistent/symlink combination.

### L5-07 Bash security analysis

**Fact, High**

`BashTool` uses multiple validation layers:

- AST parsing when available;
- legacy shell parsing fallback;
- shell semantics checks;
- exact/prefix/wildcard permission matching;
- prompt classifiers for allow/ask/deny descriptions;
- subcommand and operator traversal;
- path/redirection validation;
- read-only command constraints;
- many named validators in `bashSecurity.ts` for command substitution, unsafe heredocs, redirection, newlines, variable injection, malformed tokens, brace expansion, parser differentials, and shell-specific escape paths.

Sources:

- `src/tools/BashTool/bashPermissions.ts`, symbol `bashToolHasPermission`.
- `src/tools/BashTool/bashSecurity.ts`, symbols `bashCommandIsSafe_DEPRECATED`, `bashCommandIsSafeAsync_DEPRECATED`.
- `src/tools/BashTool/readOnlyValidation.ts`.
- `src/tools/BashTool/pathValidation.ts`.

**Interpretation**

- The implementation treats shell parsing as security-sensitive and fails to ask when it cannot establish an allow decision.

**Unresolved**

- Effectiveness against all parser-differential and shell-specific attacks cannot be established without tests/adversarial review.

### L5-08 Sandbox model

**Fact, High**

`src/utils/sandbox/sandbox-adapter.ts` wraps `@anthropic-ai/sandbox-runtime`.

The adapter:

- converts settings into network and filesystem restrictions;
- derives allowed/denied network domains from WebFetch rules;
- derives read/write paths from Read/Edit rules and sandbox settings;
- always allows the working directory and Claude temp directory;
- always denies writes to settings files, managed settings, and skill directories;
- protects Git metadata and mitigates bare-repository/config execution attacks;
- supports worktree main-repository write access;
- forwards command wrapping and cleanup to the runtime;
- exposes sandbox availability, policy locks, exclusions, and auto-allow state.

Sources:

- `src/utils/sandbox/sandbox-adapter.ts`, symbols `convertToSandboxRuntimeConfig`, `SandboxManager`.
- `src/tools/BashTool/shouldUseSandbox.ts`, symbol `shouldUseSandbox`.
- `src/utils/Shell.ts`, symbol `exec`.

**Interpretation**

- The application permission system and OS/container sandbox are complementary: path prompts do not replace sandbox isolation, and exclusions are not themselves the security boundary.

**Evidence strength for actual enforcement: Medium**

- The runtime package source is absent, so network/filesystem enforcement and platform behavior cannot be verified from this mirror.

**Unresolved**

- macOS/Linux/WSL enforcement details, proxy behavior, socket rules, nested sandbox behavior, and bypass resistance.

## L6: Interaction and UI

### L6-01 Interactive entry

**Fact, High**

- `launchRepl()` dynamically imports `App` and `REPL` and renders them into the Ink root.
- `showSetupScreens()` establishes workspace trust before full trusted settings/environment activation.
- `renderAndRun()` handles the common render/exit/shutdown lifecycle.

Sources:

- `src/replLauncher.tsx`, symbol `launchRepl`.
- `src/interactiveHelpers.tsx`, symbols `showSetupScreens`, `renderAndRun`.

### L6-02 REPL state ownership

**Fact, High**

`REPL` owns or coordinates:

- authoritative message array and ref;
- active abort controller;
- loading/query state and generation guard;
- streaming text, thinking, and tool-use previews;
- in-progress tool IDs;
- permission queue;
- tool JSX/modal state;
- command queue;
- transcript/scroll/search state;
- local UI-only status and error messages.

Source: `src/screens/REPL.tsx`, component `REPL`.

**Interpretation**

- The UI is a projection of query events plus local interaction state, not the model runtime itself.

### L6-03 Stream-to-UI mapping

**Fact, High**

`handleMessageFromStream()` maps:

- request start to "requesting";
- text deltas to streaming text;
- thinking blocks to thinking state;
- tool-use starts/input deltas to streaming tool placeholders;
- message stop to tool-use mode;
- complete messages to the main message array.

`Messages` normalizes and groups tool use/results and renders tool-specific components.

Sources:

- `src/utils/messages.ts`, symbol `handleMessageFromStream`.
- `src/components/Messages.tsx`.
- `src/components/Message.tsx`.

### L6-04 Tool result rendering

**Fact, High**

Tools can provide:

- a compact invocation description;
- custom progress rendering;
- custom rejected/error rendering;
- custom result rendering;
- grouped rendering for parallel calls;
- activity summaries for spinners and background agent progress.

The UI layer chooses these through `Tool.render*` methods rather than hard-coding every tool.

Source: `src/Tool.ts`, rendering-related optional methods.

### L6-05 Permission UI

**Fact, High**

`PermissionRequest.tsx` dispatches to tool-specific permission components, with a fallback generic prompt. The permission queue is a first-class modal/overlay in the REPL.

Source: `src/components/permissions/PermissionRequest.tsx`, symbol `permissionComponentForTool`.

**Interpretation**

- Permission quality is partly tool-specific presentation over a shared decision engine.

### L6-06 Cancellation UI

**Fact, High**

- Escape/Ctrl+C handling is centralized in `CancelRequestHandler`.
- Active query abort takes priority over queue operations.
- In teammate view, Ctrl+C can stop agents and return to the main thread.
- A separate two-press chord can kill all background agents.

Source: `src/hooks/useCancelRequest.ts`, symbol `CancelRequestHandler`.

### L6-07 Headless UX and output

**Fact, High**

- `print.ts` supports text, `json`, and `stream-json` output modes.
- `StructuredIO` provides NDJSON streams, control requests/responses, permission prompts, hook callbacks, elicitation, and MCP transport.
- Background agents can hold back the final result while still streaming task progress.
- Exit code derives from the final result error state.

Source: `src/cli/print.ts`, symbol `runHeadless`; `src/cli/structuredIO.ts`.

## L7: Extensions and Integration

### L7-01 Commands and skills

**Fact, High**

- Commands are a union of local, local-JSX, and prompt-expanding commands.
- `getCommands()` merges bundled skills, built-in plugin skills, filesystem skills, workflows, plugin commands, plugin skills, and built-in commands.
- Filesystem skills use `skill-name/SKILL.md`; frontmatter controls tool restrictions, model, effort, visibility, model invocation, execution context, hooks, paths, and shell.
- `SkillTool` validates, authorizes, expands, and can execute a prompt skill inline or in a forked agent.
- MCP-provided skills are supported when enabled and are deliberately not treated as trusted local shell-expanding skills.

Sources:

- `src/commands.ts`, symbols `loadAllCommands`, `getCommands`, `getSkillToolCommands`.
- `src/skills/loadSkillsDir.ts`.
- `src/tools/SkillTool/SkillTool.ts`.

**Interpretation**

- The command and skill systems converge on one prompt-command abstraction.

**Unresolved**

- Exact merge precedence when names collide across sources.

### L7-02 Hooks

**Fact, High**

Hook events include session, prompt, tool, permission, compaction, agent/team, elicitation, settings, worktree, environment, and file-change lifecycle points.

Hook implementations can be:

- shell command;
- prompt/LLM;
- callback/function;
- HTTP;
- agent.

The hook runtime supports matching, deduplication, timeouts, async background responses, blocking errors, updated input, permission decisions, additional context, and environment/watch-path updates.

Sources:

- `src/entrypoints/sdk/coreSchemas.ts`, hook event schemas.
- `src/utils/hooks.ts`, symbols `executeHooks`, `executePreToolHooks`, `executePostToolHooks`, `executeStopHooks`.
- `src/utils/hooks/ssrfGuard.ts`.

**Interpretation**

- Hooks are a policy and automation layer that can modify several runtime boundaries, but not every event permits blocking.

**Unresolved**

- Exact trust/source permissions for each hook type and build.

### L7-03 MCP

**Fact, High**

- MCP configuration scopes include project, user, local, enterprise, dynamic, and claude.ai-managed sources.
- Supported transports include stdio, SSE, streamable HTTP, WebSocket, SDK/in-process, and IDE-specific transport variants.
- The client connects, lists tools/resources/prompts, normalizes names, handles OAuth/token refresh, elicitation, reconnect state, policy allow/deny, source deduplication, and large output.
- MCP tools are converted into `Tool` instances and merged into the normal tool pool.

Sources:

- `src/services/mcp/config.ts`.
- `src/services/mcp/client.ts`.
- `src/services/mcp/types.ts`.
- `src/tools/MCPTool/MCPTool.ts`.

**Interpretation**

- MCP is not a parallel execution runtime; it adapts remote/local server capabilities into the same tool contract.

**Unresolved**

- Full transport/authentication compatibility and server-specific edge cases.

### L7-04 Plugins and marketplaces

**Fact, High**

- Plugin discovery supports marketplace-managed plugins and session-only inline plugins.
- Loaded plugins can contribute commands, skills, agents, hooks, MCP servers, and other metadata.
- The loader validates manifests, resolves paths, caches versions, enforces source policy/blocklists, verifies dependencies, and handles enabled/disabled state.
- Plugin hooks are registered into the same hook runtime and use plugin root/name/id context.
- Plugin commands can execute embedded shell steps unless policy/gating prevents them.

Sources:

- `src/utils/plugins/pluginLoader.ts`.
- `src/utils/plugins/loadPluginCommands.ts`.
- `src/utils/plugins/loadPluginHooks.ts`.
- `src/utils/plugins/dependencyResolver.ts`.

**Interpretation**

- Plugins are a packaging/distribution layer over commands, skills, agents, hooks, and MCP.

**Unresolved**

- Supply-chain guarantees and exact marketplace/cache behavior without the original tests and release history.

### L7-05 SDK and control protocol

**Fact, High**

The restored SDK surface defines:

- `query()` and one-shot/session helpers;
- session listing/read/rename/tag/fork;
- MCP SDK server/tool helpers;
- control requests for initialization, interrupts, permissions, model/thinking changes, MCP status/configure/reconnect/toggle, context usage, rewind, flags/settings, stop-task, hooks, elicitation, and reload-plugins;
- streamed SDK message/result/status/task/hook/progress event schemas.

Sources:

- `src/entrypoints/agentSdkTypes.ts`.
- `src/entrypoints/sdk/controlSchemas.ts`.
- `src/entrypoints/sdk/coreSchemas.ts`.
- `src/entrypoints/sdk/controlTypes.ts`.
- `src/entrypoints/sdk/runtimeTypes.ts`.

**Evidence strength: Medium**

- Public functions in the restored `agentSdkTypes.ts` are stubs.
- `runtimeTypes.ts` replaces many rich types with `Record<string, unknown>`.
- The richer Zod schemas and headless control handling still establish the intended runtime protocol.

**Unresolved**

- Exact public SDK implementation and compatibility with generated package types.

## L8: Advanced Runtime and Operations

The L8 facts below describe the current source-defined mechanisms. They do not establish that every task type, control path, or telemetry mode is enabled or stable in a shipped build.

### L8-01 Background task model

**Fact, High**

Task types are:

- local shell;
- local agent;
- remote agent;
- in-process teammate;
- local workflow;
- monitor MCP;
- dream.

Tasks share status `pending | running | completed | failed | killed`, output file, output offset, notification state, timing, and optional tool-use association.

Sources:

- `src/Task.ts`, types `TaskType`, `TaskStatus`, `TaskStateBase`.
- `src/tasks/types.ts`, symbol `isBackgroundTask`.

### L8-02 Local shell tasks

**Fact, High**

- Foreground commands can be registered before backgrounding.
- Explicit or automatic background mode transitions the process to a background task.
- Output is written to a per-task file through `TaskOutput`.
- Completion creates a queued task notification with ID, output path, status, and summary.
- A stall watchdog notices output that looks like an interactive prompt.
- A 5 GB output cap protects disk usage.
- Kill paths use the shell command's process-tree termination.
- Agent-owned shell tasks are killed when the agent exits.

Sources:

- `src/tasks/LocalShellTask/LocalShellTask.tsx`.
- `src/tasks/LocalShellTask/killShellTasks.ts`.
- `src/utils/task/diskOutput.ts`.
- `src/utils/ShellCommand.ts`.

**Interpretation**

- Background execution preserves the same process/output objects but changes task ownership, notification, and UI projection.

### L8-03 Local agent and teammate tasks

**Fact, High**

- Local agents carry agent ID, prompt, selected definition, model, abort controller, progress, messages, pending messages, background/retain/disk-load state, and result/error.
- Progress tracks tool count, token usage, and recent activities.
- Completion emits a task notification containing result, usage, worktree metadata, and output path.
- Kill aborts the controller and evicts output.
- Teammate tasks extend the model to persistent in-process organizations.

Sources:

- `src/tasks/LocalAgentTask/LocalAgentTask.tsx`.
- `src/tasks/InProcessTeammateTask/*`.
- `src/tools/AgentTool/*`.

**Evidence strength for team/swarm features: Medium** because they are conditional and broader than the P0 runtime evidence used here.

### L8-04 Task stop control

**Fact, High**

- `stopTask()` validates existence and running state.
- It dispatches to the type-specific task implementation.
- Local shell stop suppresses duplicate exit notifications and emits an SDK termination event.
- Other task types mark notification state according to their own semantics.

Source: `src/tasks/stopTask.ts`, symbol `stopTask`.

### L8-05 Session operations

**Fact, High**

The system provides:

- list sessions with head/tail/stat metadata;
- load a full conversation;
- resume/continue;
- fork with UUID remapping;
- rename/tag;
- delete/metadata maintenance through session files;
- remote hydration and CCR internal-event hydration;
- subagent sidechain transcripts and metadata.

Sources:

- `src/utils/listSessionsImpl.ts`, symbol `listSessionsImpl`.
- `src/utils/sessionStorage.ts`, multiple session APIs.
- `src/utils/sessionRestore.ts`.

### L8-06 Telemetry and analytics

**Fact, High**

- Application analytics is routed through an attachable sink with an early-event queue.
- General metadata uses type markers to force review of string values, and PII-tagged fields are stripped before general sinks.
- OpenTelemetry supports console/OTLP/Prometheus and separate metrics/logs/traces exporters.
- Telemetry initialization can wait for trust/remote settings.

**Fact, Medium**

- Enhanced tracing creates interaction, LLM request, tool, hook, and permission-wait spans when its feature and exporter configuration are enabled.

Sources:

- `src/services/analytics/index.ts`.
- `src/services/analytics/sink.ts`.
- `src/utils/telemetry/instrumentation.ts`.
- `src/utils/telemetry/sessionTracing.ts`.

**Interpretation**

- Observability is a first-class subsystem, not incidental logging.

**Unresolved**

- Exact retention, sampling, endpoint, and enterprise configuration behavior.

### L8-07 Settings, policy, and migrations

**Fact, High**

- Settings are merged from multiple sources and include command, plugin, MCP, permissions, sandbox, model, telemetry, and enterprise policy settings.
- Managed policy can constrain permission rules, MCP servers, hooks, plugins, telemetry, and sandbox settings.
- Startup runs migration functions for changed model aliases, permission prompts, MCP approval location, auto-update preferences, and other config transitions.

Sources:

- `src/utils/settings/settings.ts`.
- `src/utils/settings/constants.ts`.
- `src/migrations/*.ts`.

### L8-08 Updater and release operations

**Fact, High**

- `update()` detects native, package-manager, local npm, global npm, or development installation.
- Native updates use a lock to avoid concurrent updates.
- Package-manager installations are instructed to use the package manager.
- npm-based installation selects local/global path based on diagnostic state.
- Update commands regenerate shell completion where applicable.

Source: `src/cli/update.ts`, symbol `update`.

**Unresolved**

- Actual release integrity/signature checks and installer security are not established by this mirror.

## Consolidated Security Boundary

```text
model tool request
  -> input schema validation
  -> PreToolUse hooks
  -> rule-based permission engine
  -> tool-specific policy
  -> optional user/SDK/bridge permission race
  -> tool execution
       -> application path checks
       -> optional OS/container sandbox
  -> result sanitization/persistence
  -> PostToolUse hooks
  -> transcript
```

Security controls are intentionally redundant. A failure in one layer does not imply that the surface is unprotected, and a success in one layer does not replace the others.

## Extension Boundary

```text
commands / skills
hooks
MCP tools/resources/prompts
plugins
SDK control protocol
  -> common command/tool/hook registries
  -> shared query and permission runtime
```

## Mirror Limitations

- No tests, CI, release artifacts, complete lockfile, or license.
- `node_modules` is absent, so build, typecheck, and runtime execution cannot be relied on from this mirror.
- The deleted shim/vendor sources prevent full native-integration analysis.
- `@anthropic-ai/sandbox-runtime` is absent, so enforcement claims are limited to adapter behavior.
- Public SDK functions and several runtime types are stubs/placeholders in this mirror.
- Many L5-L8 capabilities are internal, experimental, platform-specific, or feature-gated and should not be treated as stable product behavior from source presence alone.
