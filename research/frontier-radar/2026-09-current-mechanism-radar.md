# 2026-09 Current Mechanism Radar

> Verified: 2026-09-19
>
> Scope: current research and first-party implementations across context engineering, memory, planning/verification, tool learning, multi-agent systems, model-runtime co-design, and RSI/self-modification.
>
> Boundary: the items below are research signals. They do not change P0 scope and do not create subtraction-log decisions.

## 1. Radar summary

| Mechanism | Current signal | Time horizon | Research disposition |
|---|---|---|---|
| Context engineering | Compression is becoming a runtime state transition with its own failure modes, not just summarization | H1 for compacted coding sessions | Probe after P0 session format is stable |
| Memory | Stateful memory is splitting into file/event memory, extracted memory services, and rollback-aware experience | H2 | Watch and prototype behind an interface |
| Planning/verification | Planning is common; verification remains fragmented and scenario-specific | H1 for task completion checks | Probe with bounded acceptance tasks |
| Tool learning | Model-side training and runtime-side interface adaptation are separating | H1 runtime, H3 training | Probe runtimes with BFCL-style multi-turn checks |
| Multi-agent | Standards and frameworks are maturing, while cascade/control risks are also becoming explicit | H2/H3 | Watch; preserve seams only |
| Model-runtime co-design | Harness adaptation and opaque provider artifacts materially change runtime contracts | H1 | Probe as an architecture seam |
| RSI/self-modification | Narrow self-evolution exists; reliable recovery and security do not | H3 | Watch; blocked from P0 |

## 2. Context engineering

### Fact

- The 2026 paper **Toward Reliable Context Compression for Long-Horizon Agents** reports that recurrent compression can weaken recent interactions, increasing blocked actions, repeated exploration, and run-to-run instability. It proposes evaluating individual compaction events by paired closed-loop continuations from the same state ([arXiv:2608.06503](https://arxiv.org/abs/2608.06503)).
- **End-to-End Context Compression at Scale** proposes encoder-decoder latent context compressors and demonstrates an agent that can expand relevant compressed segments on demand ([arXiv:2606.09659](https://arxiv.org/abs/2606.09659)).
- ACON optimizes observation and history compression in natural-language space and reports reduced peak token use across long-horizon tasks ([arXiv:2510.00615](https://arxiv.org/abs/2510.00615)).
- ACP has an unstable session-compaction surface in its current schema, showing that compaction lifecycle/status is becoming protocol-visible rather than a purely internal prompt operation ([ACP schema tree](https://github.com/agentclientprotocol/agent-client-protocol/tree/d3c1dd78c5f25afbc37a755ebd1982b43dd97069/agent-client-protocol-schema/src/v1)).

### Interpretation

- The important research question is not "summarize or not." It is when a compaction boundary is safe, what state must survive it, and how to verify behavior after it.
- Spool's planned requirement to retain task goal, edits, verification state, and unresolved issues is aligned with this direction, but the current session design should not be expanded before the base loop is measured.
- Compression that is correct for chat can still be unsafe for an agent with pending actions or tool-call pairings.

### Unresolved

- No current result establishes a universal compaction algorithm for coding agents.
- The papers do not settle provider cache compatibility, tool-call structural validity, or user-visible undo semantics.
- Spool has not run a paired continuation experiment around its own future compaction boundary.

### Bounded follow-up

Create two traces from the same pre-compaction state: one uncompressed continuation and one compacted continuation. Compare task success, repeated actions, pending-action validity, and token cost.

## 3. Memory

### Fact

- **Letta Code** is active at `0.32.13`, commit [`0f6fb22`](https://github.com/letta-ai/letta-code/tree/0f6fb22674c1f211c1da8530df8cfebb587ac600), Apache-2.0. Its first-party README describes memory blocks, Git-tracked MemFS, agent-rewritten memory, skills, message search, subagents, and scheduled work ([README](https://github.com/letta-ai/letta-code/blob/0f6fb22674c1f211c1da8530df8cfebb587ac600/README.md)).
- The active source contains dedicated memory filesystem, Git synchronization, memory runtime, worktree, and validation surfaces, for example [`memory-filesystem.ts`](https://github.com/letta-ai/letta-code/blob/0f6fb22674c1f211c1da8530df8cfebb587ac600/src/agent/memory-filesystem.ts) and [`memory-runtime.ts`](https://github.com/letta-ai/letta-code/blob/0f6fb22674c1f211c1da8530df8cfebb587ac600/src/agent/memory-runtime.ts).
- **Mem0** is active at commit [`a39a802`](https://github.com/mem0ai/mem0/tree/a39a802bbc93e85b820078cd3c4dbaf53af25dbe), Apache-2.0. Its current README describes a v3 ADD-only extraction path, agent-generated facts, and hosted/open-source implementation differences ([README](https://github.com/mem0ai/mem0/blob/a39a802bbc93e85b820078cd3c4dbaf53af25dbe/README.md)).
- The 2026 paper **Rollback the World, Keep the Reflection** models recovery as a rollback-boundary problem: restore environment state while preserving useful reflection memory from the abandoned trajectory ([arXiv:2609.18304](https://arxiv.org/abs/2609.18304)).

### Interpretation

- Memory is not a single feature family. At least three distinct mechanisms are emerging:
  - agent-authored working memory and files;
  - externally extracted/searchable memory;
  - experience retained across rollback or failed trajectories.
- Git-backed memory is attractive for inspectability and rollback, but it can conflate memory with workspace modifications and repository permissions.
- ADD-only memory reduces destructive updates but increases privacy, stale-fact, and retrieval-noise risk.

### Unresolved

- There is no stable cross-product memory schema or portable evaluation standard.
- Retention, deletion, user consent, secret leakage, cross-workspace isolation, and memory poisoning were not resolved by this scan.
- Letta and Mem0 report product-specific outcomes; this scan did not reproduce them.

### Bounded follow-up

Define a read-only memory-provider interface and test one local note-file implementation before designing any persistent service. Do not add personalization semantics to P0.

## 4. Planning and verification

### Fact

- A 2026 mechanism review maps ten historical cognitive architectures, eight language-agent runtime families, and forty-two systems. It reports uneven coverage and identifies coupled uncertainty, interruption, stopping, and resource governance as residual mechanism gaps ([arXiv:2607.23942](https://arxiv.org/abs/2607.23942)).
- A systems paper on **Agentic Skills** defines a nine-stage lifecycle from discovery and authoring through execution, repair, evaluation, and security governance, and identifies continual learning and benchmark realism as open problems ([arXiv:2608.29596](https://arxiv.org/abs/2608.29596)).
- LangGraph provides a deterministic interruption/resume primitive through `interrupt()` and `Command(resume=...)`, with checkpointing required for durable resume ([LangGraph types](https://github.com/langchain-ai/langgraph/blob/c81c13533ee48c1ae0ef2de314737ef0c455f2be/libs/langgraph/langgraph/types.py#L827-L887)).
- OpenEvolve gates candidate programs through evaluation and cascade evaluation before accepting improvements ([OpenEvolve README](https://github.com/algorithmicsuperintelligence/openevolve/blob/411fb59c886c18704caaffb611e17cf9e7d824d2/README.md)).

### Interpretation

- Planning is not scarce. Reliable verification, verification ownership, and recovery after failed verification are scarce.
- The runtime should expose verification as an explicit state/event and preserve the evidence used to declare completion.
- A planning UI is not equivalent to a verified task-completion mechanism.

### Unresolved

- No universal verifier exists for code tasks; tests, static checks, manual review, and environment-state metrics cover different failure classes.
- Current research does not establish when verification should block execution, trigger replanning, or terminate a task.

### Bounded follow-up

Use spool's acceptance tasks to require an explicit verification record: command/tool, result, scope, timestamp, and unresolved evidence gap.

## 5. Tool learning

### Fact

- **Berkeley Function Calling Leaderboard V4** is current at commit [`6ea5797`](https://github.com/ShishirPatil/gorilla/tree/6ea57973c7a6097fd7c5915698c54c17c5b1b6c8), Apache-2.0. It evaluates simple, parallel, multiple, executable, multi-turn, web-search, memory, and format-sensitivity behavior ([BFCL README](https://github.com/ShishirPatil/gorilla/blob/6ea57973c7a6097fd7c5915698c54c17c5b1b6c8/berkeley-function-call-leaderboard/README.md)).
- MCP 2026-07-28 standardizes tool discovery and execution through JSON-RPC and typed schemas, while leaving host approval policy outside the protocol.
- The 2026 MATCH paper trains model-side tool use with model-aware curricula and gated rewards, evaluated on API-Bank and BFCL V3 ([arXiv:2609.20082](https://arxiv.org/abs/2609.20082)).

### Interpretation

- Tool learning has two layers:
  - runtime/interface learning: schemas, errors, argument repair, multi-turn state, and environment contracts;
  - model learning: training the model's selection and argument behavior.
- Spool should initially improve the runtime layer and collect replayable tool traces. Model training is outside P0.
- BFCL V4's multi-turn and memory categories show that tool success cannot be measured only as one-shot function-name matching.

### Unresolved

- BFCL does not measure filesystem safety, permission recovery, or multi-process cancellation.
- MCP tools may change dynamically, which is not covered by static function-calling benchmarks.

### Bounded follow-up

Add multi-turn tool failures to the internal benchmark: missing parameter, wrong tool, malformed arguments, changed tool list, and recovery after a denied call.

## 6. Multi-agent systems

### Fact

- A2A provides a stable task/message/artifact protocol for independent agents and supports streaming, task resubscription, and push notifications.
- Microsoft Agent Framework `1.19.0` is active at commit [`42c22c0`](https://github.com/microsoft/agent-framework/tree/42c22c001761340f47b279e89a4e06aedb5549d9), MIT. Its current README describes graph workflows with sequential, concurrent, handoff, group collaboration, checkpointing, human-in-the-loop, and time-travel patterns ([README](https://github.com/microsoft/agent-framework/blob/42c22c001761340f47b279e89a4e06aedb5549d9/README.md)).
- AutoGen is in maintenance mode and directs new users to Microsoft Agent Framework.
- The 2026 **Collective Loss of Control** paper finds high conditional susceptibility to injected unsafe trajectories and audits unintended communication paths between nominally independent runs ([arXiv:2609.18460](https://arxiv.org/abs/2609.18460)).
- BusMA studies a shared-bus communication model with registration, routing, and shared memory ([arXiv:2609.15054](https://arxiv.org/abs/2609.15054)).

### Interpretation

- Multi-agent topology is becoming easier to build; isolation, provenance, and containment are not keeping pace.
- Spool should preserve event source IDs, budget boundaries, and subagent context isolation, but should not introduce shared memory or peer-to-peer delegation in P0.
- Multi-agent should be evaluated by marginal task success and containment, not by the number of agents.

### Unresolved

- Cross-agent authorization, credential propagation, memory isolation, and failure attribution remain open.
- The reviewed systems do not provide a generally accepted safe default for agent-to-agent communication.

### Bounded follow-up

No standalone multi-agent prototype yet. First require every event to carry origin identity so a future subagent trace can be isolated and audited.

## 7. Model-runtime co-design

### Fact

- **Life-Harness** is active at commit [`22c299b`](https://github.com/Tianshi-Xu/Life-Harness/tree/22c299b83d888405d34d2c7efc0fcf4d2ccfdcef), MIT. It evolves runtime contracts, action realization, trajectory regulation, and procedural skills without updating model weights or changing the evaluation environment ([README](https://github.com/Tianshi-Xu/Life-Harness/blob/22c299b83d888405d34d2c7efc0fcf4d2ccfdcef/README.md), [arXiv:2605.22166](https://arxiv.org/abs/2605.22166)).
- OpenAI Python SDK `3.16.0` exposes responses with `conversation`, `previous_response_id`, `reasoning`, built-in tools, MCP tools, and an encrypted reasoning item that must be included when manually carrying context forward ([`response.py`](https://github.com/openai/openai-python/blob/dcbd6b8f5c26bc09899a584158729b5b67ba7dc6/src/openai/types/responses/response.py), [`response_reasoning_item.py`](https://github.com/openai/openai-python/blob/dcbd6b8f5c26bc09899a584158729b5b67ba7dc6/src/openai/types/responses/response_reasoning_item.py)).
- Anthropic Python SDK `1.7.0` models thinking blocks as opaque signed artifacts that must be returned exactly when using tools with extended thinking ([`thinking_block.py`](https://github.com/anthropics/anthropic-sdk-python/blob/0af0190679a9e80388bd1b0328d557c9a91a11b2/src/anthropic/types/thinking_block.py)).
- The UNISON paper goes further toward hardware/runtime co-design by scheduling session KV residency around tool-wait gaps ([arXiv:2609.09643](https://arxiv.org/abs/2609.09643)). This is a long-horizon infrastructure signal, not a near-term action.

### Interpretation

- A provider-neutral message list is no longer a sufficient runtime abstraction. At least some provider artifacts must be stored, round-tripped, and invalidated according to provider rules.
- Runtime harness adaptation can produce measurable gains without changing model weights, which makes provider capability metadata and interface experiments an H1 research area.
- Spool needs to preserve opaque provider artifacts without interpreting them and should not rely solely on provider-managed conversation state.

### Unresolved

- Provider-specific state reduces portability and complicates resume, export, redaction, and provider switching.
- There is no cross-provider conformance suite for reasoning artifacts, cache markers, tool-call IDs, or provider-managed conversations.
- This scan did not invoke current provider APIs.

### Bounded follow-up

Add provider round-trip tests for opaque reasoning/thinking artifacts and define a capability record for conversation state, tool calls, caching, and reasoning continuation.

## 8. RSI and self-modification

### Fact

- Letta Code describes agents that rewrite memory, skills, prompts, and harness modifications, with `/sleeptime`, memory editing, and self-configuration exposed as product concepts.
- OpenEvolve `0.3.2` is active at commit [`411fb59`](https://github.com/algorithmicsuperintelligence/openevolve/tree/411fb59c886c18704caaffb611e17cf9e7d824d2), Apache-2.0. It evolves code and prompts with island populations and evaluation gates, but its roadmap still lists self-modifying prompts and federated learning as future work ([README](https://github.com/algorithmicsuperintelligence/openevolve/blob/411fb59c886c18704caaffb611e17cf9e7d824d2/README.md)).
- **EvoUndo** reports 197 capability-improving mutations that failed recoverability verification; extended recovery semantics and exact state grounding improved recovery substantially in the studied setup ([arXiv:2608.28363](https://arxiv.org/abs/2608.28363)).
- **ModularRSI** evolves five bounded harness modules and reports transfer to unseen tasks ([arXiv:2609.14857](https://arxiv.org/abs/2609.14857)).
- **SoL-Pi** applies an RSI-inspired loop at the harness layer and reports token/cost gains from selected execution, compaction, observation, and delegation changes ([arXiv:2609.20519](https://arxiv.org/abs/2609.20519)).
- **Poisoned benchmarks for self-modifying coding agents** shows that benchmark contamination can cause self-evolved instructions to persist and disable security checks on later neutral tasks ([arXiv:2609.17817](https://arxiv.org/abs/2609.17817)).
- A 2026 security analysis reports that self-evolution turns attacks from session-bounded into lineage-persistent and finds only limited blocking by co-located scanners ([arXiv:2606.23075](https://arxiv.org/abs/2606.23075)).

### Interpretation

- Narrow self-configuration, prompt evolution, and harness optimization are real research directions.
- Reliable RSI requires recoverability, lineage isolation, independent verification, rollback, and protection from poisoned evaluation data.
- The evidence does not justify self-modification in spool P0. The current subtraction-log `later` decision remains compatible with this radar.

### Unresolved

- There is no demonstrated production-grade RSI system with safe recovery under hostile evaluation conditions.
- The papers use different harnesses, models, tasks, and threat assumptions, so their results are not directly comparable.
- Reproducibility, long-term capability drift, and organizational accountability remain open.

### Bounded follow-up

Watch only. If revisited, start with immutable, externally reviewed prompt/skill variants and a reversible evaluation gate, not runtime self-modification.

## 9. Selection and elimination notes

- **AutoGen** is not promoted as a current source because it is in maintenance mode.
- **SakanaAI/AI-Scientist-v2** is not promoted: the GitHub API reports `NOASSERTION` for license, the latest observed commit is 2025-12-19, and no release endpoint was available. Legal and maintenance review would be required before deeper study.
- **Closed commercial agents** remain behavior-only comparison targets because there is no licensable runtime source.

## 10. Cross-radar conclusions

1. The core runtime should own durable conversation state, not delegate it entirely to a provider.
2. Context compression and memory need explicit recovery/rollback semantics before they become product features.
3. Tool learning should begin with runtime contracts and trajectory evidence, not model training.
4. Multi-agent and RSI are the two least appropriate near-term expansions.
5. Provider artifacts and runtime harness adaptation are immediate architecture-seam concerns even though the user-facing features are not P0.

## 11. Unresolved items

- No paper in this radar was reproduced.
- No current provider API was exercised; provider SDK structure is source evidence only.
- Memory retention/deletion compliance and multi-agent containment need dedicated security review.
- Current vector-database, planner, and self-evolution products were sampled selectively rather than exhaustively.
