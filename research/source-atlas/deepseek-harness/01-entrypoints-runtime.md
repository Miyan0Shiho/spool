# DeepSeek Harness L0-L2: Entrypoints and Runtime

> Pinned revision: `c291e7961a515f6d7af9304e7fd1d257929aef26`
>
> Package version: `0.1.5-rc.2`
>
> Source root: `.references/deepseek-harness`
>
> Scope: L0 source/package boundaries, L1 boot/entry assembly, L2 model/turn/step runtime
>
> Method: repository inspection plus focused test and module evidence. No source files were modified.

This document records the shipped control flow, not a proposed spool architecture. Source paths are relative to the spool workspace and therefore begin with `.references/deepseek-harness/`.

## L0: Source and package boundary

### Facts

- `F-L0-01`: The root workspace package is private, ESM, licensed MIT, and pinned at package version `0.1.5-rc.2`. The workspace definition includes `packages/*/*`, `apps/*`, `native/system`, `benchmarks`, `website`, and `python/sdk-runtime` (`.references/deepseek-harness/package.json:2-17`, `.references/deepseek-harness/pnpm-workspace.yaml:1-20`).
- `F-L0-02`: The product source is split into capability-family packages rather than one monolithic runtime package. The package map assigns core agent/runtime concerns to `packages/core`, model access to `packages/llm`, persistence/projection to `packages/session*`, interaction and policy to `packages/interaction`, process confinement to `packages/sandbox`, and product surfaces to `apps/*` plus bundle packages (`.references/deepseek-harness/packages/README.md:25-49`).
- `F-L0-03`: The CLI package owns the public `dsh` binary. Its package manifest maps `dsh` to `lib/bin.js` and declares the web, headless, SDK, ACP, and minimal-SDK bundles as dependencies (`.references/deepseek-harness/apps/cli/package.json:7-20`, `.references/deepseek-harness/apps/cli/package.json:35-101`).
- `F-L0-04`: A running product is assembled from patch layers over an empty Loader entry list. A profile is a directory containing `package.json` and `cordis.patch.yml`; a bundle declares its patch through `dsh.bundle.patch` (`.references/deepseek-harness/packages/boot/app-boot/src/profile.ts:1-22`, `.references/deepseek-harness/packages/bundle/headless/package.json:43-47`).

### Interpretation

- `I-L0-01`: L0 is a package-composition system. Code ownership and runtime activation are related but not identical: a package can exist in the workspace without being mounted by a profile.
- `I-L0-02`: The headless path is a useful minimal production sample because it reuses `dsh-base` while omitting the HTTP/server/browser layers.

## L1: CLI, profile, bundle, and boot

### CLI dispatch

- `F-L1-01`: `runCli()` calls `parseDshArgs()`, switches on the invocation mode, dynamically loads the selected mode implementation, and passes the launcher environment snapshot to `runProfile()` (`.references/deepseek-harness/apps/cli/src/bin.ts:28-60`).
- `F-L1-02`: `parseDshArgs()` owns only launcher flags; the first token it does not consume begins the app's private arguments. `web` is a command alias for the `web` profile, while `plugin` forwards its tail to pnpm (`.references/deepseek-harness/apps/cli/src/args.ts:126-210`).
- `F-L1-03`: The shipped headless profile template is an ordered two-bundle stack: `@deepseek-ai/dsh-base` followed by `@deepseek-ai/dsh-headless`, with `patchReload: startup` (`.references/deepseek-harness/packages/boot/app-boot/src/profile.ts:104-126`).

### Profile and patch composition

- `F-L1-04`: `prepareProfile()` loads the profile and rewrites its root `cordis.yml` to an empty entry array before boot. The tree is composed exclusively through patch layers (`.references/deepseek-harness/apps/cli/src/profile-boot.ts:172-192`).
- `F-L1-05`: The effective patch application order is bundle patches in profile order, the profile's own patches, the home-level patch, command-line `--patch` overlays, then the telemetry opt-out patch (`allPatches()` and `composeProfile()` at `.references/deepseek-harness/apps/cli/src/profile-boot.ts:205-244`).
- `F-L1-06`: `runProfile()` installs the environment proxy before mount, creates the shutdown controller and signal handlers, calls `boot(NAME, rootConfig, patches, hostSetup)`, and provides the immutable launch environment plus `cmdlineArgs` to the tree before entries mount (`.references/deepseek-harness/apps/cli/src/profile-boot.ts:282-348`).
- `F-L1-07`: `boot()` creates the root Cordis Context, mounts Loader/Include/Group, applies the composed patch list to the boot Include, frames and applies the root config, waits for Loader settlement and node readiness, then returns the live Context (`.references/deepseek-harness/packages/boot/app-boot/src/index.ts:516-558`, `.references/deepseek-harness/packages/boot/app-boot/src/index.ts:787-834`).
- `F-L1-08`: Live-reload profiles install a config watcher only after boot; startup-frozen profiles do not. The launcher commits readiness only while the root fiber is active and a Loader exists; otherwise an application exit or signal suppresses readiness (`.references/deepseek-harness/apps/cli/src/profile-boot.ts:349-391`).

### Base bundle rows relevant to the runtime

- `F-L1-09`: `dsh-base` is a single insert over the empty root. It mounts the LLM service, session store, session persistence, agent registry, agent loop, tools, system prompt, checkpoint policy, compaction, jobs, approval, permission presets, sandbox service/policy, and their model-facing consumers (`.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:15-47`, `.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:67-89`, `.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:110-140`, `.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:199-256`, `.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:317-399`).
- `F-L1-10`: The base defaults a new agent route to provider `deepseek-official`, model `deepseek-flash`; session state is written through the JSONL persistence row rooted at the harness-home `sessions` directory (`.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:73-79`, `.references/deepseek-harness/packages/bundle/base/cordis.patch.yml:110-114`).

### Headless bundle and task admission

- `F-L1-11`: The headless bundle overrides the base prompt/persona values, keeps process-wide tool-presentation mode configurable, and inserts the worker-thread code runtime, a startup provider, and the headless runner (`.references/deepseek-harness/packages/bundle/headless/cordis.patch.yml:1-31`).
- `F-L1-12`: `headless-startup` parses the app's positional task with Commander, joins tokenized arguments with spaces, rejects an empty or whitespace-only task, and publishes the task as the `headlessStartup` service. The runner's config delegates to `ctx.headlessStartup.task` (`.references/deepseek-harness/packages/bundle/headless/src/startup.ts:31-57`, `.references/deepseek-harness/packages/bundle/headless/cordis.patch.yml:23-31`).
- `F-L1-13`: The runner waits for the Loader to settle before creating an Agent, so agent-scoped tools and adapters are not created against a half-composed tree (`.references/deepseek-harness/packages/bundle/headless/src/index.ts:170-179`).
- `F-L1-14`: The headless one-shot creates a random session id, records `cwd: process.cwd()` in session metadata, selects the current configured default model, optionally installs a model-selection state, waits for initial idleness, queues one user follow-up, waits for idleness, flushes the session, summarizes the owned log interval, writes the final assistant text to stdout, and maps the terminal turn reason to an exit code (`.references/deepseek-harness/packages/bundle/headless/src/index.ts:180-213`).

### Interpretation

- `I-L1-01`: The launcher owns process lifecycle and configuration composition; the mounted application owns semantics. Headless does not implement a separate agent loop.
- `I-L1-02`: `profile -> bundles -> patches -> Loader entries -> services` is the main L1 assembly chain.

## L2: Agent, prompt, model, turn, step, stream, and stop

### Public agent handle and inbox

- `F-L2-01`: `dsh-agent` defines the public live `Agent` surface and registry. The runtime face exposes `session`, `inbox`, `status`, `ctx`, `cancel()`, `whenIdle()`, `runMaintenance()`, `send()`, `followup()`, `steer()`, and `inject()` (`.references/deepseek-harness/packages/core/agent/src/runtime-types.ts:163-242`).
- `F-L2-02`: Input is durable through inbox splice events. `followup()` targets `next-turn`; `steer()` and `inject()` target `next-step`; waking delivery wakes the loop, while injected context waits for a later admitted step (`.references/deepseek-harness/packages/core/agent/src/runtime-types.ts:204-241`).
- `F-L2-03`: Agent lifecycle is `idle | running`. A waking delivery reserves cancellation and enters `running`; `idle` means no driver or maintenance task remains (`.references/deepseek-harness/packages/core/agent/src/runtime-types.ts:102-109`, `.references/deepseek-harness/packages/core/agent/src/runtime-types.ts:268-277`).

### Turn and step state machine

- `F-L2-04`: A step is one model request plus any tools it requests. A turn opens before the first input claim and closes when nothing remains owed (`.references/deepseek-harness/docs/architecture.md:80-102`).
- `F-L2-05`: `ReactLoopAgent.turn()` appends `turn/start`, claims the first `next-turn` batch, calls `preStep()`, appends `step/start`, runs `step()`, appends `step/end`, optionally invokes `agent/turn-stopping`, and appends exactly one terminal `turn/end` reason in a `finally` block (`.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:268-343`).
- `F-L2-06`: `preStep()` claims input, assembles the system prompt and tool schemas, projects runtime context, dispatches the `agent/pre-step` waterfall, and returns either `reject` or an `enter` decision. A rejected or empty initial step closes the turn without a model call (`.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:240-259`, `.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:286-303`).
- `F-L2-07`: The step loop prepares and binds the model route, reconciles/renders the system prompt, appends entered user messages only on the first attempt, logs `request/header` and `request/context` as needed, derives frozen model messages, starts the Assistant live stream, and turns a terminal `finish` into either retry or a durable settlement (`.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:352-617`).
- `F-L2-08`: No tool calls means the step returns `{ kind: 'completed' }`. Tool calls are passed to `executeToolCalls()`; a result marked `concludesTurn` completes the step, otherwise the loop remains eligible for another step (`.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:466-492`).
- `F-L2-09`: Turn-end reasons are merge-extensible and include `completed`, `aborted`, `blocked`, `error`, `max-tokens`, and crash-only `interrupted` (`.references/deepseek-harness/packages/core/session/src/types.ts:197-224`).

### Prompt assembly and admission

- `F-L2-10`: `SystemPrompt.assemble()` merges global and scoped prompt layers, resolves sections/context/tools/variables, runs the `system-prompt/assemble` waterfall, and orders sections by explicit order then name (`.references/deepseek-harness/packages/core/system-prompt/src/index.ts:542-627`).
- `F-L2-11`: `renderPrompt()` interpolates strict variables, drops empty sections, and joins surviving sections with blank lines (`.references/deepseek-harness/packages/core/system-prompt/src/index.ts:265-278`).
- `F-L2-12`: The loop emits runtime context as ordered sourced user-role snapshots. `agent/pre-step` receives the claimed messages and may rewrite or reject them; accepted messages are committed after route preparation (`.references/deepseek-harness/docs/architecture.md:107-111`, `.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:240-259`).

### Model request and streaming

- `F-L2-13`: `prepareRequest()` dispatches the `agent/request` waterfall, requires a provider/model pair, and calls `ctx.llm.prepareCall()` to bind one adapter generation, resolved config, retry policy, model metadata, and stream entry point before prompt/user admission (`.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:500-549`).
- `F-L2-14`: `LlmRuntime.prepareCall()` resolves the adapter registration, calls the adapter's `prepareCall()`, normalizes model metadata, materializes defaults, deep-freezes the config/context, and returns a one-shot `stream()` that cannot be dispatched twice (`.references/deepseek-harness/packages/llm/llm/src/index.ts:908-960`).
- `F-L2-15`: The LLM stream boundary is a `llm/stream` waterfall around adapter dispatch. Adapter selection, dispatch, iterator construction, and iteration failures become one terminal `finish` chunk of kind `error` or `aborted`; middleware and consumer failures remain thrown (`.references/deepseek-harness/packages/llm/llm/src/index.ts:1006-1120`).
- `F-L2-16`: `BlockAssembler.push()` incrementally consumes block-start, text/reasoning/tool-call deltas, block-end, usage, and finish chunks. `blocks()` drops tool calls on a `max-tokens` finish through its shared `assembled()` decision because they cannot be executed safely (`.references/deepseek-harness/packages/llm/llm/src/assembler.ts:38-95`, `.references/deepseek-harness/packages/llm/llm/src/assembler.ts:130-159`).
- `F-L2-17`: Each model attempt emits live `agent/assistant-stream` frames, but live chunks are transient. The loop first commits `assistant/message` for a successful/interrupted visible settlement or `assistant/attempt` for a settled attempt with no model-visible message, then emits the terminal stream frame (`.references/deepseek-harness/packages/core/agent/src/runtime-types.ts:127-161`, `.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:380-483`).

### Stop, retry, and cancellation

- `F-L2-18`: A terminal stream failure is passed to the `agent/request-error` waterfall. A listener may return `{ kind: 'retry' }`; otherwise the error closes the step/turn. Retries reuse the same rendered assembly and do not reread `agent/pre-step` or reappend the entered user batch (`.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:240-259`, `.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:352-464`, `.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:500-549`).
- `F-L2-19`: `Agent.cancel()` aborts the active activity and, by default, clears queued work. `keepInbox: true` preserves queued work. Cancellation is cooperative and the first cause owns the active operation (`.references/deepseek-harness/packages/core/agent/src/runtime-types.ts:176-183`).
- `F-L2-20`: If cancellation interrupts a started stream, the loop preserves non-whitespace text/reasoning delivered before abort as an `assistant/message` with `interrupted: true`; if nothing visible was delivered, it commits `assistant/attempt` (`.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:399-439`).
- `F-L2-21`: At a turn error, an aborted signal wins over generic error classification and the turn ends `aborted`. Otherwise the turn ends `error` with either an `LlmFailure` or a flattened `UNKNOWN` failure (`.references/deepseek-harness/packages/core/agent-loop/src/agent.ts:322-340`).

### Session event contract used by the runtime

- `F-L2-22`: `SessionEventMap` defines `turn/start`, `turn/end`, `step/start`, `step/end`, `system/message`, `user/message`, `assistant/message`, `assistant/attempt`, `tool/call`, `tool/result`, `request/header`, and `request/context` (`.references/deepseek-harness/packages/core/session/src/types.ts:263-400`).
- `F-L2-23`: Only `system/message`, `user/message`, `assistant/message`, and `tool/result` are surface events. The surface can append or replace a range; replacements must cite every shadowed surface node (`.references/deepseek-harness/packages/core/session/src/types.ts:406-450`).
- `F-L2-24`: `Session.deriveMessages()` folds the surface into the model-visible `Message[]`; raw boundary, header, attempt, and stream-only facts do not become messages (`.references/deepseek-harness/packages/core/session/src/index.ts:816-855`).

## Test and runtime evidence

- `T-L2-01`: `packages/bundle/headless/tests/headless.spec.ts` covers final-text aggregation, async append races, reasoning streaming, completion/error exit mapping, flush-before-exit, and direct creation failure (`.references/deepseek-harness/packages/bundle/headless/tests/headless.spec.ts:138-400`).
- `T-L2-02`: `packages/bundle/headless/tests/startup.spec.ts` mounts the real startup provider through Loader and verifies positional joining, empty-task rejection, help behavior, and injected runner config (`.references/deepseek-harness/packages/bundle/headless/tests/startup.spec.ts:88-111`).
- `T-L2-03`: `packages/core/agent-loop/tests/request-error.spec.ts` covers middleware failures not entering request recovery, retry inside the open step, cancellation winning over retry, and recovery-listener failure (`.references/deepseek-harness/packages/core/agent-loop/tests/request-error.spec.ts:32-146`).
- `T-L2-04`: `packages/core/agent-loop/tests/cancel.spec.ts` covers idle cancellation, keep-inbox behavior, cancellation windows, mid-stream prefix settlement, reasoning-only cancellation, retry attempt retention, and disposal (`.references/deepseek-harness/packages/core/agent-loop/tests/cancel.spec.ts:59-1000`).
- `T-L2-05`: `packages/core/agent-loop/tests/request-freeze.spec.ts` verifies restored message identity adoption, nested freeze behavior, retry after failed freezing, and a live mutable cancellation signal (`.references/deepseek-harness/packages/core/agent-loop/tests/request-freeze.spec.ts:45-232`).
- `T-L2-06`: `packages/core/agent-loop/tests/tool-order.spec.ts` verifies canonical tool order in the logged/dispatched request and no-step closure for an unknown configured tool (`.references/deepseek-harness/packages/core/agent-loop/tests/tool-order.spec.ts:69-110`).

No local Vitest run was possible in this workspace because the pinned repository has no installed `node_modules`/Vitest binary. Test references above are source-observed coverage, not a claim that the suite was executed during this batch.

## Interpretation

- `I-L2-01`: The runtime separates durable facts from live control. Session events are replayable conversation facts; `agent/*` events are live coordination signals.
- `I-L2-02`: The model request is reconstructed from the live session surface plus the latest `request/header`. The rendered prompt travels as a `system/message`, not as an untracked request field.
- `I-L2-03`: Cancellation is not implemented by killing a shared loop. It aborts the active attempt signal, drains or synthesizes tool settlements as needed, and converges back to idle.

## Unresolved

- `U-L2-01`: No real provider call was executed in this environment, so actual DeepSeek wire framing, retry timing, and provider-specific finish behavior remain source-only observations.
- `U-L2-02`: The exact emitted order of all `agent/*` observer notifications relative to session-event observers is asserted across many focused tests but was not exercised as one live trace here.
- `U-L2-03`: Headless output behavior is known from runner source/tests; no clean profile launch was run because dependencies and build artifacts are absent.
- `U-L2-04`: Bundle/profile behavior under a custom user patch layer remains outside this L0-L2 evidence set.
