# DeepSeek Harness L5-L8: Security, UI, Extensions, and Operations

> Pinned revision: `c291e7961a515f6d7af9304e7fd1d257929aef26`
>
> Package version: `0.1.5-rc.2`
>
> Source root: `.references/deepseek-harness`
>
> Scope: L5 security/permissions, L6 interaction/UI, L7 extensions/integrations, L8 advanced and operational systems
>
> Test status: test files below are source-observed coverage. No Vitest suite
> was executed because repository dependencies are not installed.

## L5: Security, permission, and sandbox

### Approval is a fail-closed seam

- `F-L5-01`: `ApprovalService` has two session policies: `ask` delegates to composed answerers and fails closed to `unavailable` when none answers; `never` deterministically rejects before any answerer dispatch (`.references/deepseek-harness/packages/interaction/user-approval/src/index.ts:47-68`, `.references/deepseek-harness/packages/interaction/user-approval/README.md:30-48`).
- `F-L5-02`: An approval request must be inside an open turn. `request()` appends a log-only `approval/asked` and `approval/decided` pair; a missing or throwing answerer, malformed return, or missing channel becomes `unavailable`, not silent permission (`.references/deepseek-harness/packages/interaction/user-approval/src/index.ts:70-98`, `.references/deepseek-harness/packages/interaction/user-approval/README.md:76-87`).
- `F-L5-03`: Aborting an approval settles it `cancelled` and discards a late answer. The approval grant is one-shot; this package has no durable “allow always” store (`.references/deepseek-harness/packages/interaction/user-approval/README.md:52-56`, `.references/deepseek-harness/packages/interaction/user-approval/README.md:152-157`).
- `F-L5-04`: The current policy is contributed to runtime context as a sourced snapshot and a live policy switch appends a user-role change notice. The model learns the policy; the human answerer UI and audit events remain outside model history (`.references/deepseek-harness/packages/interaction/user-approval/src/index.ts:151-188`).

### Permission presets combine sandbox and approval

- `F-L5-05`: `PermissionPresetService` stores named bundles of one sandbox mode and one approval policy. Shipped defaults include `workspace-write + ask` and `danger-full-access + never` (`.references/deepseek-harness/packages/interaction/permission-presets/src/index.ts:58-68`, `.references/deepseek-harness/packages/interaction/permission-presets/src/index.ts:143-182`).
- `F-L5-06`: A preset switch records log-only `permission/preset` intent and writes the canonical `sandbox/mode` and `approval/policy` events. The read model folds the last event for each knob, so the same policy survives replay (`.references/deepseek-harness/packages/interaction/permission-presets/src/index.ts:46-55`, `.references/deepseek-harness/packages/interaction/permission-presets/src/index.ts:119-135`).

### Sandbox modes and fail-closed behavior

- `F-L5-07`: `SandboxMode` has exactly `read-only`, `workspace-write`, and `danger-full-access`; the first two are confined modes and the third bypasses confinement. Policy is carried per call rather than fixed on the provider (`.references/deepseek-harness/packages/sandbox/sandbox/src/index.ts:23-72`, `.references/deepseek-harness/packages/sandbox/sandbox/src/index.ts:152-176`).
- `F-L5-08`: `SandboxProvider.confine()` must return enforcing argv or throw `SandboxUnavailableError` with code `SANDBOX_UNAVAILABLE`. Silent unconfined passthrough is forbidden (`.references/deepseek-harness/packages/sandbox/sandbox/src/index.ts:118-175`).
- `F-L5-09`: The local provider selects bwrap then Landlock on Linux, Seatbelt on macOS, and the ACL restricted-token runner on Windows. Windows reports `partial` enforcement because the restricted token retains `Everyone` and NTFS hard links can alias one file object across paths (`.references/deepseek-harness/packages/sandbox/sandbox-local/src/index.ts:150-187`).
- `F-L5-10`: Enforcement completeness is explicit per wrap: `full` or `partial`; denial and runner-failure signatures are return facts on `ConfinedArgv` (`.references/deepseek-harness/packages/sandbox/sandbox/src/index.ts:54-115`, `.references/deepseek-harness/packages/sandbox/sandbox-local/src/index.ts:200-240`).
- `F-L5-11`: The sandbox vocabulary covers file effects only. Network, process visibility, device, syscall, and credential policy are outside this seam (`.references/deepseek-harness/packages/sandbox/sandbox/README.md:160-172`).

### Shared policy and cross-family enforcement

- `F-L5-12`: `SandboxPolicyService.resolve()` precedence is approved explicit mode, then the last durable `sandbox/mode`, then the deployment default. The session's immutable `cwd` becomes the workspace-write root; agentless calls use the configured fallback root (`.references/deepseek-harness/packages/sandbox/sandbox-policy/src/index.ts:154-179`).
- `F-L5-13`: Bash, filesystem, and terminal tools consume the same policy home, preventing different capabilities in one session from resolving different standing modes/roots (`.references/deepseek-harness/packages/sandbox/sandbox-policy/README.md:70-80`).
- `F-L5-14`: `dsh-fs-sandbox` extends the local filesystem implementation and fences only mutations. `read-only` denies mutation; `workspace-write` canonicalizes the target immediately and requires containment under a shared writable root; `danger-full-access` delegates unfenced (`.references/deepseek-harness/packages/fs/fs-sandbox/src/index.ts:69-145`).
- `F-L5-15`: The fs fence is a trusted-code policy check, not a kernel boundary. Its residual resolve-to-syscall TOCTOU is narrowed by recanonicalizing immediately before the write but explicitly accepted (`.references/deepseek-harness/packages/fs/fs-sandbox/src/index.ts:1-25`, `.references/deepseek-harness/packages/fs/fs-sandbox/README.md:116-125`).
- `F-L5-16`: The bash sandbox executor wraps the exact `['bash','-c',command]` argv through `ctx.sandbox.confine()`. A runner failure outranks a possible denial because the command never ran; a denied command is a result fact (`.references/deepseek-harness/packages/shell/bash-sandbox/README.md:76-100`).

### Escalation

- `F-L5-17`: Escalation is strictly wider: `read-only -> workspace-write|danger-full-access`; `workspace-write -> danger-full-access`. A non-widening request is rejected before asking the user (`.references/deepseek-harness/packages/sandbox/sandbox/src/escalation.ts` and `.references/deepseek-harness/packages/sandbox/sandbox/README.md:98-105`).
- `F-L5-18`: Escalation requires the `sandbox_permissions` and `justification` pair, asks through `ctx.approval`, and stamps a strictly wider mode onto exactly the requesting call; any user or model retry is a new call. Rejection, cancellation, missing approval, or malformed arguments are distinct fail-closed outcomes (`.references/deepseek-harness/packages/shell/tool-bash/src/index.ts:202-236`, `.references/deepseek-harness/packages/fs/tool-fs/src/sandbox.ts:76-129`).

### Security tests

- `T-L5-01`: `packages/interaction/user-approval/tests/approval.spec.ts` covers turn enclosure, unavailable fallback, audit pairing, answerer scope, cancellation, policy switching, and unbypassable `never` (`.references/deepseek-harness/packages/interaction/user-approval/tests/approval.spec.ts:46-510`).
- `T-L5-02`: `packages/sandbox/sandbox/tests/escalation.spec.ts` covers ladder validation, pairing, fail-closed approval outcomes, and marker text (`.references/deepseek-harness/packages/sandbox/sandbox/tests/escalation.spec.ts:20-111`).
- `T-L5-03`: `packages/fs/fs-sandbox/tests/fs-sandbox.spec.ts` covers read-only denial, workspace containment, traversal/symlink escape denial, per-call override, and structured error identity (`.references/deepseek-harness/packages/fs/fs-sandbox/tests/fs-sandbox.spec.ts:60-240`).
- `T-L5-04`: `packages/shell/bash-sandbox/tests/sandbox.spec.ts` covers exact argv wrapping, fail-closed provider errors, denial/running-failure classification, per-call modes, and overlapping background facts (`.references/deepseek-harness/packages/shell/bash-sandbox/tests/sandbox.spec.ts:95-668`).

## L6: Interaction and UI

### Web product assembly

- `F-L6-01`: The web profile is `dsh-base + dsh-web-app`, with live patch reload. Headless and SDK/ACP profiles use startup-frozen reload (`.references/deepseek-harness/packages/boot/app-boot/src/profile.ts:104-126`).
- `F-L6-02`: The web patch restates surface-specific base config, then inserts the HTTP server, web runtime, client connection, file upload, RPC gateway, session/workspace/settings controllers, and the browser plugin roster (`.references/deepseek-harness/packages/bundle/web-app/cordis.patch.yml:14-201`).
- `F-L6-03`: The web runtime serves built frontend assets through the webserver fallback, prints an authenticated URL, opens the browser when allowed, samples LAN trust once, contributes web-surface prompt context, and registers the managed web URL for shell commands (`.references/deepseek-harness/packages/bundle/web-app/README.md:72-100`).
- `F-L6-04`: Startup flags are parsed by the web app's own startup provider and fed to the webserver and runtime rows. A source checkout without built frontend assets fails startup rather than falling back to source serving (`.references/deepseek-harness/packages/bundle/web-app/src/startup.ts`, `.references/deepseek-harness/packages/bundle/web-app/README.md:137-149`).

### Host/client transport and live rendering

- `F-L6-05`: The client connection package owns both transport halves: the host gateway and browser fetch/SSE client. The web patch binds it under `/api` with the sampled trusted-host fence (`.references/deepseek-harness/packages/bundle/web-app/cordis.patch.yml:178-188`).
- `F-L6-06`: Session history combines durable `session/event` with live `agent/assistant-stream` frames. The browser can render streaming content, while reconnect/replay uses durable events (`.references/deepseek-harness/packages/api/session-controller/src/history.ts:54-170`, `.references/deepseek-harness/packages/api/session-controller/src/client/transport.ts:58-76`).
- `F-L6-07`: The API session controller subscribes to `agent/status` and `session/event`; its history follower separately accepts durable session events and live `agent/assistant-stream` frames, exposing session state, durable changes, and live frames to the client (`.references/deepseek-harness/packages/api/session-controller/src/index.ts:145-169`, `.references/deepseek-harness/packages/api/session-controller/src/history.ts:54-68`).
- `F-L6-08`: The Chat UI registers keyed renderers for user/steering/context/system prompt/assistant/tool/compaction/retry/error/max-token/turn-tail nodes, and tool calls dispatch through a keyed `tool.call.toolview` registry (`.references/deepseek-harness/packages/client/ui-chat/src/client/chat/register-node-renderers.ts:18-57`, `.references/deepseek-harness/packages/client/ui-tool/src/client/apply.ts:38-46`).
- `F-L6-09`: Approval has a dedicated UI package; the browser answerer returns one of the shared approval outcomes through the host/client service seam (`.references/deepseek-harness/packages/client/ui-approval/src/client/ApprovalPanel.tsx`, `.references/deepseek-harness/packages/client/ui-approval/README.md`).
- `F-L6-10`: The desktop application is a separate Electron shell. It carries the exact dsh runtime in signed application resources and uses private framed pipes rather than opening a web server (`.references/deepseek-harness/docs/architecture.md:49-55`, `.references/deepseek-harness/apps/desktop/README.md:5`).

### UI tests

- `T-L6-01`: `apps/web/tests/*.e2e.ts` contains end-to-end coverage for continuous conversation, streaming/finalization, approval composer, live interactions, queue actions, session details, plan review, tool cards, subagents, workflows, and settings.
- `T-L6-02`: `packages/client/ui-chat/tests/*`, `packages/client/ui-tool/tests/*`, and `packages/client/ui-conversation/tests/*` provide component/store/interaction tests for history, streaming nodes, tool views, and conversation assembly.
- `T-L6-03`: `packages/bundle/web-app/tests/*` covers startup, dist resolution, trusted hosts, and browser-open behavior.

## L7: Extensions and integrations

### Configuration profiles, bundles, and presets

- `F-L7-01`: Profiles and bundles are the first extension layer. Bundle rows are patchable by id; user, home, and `--patch` layers can replace rows or insert new ones (`.references/deepseek-harness/docs/architecture.md:20-57`).
- `F-L7-02`: Agent presets add a per-session layer above the process composition. A session joins a standing preset scope; the preset supplies its tools, prompt sections, and skills. A session cannot switch preset after producing conversation/tool state (`.references/deepseek-harness/packages/preset/agent-presets/README.md:32-86`).
- `F-L7-03`: Preset discovery supports shipped, configured, and user roots. Broken compositions are listed with an actionable reason rather than hidden; preset copies are self-contained filesystem snapshots and are owner-only (`.references/deepseek-harness/packages/preset/agent-presets/README.md:36-86`, `.references/deepseek-harness/packages/preset/agent-presets/README.md:98-138`).

### Hooks, skills, and MCP

- `F-L7-04`: Hook integrations translate existing Claude Code and Codex shell-hook configurations into lifecycle callbacks. They can block prompts/tool calls, add context, or request continuation (`.references/deepseek-harness/packages/hooks/README.md:10-18`).
- `F-L7-05`: Skills are exposed through a provider registry and a model-facing skill tool/catalog. The filesystem provider watches skill roots; project/user locations are deployment-configurable (`.references/deepseek-harness/packages/skill/README.md`, `.references/deepseek-harness/packages/skill/skill-filesystem/README.md`).
- `F-L7-06`: MCP tools are bridged into the native tool registry under stable names `mcp__<serverName>__<rawName>`. The serverName is local configuration; the remote server name is not the public identity. Tool generations swap atomically, and reconnect preserves the last known set during outage (`.references/deepseek-harness/packages/mcp/mcp-client/README.md:72-110`, `.references/deepseek-harness/packages/mcp/mcp-client/README.md:122-135`).
- `F-L7-07`: MCP calls preserve the raw wire name, have per-call timeout/cancellation, support text/content blocks, and can persist supported images through attachment storage. Resources and MCP prompts are not bridged (`.references/deepseek-harness/packages/mcp/mcp-client/README.md:82-86`, `.references/deepseek-harness/packages/mcp/mcp-client/README.md:184-196`).

### Automation protocols and dynamic Cordis

- `F-L7-08`: The SDK server is a stdio JSON-RPC plugin. Clients initialize a route, prompt a session, and receive `session.event`, `session.status`, and subagent notifications. The wire has no per-prompt cancel or per-session close method; `shutdown` is a global server request, while EOF and signal exits belong to the app process (`.references/deepseek-harness/packages/sdk/server/README.md:30-52`, `.references/deepseek-harness/packages/sdk/protocol/README.md:34-52`).
- `F-L7-09`: ACP is an automation-only standard server supporting persistent sessions, model/reasoning selection, MCP attachment, prompt cancellation, permission requests, and session close. It intentionally omits DSH-specific presentation, commands, plans, terminals, and client filesystem operations (`.references/deepseek-harness/packages/acp/acp/README.md:53-76`).
- `F-L7-10`: Dynamic Cordis packages are process-local, session-scoped definitions. Host halves run in a `node:vm` sandbox; browser halves require explicit page approval before loading. Definitions disappear on runtime restart; no repository file or dependency is installed (`.references/deepseek-harness/packages/extensions/cordis-host-runner/README.md:44-84`, `.references/deepseek-harness/packages/extensions/tool-cordis/README.md:41-55`).
- `F-L7-11`: The dynamic-package sandbox is containment for accidental globals, not a security boundary. Its own documentation instructs treating it like bash access (`.references/deepseek-harness/packages/extensions/cordis-host-runner/README.md:52-54`, `.references/deepseek-harness/packages/extensions/tool-cordis/README.md:176-184`).

### Extension tests

- `T-L7-01`: Hook protocol/bridge tests cover codec, matcher, merge, runner, and product-specific bridges.
- `T-L7-02`: MCP tests cover discovery, naming, reconnect, image projection, startup failure, cancellation, and the real Loader path.
- `T-L7-03`: SDK server/client tests cover handshake, prompt admission, notifications, disposal, and built scope-carrier behavior.
- `T-L7-04`: ACP tests cover multiple sessions, updates, permissions, MCP, model control, cancellation, and disposal.
- `T-L7-05`: Dynamic Cordis tests cover sandbox globals, guards, lifecycle, client evaluation, version updates, and browser requests.

## L8: Advanced execution and operations

### Subagents

- `F-L8-01`: `ctx.subagents` is a named-provider registry. Providers can be in-process, ACP, DSH SDK, Codex, or Claude Code. One-shot children return a final result; continuable children keep durable sessions and may accept later messages (`.references/deepseek-harness/packages/subagent/subagent/README.md:28-105`).
- `F-L8-02`: Provider start is publication-based: before publication the provider owns rollback; after publication the caller owns disposal. A run result carries final output, optional structured value, stop reason, and optional safe diagnostic (`.references/deepseek-harness/packages/subagent/subagent/README.md:67-105`).
- `F-L8-03`: Continuable messaging requires exact live adjacency: a sender can target a direct continuable child; a resident child can target its direct parent. Delivery acceptance returns a message id, not the target's future answer (`.references/deepseek-harness/packages/subagent/tool-subagent-control/README.md:47-57`, `.references/deepseek-harness/packages/subagent/tool-subagent-control/README.md:163-173`).
- `F-L8-04`: Children receive a delegation-scope runtime-context statement that says their permission scope was fixed at start and cannot be widened from inside the child (`.references/deepseek-harness/packages/subagent/subagent/README.md:143-161`).

### Background jobs

- `F-L8-05`: `ctx.jobs` is an owner-fenced background-work registry. `jobs-local` stores records in memory and enforces a per-owner active-job cap; a producer can start only while a controller serves that owner (`.references/deepseek-harness/packages/jobs/jobs-local/README.md:34-58`, `.references/deepseek-harness/packages/jobs/jobs-local/src/index.ts:91-183`).
- `F-L8-06`: `job_output`, `job_list`, and `job_kill` are the model-facing controls. Stream reads consume a single cursor; terminal reads/waits suppress redundant completion notices (`.references/deepseek-harness/packages/jobs/tool-jobs/README.md:28-63`, `.references/deepseek-harness/packages/jobs/jobs-local/README.md:72-96`).
- `F-L8-07`: Owner disposal cancels and awaits owned jobs, then removes their snapshots. Service disposal drains all jobs. Jobs do not survive the harness process unless another backend implements a stronger contract (`.references/deepseek-harness/packages/jobs/jobs-local/src/index.ts:416-534`, `.references/deepseek-harness/packages/jobs/jobs-local/README.md:52-58`).

### Workflow and Ralph

- `F-L8-08`: `ctx.workflowEngine.start()` validates the metadata and script before a run exists, then executes a plain-JavaScript orchestration body with top-level await and hooks such as `agent`, `parallel`, `pipeline`, `phase`, and `log` (`.references/deepseek-harness/packages/workflow/workflow/README.md:30-57`).
- `F-L8-09`: The shipped worker-thread engine starts a real `node:worker_threads.Worker`, transports hook requests over a MessagePort, emits paired `workflow/start`, `workflow/agent-start`, `workflow/agent-end`, and `workflow/end` events, and bounds synchronous execution inside the worker (`.references/deepseek-harness/packages/workflow/workflow-worker-thread/src/host.ts:145-160`, `.references/deepseek-harness/packages/workflow/workflow-worker-thread/src/index.ts:172-195`, `.references/deepseek-harness/packages/workflow/workflow-worker-thread/src/runtime.ts:160-175`, `.references/deepseek-harness/packages/workflow/workflow-worker-thread/src/worker.ts:8-14`).
- `F-L8-10`: The workflow tool waits for the whole run, maps non-completed outcomes to errors, and always disposes the run. For a root tool execution, it records a log-only run/member prefix in the parent session; nested dispatches are not recorded (`.references/deepseek-harness/packages/workflow/tool-workflow/README.md:63-82`).
- `F-L8-11`: Ralph is a fixed foreground workflow over fresh children. Each round receives the immutable objective, current round/cap, workspace authority, and previous bounded structured handoff; completion is worker self-declaration, not independent verification (`.references/deepseek-harness/packages/workflow/tool-ralph/README.md:12-47`, `.references/deepseek-harness/packages/workflow/tool-ralph/README.md:59-83`).

### Settings and runtime configuration

- `F-L8-12`: `ctx.settings` resolves schema defaults, a registrant's composition base, then one user section. `get()` returns a deep-frozen snapshot; updates are serialized per namespace and revision-checked (`.references/deepseek-harness/packages/settings/settings/README.md:10-76`, `.references/deepseek-harness/packages/settings/settings/README.md:88-115`).
- `F-L8-13`: `settings-file` stores all namespaces in one YAML/JSON document, watches external edits, preserves YAML comments/anchors for untouched nodes, and performs lock-protected merge writes (`.references/deepseek-harness/packages/settings/settings-file/README.md:10-67`).
- `F-L8-14`: Settings redaction is not a proof boundary. `role('secret')` fields reachable outside the walked object/dict/array containers are not redacted by the current implementation; a fail-closed wire serializer is deferred (`.references/deepseek-harness/packages/settings/settings/README.md:142-159`).

### Telemetry and diagnostics

- `F-L8-15`: The telemetry seam captures every canonical session event in order and passes an outbound copy through `sessionTelemetry/record` redaction listeners. With no listener, data leaves the process unchanged; a throwing listener withholds that record (`.references/deepseek-harness/packages/session/session-telemetry/README.md:34-52`, `.references/deepseek-harness/packages/session/session-telemetry/README.md:64-81`).
- `F-L8-16`: The shipped OTel backend defaults to `FEEDBACK_ONLY`: ordinary activity is not exported. Explicit feedback releases the unhanded canonical prefix; `DISABLED` constructs no transport (`.references/deepseek-harness/packages/session/session-telemetry-otel/README.md:10-37`, `.references/deepseek-harness/packages/session/session-telemetry-otel/README.md:67-73`).
- `F-L8-17`: Telemetry delivery is best effort. The handoff cursor records handed-off, not delivered; no durable outbox or collector-acceptance guarantee exists (`.references/deepseek-harness/packages/session/session-telemetry/README.md:108-117`).
- `F-L8-18`: Runtime diagnostics/invariants are package-owned registrations under `ctx.invariants`. They validate cross-event relations such as turn enclosure, tool pairing, surface metadata, compaction brackets, and approval audit pairs (`.references/deepseek-harness/packages/runtime-diagnostics/invariants/README.md`, `.references/deepseek-harness/packages/core/session/src/invariant.ts`).

### Goal and schedule

- `F-L8-19`: The goal domain persists a same-session objective and lifecycle through session events/projections. A round driver can continue work while the objective remains active, and model-facing goal tools are mounted in `dsh-base` (`.references/deepseek-harness/packages/goal/goal/README.md`, `.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:292-300`).
- `F-L8-20`: Schedule is session-local scheduled follow-up state with its own domain, projection, persistence, runtime, tools, and restart tests. It is not mounted in the default base profile (`.references/deepseek-harness/packages/schedule/schedule/README.md:12-28`, `.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:1-15`).

### Operations tests

- `T-L8-01`: Subagent tests cover assistant-output folding, route inheritance, one-shot publication, continuation, cold resume, adjacency authorization, lifecycle, and child listing.
- `T-L8-02`: Job tests cover controller gating, per-owner capacity, owner isolation, stream/terminal reads, wait/timeout, kill, completion listeners, and owner/service teardown.
- `T-L8-03`: Worker-thread integration/e2e tests cover real child execution, structured output, cancellation, caps, malformed scripts, JSON return validation, and the built worker.
- `T-L8-04`: Settings tests cover layering, concurrency, external edits, comment-preserving YAML writes, symlink-safe atomic replacement, and real Loader composition.
- `T-L8-05`: Telemetry tests cover feedback-only authorization, redaction, record ordering, shutdown bounds, disabled mode, and no capture of ordinary activity.

## Interpretation

- `I-L8-01`: Security is layered rather than centralized: tool intent/approval, monotonic guards, a per-call sandbox policy, a filesystem policy fence, kernel-backed process confinement, and fail-closed error normalization.
- `I-L8-02`: UI is an event projection, not a second runtime. Durable session events own replay; live agent events own streaming presentation.
- `I-L8-03`: Extension points are broad but capability-scoped: profiles, presets, tools, commands, hooks, MCP, SDK/ACP, and dynamic Cordis each expose a different trust and lifecycle boundary.
- `I-L8-04`: Jobs are useful background primitives but process-local. Subagents have durable sessions; workflows are foreground and not resumable. These are materially different durability models.
- `I-L8-05`: Settings and telemetry both have explicit residual risks: settings redaction is incomplete outside proven containers, and telemetry is best-effort with no built-in redaction rules.

## Unresolved

- `U-L8-01`: Platform-specific sandbox e2e behavior (bwrap, Landlock, Seatbelt, Windows ACL) was not run on each target OS.
- `U-L8-02`: Browser/desktop rendering was not exercised against a live built frontend.
- `U-L8-03`: Cross-process continuation, durable jobs, workflow resume, and multi-writer session persistence are not shipped guarantees in the inspected revision.
- `U-L8-04`: Dynamic Cordis is not a security boundary; whether to expose it in any future product surface requires a separate decision.
- `U-L8-05`: Settings secret redaction and telemetry delivery-loss behavior remain operational limitations, not solved invariants.
