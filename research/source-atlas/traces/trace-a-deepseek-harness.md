# Trace A: DeepSeek Harness No-Tool Turn

> Pinned revision: `c291e7961a515f6d7af9304e7fd1d257929aef26`
>
> Package version: `0.1.5-rc.2`
>
> Scope: user input -> prompt assembly -> model request/stream -> turn/step end -> session record -> caller result
>
> Chosen product surface: `dsh --profile headless`
>
> Test status: test coverage below is source-observed; Vitest was not executed.

## Trace definition

This trace assumes one fresh persisted session, one direct user task, one successful model response containing no tool call, and normal process completion. It deliberately excludes tool execution, retry, and compaction; Trace B/C cover those branches.

## End-to-end sequence

| Stage | Source evidence | Durable or live facts |
|---|---|---|
| 1. Headless profile is composed | `packages/boot/app-boot/src/profile.ts:104-126`; `packages/bundle/headless/cordis.patch.yml:18-31` | Loader entries for `dsh-base` then `dsh-headless` |
| 2. App arguments are parsed | `packages/bundle/headless/src/startup.ts:31-57` | `headlessStartup.task` |
| 3. Runner waits for tree settlement | `packages/bundle/headless/src/index.ts:170-179` | No Agent exists before sibling rows settle |
| 4. Runner creates one Agent/session | `packages/bundle/headless/src/index.ts:180-194` | Session header `cwd`; selected provider/model |
| 5. User task is queued | `packages/bundle/headless/src/index.ts:195-202`; `packages/core/agent/src/runtime-types.ts:217-222` | `agent/inbox/inserted`; live wake |
| 6. Driver opens a turn | `packages/core/agent-loop/src/agent.ts:268-289` | `turn/start` |
| 7. Claim and assemble prompt | `packages/core/agent-loop/src/agent.ts:240-259`; `packages/core/system-prompt/src/index.ts:552-627` | Claimed inbox message; prompt sections, runtime contexts, tool schemas |
| 8. `agent/pre-step` admits input | `packages/core/agent/src/runtime-types.ts:318-330` | Enter decision or reject; no durable commit yet |
| 9. Step opens | `packages/core/agent-loop/src/agent.ts:302-307` | `step/start` |
| 10. Route is selected and bound | `packages/core/agent-loop/src/agent.ts:500-549`; `packages/llm/llm/src/index.ts:908-960` | Prepared adapter generation, resolved config, retry policy |
| 11. Prompt/user events are committed | `packages/core/agent-loop/src/agent.ts:358-378`; `packages/core/agent-loop/src/agent.ts:552-597` | `system/message`, `user/message`; optional `request/header`/`request/context` |
| 12. Request is derived and frozen | `packages/core/agent-loop/src/agent.ts:552-617`; `packages/core/session/src/index.ts:816-855` | Frozen `GenerateOptions`; live `AbortSignal` |
| 13. Stream starts | `packages/core/agent-loop/src/agent.ts:379-397`; `packages/llm/llm/src/index.ts:1106-1120` | `agent/assistant-stream(start)`; `llm/stream` dispatch |
| 14. Chunks arrive | `packages/llm/llm/src/assembler.ts:38-95`; `packages/core/agent-loop/src/agent.ts:394-397` | Live chunk frames; incremental message assembly |
| 15. Attempt settles | `packages/core/agent-loop/src/agent.ts:441-483` | `assistant/message` embeds the compact stream and optional usage; then stream end |
| 16. No tool calls -> step completes | `packages/core/agent-loop/src/agent.ts:486-492` | Step result `completed` |
| 17. Step/turn boundaries close | `packages/core/agent-loop/src/agent.ts:311-343` | `step/end`, optional `agent/turn-stopping`, `turn/end { completed }` |
| 18. Caller observes quiescence | `packages/bundle/headless/src/index.ts:202-206` | `whenIdle()` resolves after whole-agent inactivity |
| 19. Session is flushed | `packages/bundle/headless/src/index.ts:206`; `packages/core/session/src/index.ts:1144-1160` | Durable persistence barrier |
| 20. Final output is derived | `packages/bundle/headless/src/index.ts:63-89`, `.research/deepseek-harness/packages/bundle/headless/src/index.ts:207-212` | Last non-empty assistant text and terminal turn reason; stdout and exit code |

## Expected no-tool event order

The exact optional events depend on whether the prompt, route metadata, and context first appear in this step. For a fresh no-tool turn, the core order is:

```text
turn/start
step/start
system/message
user/message
request/header                 (when the request envelope must be recorded)
request/context                (when route metadata is new or changed)
assistant/message
step/end
turn/end { kind: "completed" }
```

`request/header` is written inside the step before dispatch, but its relative point is after accepted system/user admission in the loop. It is log-only. `system/message` and `user/message` are surface events; `assistant/message` is the durable successful settlement.

## Prompt and request construction

- Fact: `agent/pre-step` receives claimed messages, turn/step identity, and the live signal. Its returned decision is authoritative (`.research/deepseek-harness/packages/core/agent/src/runtime-types.ts:318-347`).
- Fact: prompt assembly returns sections, dynamic contexts, tools, and variables. Runtime contexts are projected into sourced user-role snapshots after entered messages (`.research/deepseek-harness/packages/core/agent-loop/src/agent.ts:240-255`, `.research/deepseek-harness/packages/core/system-prompt/src/index.ts:552-627`).
- Fact: user admission occurs only on the first attempt and after route preparation succeeds; cancellation during route preparation commits neither prompt nor users (`.research/deepseek-harness/packages/core/agent-loop/src/agent.ts:358-378`, `.research/deepseek-harness/docs/architecture.md:107-111`).
- Fact: the loop derives messages from the session log and records the request header separately. The built request carries config, derived messages, tools, session id, and the live signal (`.research/deepseek-harness/packages/core/agent-loop/src/agent.ts:552-617`).

## Successful stream settlement

- Fact: `agent/assistant-stream` publishes a process-local `start`, transient ordered `chunk` frames, and exactly one terminal `end` frame (`.research/deepseek-harness/packages/core/agent/src/runtime-types.ts:127-161`, `.research/deepseek-harness/packages/core/agent-loop/src/agent.ts:380-386`).
- Fact: live chunks are not the replay source. The loop embeds the compact timed stream in the durable `assistant/message` before emitting the committed end frame (`.research/deepseek-harness/packages/core/agent-loop/src/agent.ts:466-483`).
- Fact: `assistant/message` can carry usage, but its absence is valid when the adapter did not report token accounting (`.research/deepseek-harness/packages/core/session/src/types.ts:311-335`).

## UI/caller projection

- Headless caller: the final text is derived from durable events in the owned sequence interval, not from the live stream. Reasoning deltas are written to stderr during the run, but final text and exit behavior come from the session log (`.research/deepseek-harness/packages/bundle/headless/src/index.ts:63-89`, `.research/deepseek-harness/packages/bundle/headless/src/index.ts:100-156`).
- Web/UI caller: the API/session-controller combines durable history with live `agent/assistant-stream` frames so the browser can paint streaming output while retaining durable events for replay (`.research/deepseek-harness/packages/api/session-controller/src/history.ts:54-170`, `.research/deepseek-harness/packages/api/session-controller/src/client/transport.ts:58-76`).

## Failure and cancellation variants

| Variant | Source evidence | Terminal behavior |
|---|---|---|
| Provider returns terminal error and no recovery listener retries | `packages/core/agent-loop/src/agent.ts:441-464` | `assistant/attempt`, then turn `error` |
| Recovery listener returns retry | `packages/core/agent-loop/src/agent.ts:448-463` | prepare/dispatch the same rendered assembly again; no repeated pre-step or user append |
| User cancels after visible streamed text | `packages/core/agent-loop/src/agent.ts:399-425` | `assistant/message { interrupted: true }`, turn ends `aborted` |
| User cancels before visible text | `packages/core/agent-loop/src/agent.ts:420-425` | `assistant/attempt`, turn ends `aborted` |
| A tool-call block is present | `packages/core/agent-loop/src/agent.ts:486-492` | Step continues through tool scheduling; this is outside Trace A |

## Tests supporting this trace

- `packages/core/agent-loop/tests/request-freeze.spec.ts`: request identity and live cancellation signal.
- `packages/core/agent-loop/tests/request-error.spec.ts`: terminal failure and retry branch.
- `packages/core/agent-loop/tests/cancel.spec.ts`: interrupted stream settlement and turn closure.
- `packages/bundle/headless/tests/headless.spec.ts`: flush-before-exit, final-text derivation, reasoning stream, and exit mapping.
- `packages/core/session/tests/*`: event and surface validation supporting the logged order.

## Unresolved

- No live provider was contacted and no built headless profile was launched in this workspace.
- The exact observable event order may vary where independent extensions append log-only session events; this trace states the core loop's order, not a total order over all plugins.
- The deepseek adapter's wire-level chunk shapes and provider retry behavior are not covered here.
