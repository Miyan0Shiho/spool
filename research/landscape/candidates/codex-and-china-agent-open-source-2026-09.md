# Codex Open-Source Boundary and China Agent Landscape

> Verified: 2026-09-19
>
> Status: abandoned on 2026-09-19. Historical evidence only; creates no
> follow-up work or product-scope change.
>
> Scope: distinguish open models, open CLIs, open harnesses, source-available
> platforms, and closed product services.
>
> Authority: [`../../../research/PLAN.md`](../../PLAN.md)

## 1. Codex: what is open

The first-party repository is
[`openai/codex`](https://github.com/openai/codex), licensed under Apache-2.0.
The audited revision is `ed12cc75d34f7cb5e3b08c8ac0c14e6bc7f67c4f`, with latest
observed release `rust-v0.155.1`.

The repository contains substantially more than a thin CLI wrapper:

| Area | Open repository evidence | What it exposes |
|---|---|---|
| Rust core | `codex-rs/core` | Agent loop, model interaction, context, history, compaction, tools, permissions, and runtime business logic |
| CLI and TUI | `codex-rs/cli`, `codex-rs/tui` | Interactive product surface and command-line entrypoints |
| Headless execution | `codex-rs/exec` | Non-interactive and script-oriented execution |
| App server | `codex-rs/app-server`, `codex-rs/app-server-protocol`, `codex-rs/app-server-daemon` | JSON-RPC server, generated schemas, transport, client, daemon, and multi-client boundaries |
| Tool runtime | `codex-rs/tools`, `apply-patch`, `shell-command`, `file-system`, `file-search`, `rmcp-client`, `ext/mcp` | Tool schemas, execution, patching, search, shell, and MCP integration |
| Session and context | `codex-rs/history`, `rollout`, `state`, `thread-store`, `compact` logic in core | Durable session, resume, history projection, rollout storage, and compaction |
| Security and execution | `codex-rs/execpolicy`, `sandboxing`, `linux-sandbox`, `windows-sandbox-service`, `bwrap`, `network-proxy`, `process-hardening` | Command policy, permissions, OS sandboxing, network restrictions, and process hardening |
| Extension points | `hooks`, `skills`, `plugin`, `core-plugins`, `ext/*` | Skills, hooks, plugins, connectors, memory, goal, web search, and extension APIs |
| SDKs | `sdk/python`, `sdk/typescript` | Programmatic clients for app-server threads, turns, streaming, approvals, and controls |
| Documentation | `docs/*`, `README.md` | Configuration, sandboxing, exec policy, skills, authentication, and contribution guidance |

The practical conclusion is that Codex's **local agent runtime and its
client/server contract are open source**. This includes the mechanisms needed
to build a local coding agent, expose it to multiple clients, persist threads,
request approvals, run tools, and enforce platform-specific sandbox policy.

## 2. Codex: what is not open

The repository is not a release of the whole Codex product or model stack.

Not established as open by this repository:

- model weights, training data, training pipeline, or serving infrastructure
  for the hosted Codex/GPT models;
- the ChatGPT and Codex Web service backend, account system, billing,
  entitlements, rate-limit service, and hosted cloud-agent control plane;
- the server-side execution environment used by Codex Web;
- every first-party product shell. The repository clearly contains CLI/TUI and
  app-server support, but no top-level first-party VS Code, JetBrains, or
  desktop application source tree was found in the audited revision.

The repository does contain client-side models and code for interacting with
hosted task APIs, including `cloud-tasks`, `cloud-tasks-client`,
`cloud-config`, and `codex-backend-openapi-models`. That is not the same as
publishing the backend implementation.

Short formulation:

```text
Open: local runtime + tools + protocol + SDK + sandbox + CLI/TUI
Closed: model weights + hosted service + account/billing + cloud execution backend
```

## 3. China: how to classify the ecosystem

The Chinese ecosystem should not be reduced to one category. Four distinct
layers are currently visible:

1. open-weight models;
2. open coding-agent CLIs and harnesses;
3. open agent frameworks;
4. open workflow or agent-development platforms.

A project can open one layer while keeping another closed. In particular, a
model repository does not imply an open runtime, and a terminal CLI does not
imply that the corresponding desktop or SaaS product is open.

## 4. Open coding-agent CLIs and harnesses

| Project | License | Current product boundary | Main lesson |
|---|---|---|---|
| [MiniMax Code](https://github.com/MiniMax-AI/minimax-code) | First-party default MIT | Open terminal TUI, headless CLI, ACP, providers, plugins, skills, and MCP; desktop app source is explicitly not included | A model vendor can open a substantial product runtime while retaining the desktop shell and managed services |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | Apache-2.0 | Open terminal agent, SDKs, daemon/Web direction, IDE integrations, multi-provider support, skills, memory, subagents, and channels | Broadest vertical parity strategy among the reviewed Chinese coding-agent CLIs |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | MIT | Developer-preview plugin runtime and Web UI under an everything-is-a-plugin architecture | Goes furthest toward an extensible general harness rather than a provider-specific CLI |
| [Kimi Code CLI](https://github.com/MoonshotAI/kimi-code) | MIT | Terminal agent with single-binary distribution, video input, MCP, plugins, subagents, hooks, sessions, and ACP | Productized TUI and editor interoperability are treated as first-class |
| [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) | Apache-2.0 | Predecessor project; upstream states it is being gradually wound down in favor of Kimi Code CLI | Treat the successor, not the old repository, as the current implementation baseline |
| [Trae Agent](https://github.com/bytedance/trae-agent) | MIT | Research-friendly Python CLI for general software-engineering tasks | ByteDance opened an agent research harness, not necessarily the Trae IDE product |
| [OpenManus](https://github.com/FoundationAgents/OpenManus) | MIT | General-purpose agent framework and runtime | Broad community adoption, but less specifically a durable coding-agent product |
| [XAgent](https://github.com/OpenBMB/XAgent) | Apache-2.0 | Autonomous agent research system | Strong research lineage; not a current coding-agent runtime decision sample |

### MiniMax in more detail

MiniMax now spans all of these public components:

- [MiniMax Code](https://github.com/MiniMax-AI/minimax-code): MIT terminal
  coding agent with TUI, headless execution, ACP, permissions, sandboxing,
  sessions, subagents, MCP, and plugins.
- [MiniMax-M2](https://github.com/MiniMax-AI/MiniMax-M2): model repository for
  coding and agentic workflows. The GitHub API reports `NOASSERTION` at the
  repository level, so model-weight licensing must be checked at the model
  artifact and repository files rather than inferred from the harness license.
- [MiniMax-MCP](https://github.com/MiniMax-AI/MiniMax-MCP): MIT MCP server for
  speech, image, and video APIs.
- [MiniMax-MCP-JS](https://github.com/MiniMax-AI/MiniMax-MCP-JS): MIT
  JavaScript MCP implementation.
- [MiniMax skills](https://github.com/MiniMax-AI/skills): MIT agent skills.
- [MiniMax CLI](https://github.com/MiniMax-AI/cli): CLI around MiniMax model
  APIs; this is not the same product boundary as MiniMax Code.

The MiniMax Code README explicitly separates the published source from the
desktop application: terminal TUI, headless CLI, and ACP are covered; desktop
application source is not. It also identifies the current checkout as a
`0.4.12 source preview`, so source presence should not be treated as proof that
the checkout has identical provenance or behavior to the published package.

## 5. Open agent frameworks

| Project | License | Position |
|---|---|---|
| [AgentScope](https://github.com/agentscope-ai/agentscope) | Apache-2.0 | General agent construction and runtime framework with a strong observability/trust framing |
| [MS-Agent](https://github.com/modelscope/ms-agent) | Apache-2.0 | ModelScope-oriented lightweight framework for complex agentic execution |
| [Youtu-Agent](https://github.com/TencentCloudADP/youtu-agent) | Repository API reports `NOASSERTION` | Tencent Cloud ADP framework that emphasizes open models; license review is required before reuse |
| [OpenManus](https://github.com/FoundationAgents/OpenManus) | MIT | Lightweight general-agent project with broad community traction |
| [XAgent](https://github.com/OpenBMB/XAgent) | Apache-2.0 | Research-oriented autonomous-agent architecture |

These projects are useful for comparing agent abstractions, tool orchestration,
planning, and multi-agent patterns. They are not all substitutes for a
product-grade coding-agent runtime with durable sessions, permissions,
sandboxing, and recovery.

## 6. Open agent platforms and workflow systems

| Project | License/status | Difference from an agent harness |
|---|---|---|
| [Coze Studio](https://github.com/coze-dev/coze-studio) | Apache-2.0 | Visual agent development and deployment platform, not a local coding CLI |
| [Dify](https://github.com/langgenius/dify) | Open-core/source-available; repository API reports `NOASSERTION` | Workflow, RAG, model, and agent application platform |
| [FastGPT](https://github.com/labring/FastGPT) | Repository API reports `NOASSERTION` | Knowledge-base and workflow platform |
| [RAGFlow](https://github.com/infiniflow/ragflow) | Apache-2.0 | RAG/context engine with agent capabilities |
| [MaxKB](https://github.com/1Panel-dev/MaxKB) | GPL-3.0 | Enterprise agent and knowledge application platform |
| [LobeHub/Lobe Chat](https://github.com/lobehub/lobehub) | Repository API reports `NOASSERTION` | Agent/client UI and operations surface |

Platform popularity can obscure a crucial boundary: a workflow builder,
knowledge agent, or chat UI is not the same artifact as a local coding-agent
runtime. These systems are still useful for studying product packaging,
observability, connectors, and deployment.

## 7. Open-weight models are a separate layer

Representative Chinese open-weight model families include:

- Qwen and Qwen-Coder;
- DeepSeek V/R series;
- Kimi K series;
- MiniMax M series;
- GLM series;
- Hunyuan and selected other vendor model releases.

Model weights can make an agent product possible without opening its runtime.
For example, an open Qwen or MiniMax checkpoint does not automatically mean
that every Qwen Code, MiniMax Code, or hosted service component is open under
the same license.

## 8. Current landscape conclusion

1. **MiniMax is broader than "partially open".** It now exposes model
   repositories, MCP servers, skills, and a terminal coding agent, while
   retaining the desktop app and managed services.
2. **Alibaba/Qwen has the broadest stack.** Open models, Qwen Code, SDKs,
   AgentScope, and MS-Agent cover model, runtime, framework, and integration
   layers.
3. **DeepSeek has the most architectural harness sample.** DeepSeek Harness is
   explicitly plugin-oriented and is now a first-class adjacent source for
   spool.
4. **Kimi has moved from an early CLI to a productized successor.** Kimi CLI
   should be treated as legacy lineage; Kimi Code CLI is the current target.
5. **ByteDance is split.** Trae Agent is open research/agent infrastructure;
   the commercial Trae IDE should not be assumed open because the agent
   repository exists.
6. **Tencent, Zhipu, and other majors are stronger in models, frameworks, or
   platforms than in an end-to-end open local coding-agent runtime.**
7. **China now has many open agent frameworks, but fewer fully open,
   product-grade coding runtimes.** The strongest current examples are Qwen
   Code, DeepSeek Harness, MiniMax Code, and Kimi Code CLI.

## 9. Historical relevance snapshot

The following observations are retained only as historical evidence. They do
not create active work.

- Use Codex as the reference for local runtime, app-server, permissions, and
  sandbox boundaries.
- Use Qwen Code as the reference for broad product-surface parity and a
  multi-protocol coding-agent stack.
- Use DeepSeek Harness as the reference for plugin-oriented runtime
  composition.
- Use MiniMax Code as the reference for turning a model vendor's agent into a
  distributable CLI with explicit open/closed product boundaries.
- Use Kimi Code CLI as the reference for TUI quality, ACP interoperability,
  and a clean successor migration.
- Do not infer runtime quality or license scope from model popularity.

## 10. Unresolved

- No MiniMax, Qwen, Kimi, Trae, or DeepSeek Harness checkout was built or run
  in this pass.
- Model-weight licenses require artifact-level review and were not reduced to a
  single repository-level SPDX label.
- Desktop, IDE, cloud, and managed-service source boundaries can change and
  must be rechecked at each candidate promotion.
