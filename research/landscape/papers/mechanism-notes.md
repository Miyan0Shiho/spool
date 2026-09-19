# Frontier Mechanism Notes

> Snapshot date: 2026-09-19
>
> Purpose: evidence notes behind the 2026-Q3 frontier radar.
>
> Radar:
> [`../../frontier-radar/2026-q3.md`](../../frontier-radar/2026-q3.md)

## Evidence Method

- Papers are pinned by arXiv version and linked to their abstract page.
- Projects are pinned to a full commit when a stable commit was available.
- Vendor documentation is treated as first-party contract evidence, not
  independent controlled evidence.
- Local harness comparisons refer to the inspected atlases rather than copying
  source.
- No performance number is transferred to spool unless the cited source states
  it directly.

## FR-01 Context Engineering and Compaction

### Core question

What should remain in model context, what should be persisted outside it, and
how can a harness compress context without losing task-critical state?

### Facts

- `F-FR01-01`: Anthropic's engineering guide, published 2025-09-29, describes
  context as a finite resource and recommends deliberate context management for
  long-horizon agents. This is first-party design guidance, not a controlled
  comparison.
- `F-FR01-02`: "Lost in the Middle" v3 reports that long-context model
  performance can change with the position of relevant information and can be
  strongest near the beginning or end.
- `F-FR01-03`: LLMLingua-2 v2 evaluates task-agnostic prompt compression using a
  data-distillation method. The result concerns compression quality, not a
  guarantee that compressed context preserves coding-task safety state.
- `F-FR01-04`: DeepSeek Harness represents durable context as an append-only
  session log and performs compaction through durable surface replacement. It
  prunes tool results before summarization when pruning can relieve pressure.
- `F-FR01-05`: Claude Code applies tool-result budgeting, history reduction,
  microcompaction, context collapse, and full compaction in a layered order.
  Post-compaction restoration can include file-state and plan-state artifacts.

### Interpretation

- `I-FR01-01`: Compression should act on a typed projection rather than an
  opaque message array. The typed projection can preserve task, plan, file,
  verification, and unresolved-work state explicitly.
- `I-FR01-02`: A compression policy needs per-model evaluation. Long-context
  position effects and model-specific tokenization make a single universal
  threshold unsafe.
- `I-FR01-03`: Tool-call/result pairing and the final verification state should
  be hard boundaries, not content that a summarizer may choose to retain.

### Unresolved

- `U-FR01-01`: The best token accounting method for mixed code, CJK text, tool
  output, and images is not established.
- `U-FR01-02`: The minimum durable state for a long coding task is not yet
  empirically defined.
- `U-FR01-03`: The interaction between compression quality and provider prompt
  caching has not been measured locally.
- `U-FR01-04`: No local live run has yet compared the two inspected harnesses on
  the same pressure and resume tasks.

### Harness delta

- `DeepSeek Harness`: strict durable surface, log-only compaction records,
  tool-pair boundaries, tool-result pruning, overflow recovery.
- `Claude Code`: multiple reduction layers and explicit operational-state
  re-injection after compaction.

### Probe

Create pressure using long file reads, repeated command output, a failed test,
and an active plan. Force compaction, resume, and require completion without
re-reading all history. Score objective success, required-state retention,
tool-pair validity, cache metrics, and false completion.

Stop if structured projection does not improve recovery or if it adds more
failure paths than the baseline reduction policy.

### Sources

- Anthropic, "Effective context engineering for AI agents", 2025-09-29:
  https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Liu et al., "Lost in the Middle", arXiv v3:
  https://arxiv.org/abs/2307.03172v3
- Pan et al., "LLMLingua-2", arXiv v2:
  https://arxiv.org/abs/2403.12968v2
- Microsoft LLMLingua release `v0.2.2`, commit
  `5a4c78ae18ab17a98cf997e8259354e546081d64`:
  https://raw.githubusercontent.com/microsoft/LLMLingua/5a4c78ae18ab17a98cf997e8259354e546081d64/README.md
- Local DeepSeek Harness L4 evidence:
  [`../../source-atlas/deepseek-harness/02-tools-session-context.md`](../../source-atlas/deepseek-harness/02-tools-session-context.md)
- Local Claude Code L4 evidence:
  [`../../source-atlas/claude-code/02-tools-session-context.md`](../../source-atlas/claude-code/02-tools-session-context.md)

## FR-02 Durable Memory

### Core question

Which facts should persist across sessions, how are they sourced and updated,
and when should an agent abstain instead of recalling stale state?

### Facts

- `F-FR02-01`: MemGPT v2 proposes virtual context management and movement between
  memory tiers to provide an extended-context abstraction.
- `F-FR02-02`: LongMemEval v2 evaluates information extraction, multi-session
  reasoning, knowledge updates, temporal reasoning, and abstention.
- `F-FR02-03`: The LongMemEval repository snapshot at commit
  `9e0b455f4ef0e2ab8f2e582289761153549043fc` documents ICLR 2025 publication,
  a 2025 history-cleaning update, and a separate LongMemEval-V2 for agentic
  context announced in 2026-05.
- `F-FR02-04`: The Letta repository release `0.16.8` provides a stateful-agent
  platform and memory-focused product surface. The release version does not by
  itself prove that its memory policy generalizes to repository coding.
- `F-FR02-05`: DeepSeek Harness L4 evidence establishes append-only session
  persistence, project instructions, and session references. It does not
  establish autonomous cross-session memory writes.
- `F-FR02-06`: Claude Code L4 evidence establishes instruction/memory files,
  nested attachments, and a feature-gated session-memory compaction path.

### Interpretation

- `I-FR02-01`: Memory needs provenance and lifecycle metadata. A memory record
  without source, scope, time, confidence, and supersession state is unsafe for
  repository work.
- `I-FR02-02`: Explicit project instructions should remain the H1 baseline.
  Dynamic memory is an H2 experiment until update and abstention behavior are
  measurable.
- `I-FR02-03`: Repository state should be verified from the repository, not
  retrieved from stale memory.

### Unresolved

- `U-FR02-01`: No cited benchmark directly measures coding-task memory with
  repository-truth conflicts.
- `U-FR02-02`: Deletion, correction, consent, tenancy, and encryption semantics
  remain product-policy questions.
- `U-FR02-03`: The value of user-profile memory versus task-scoped project facts
  is not established for spool.
- `U-FR02-04`: Memory retrieval cost and prompt-cache impact are not quantified
  here.

### Harness delta

- `DeepSeek Harness`: session truth and explicit sourced context; no autonomous
  long-term memory established in L0-L4.
- `Claude Code`: richer instruction/memory-file paths and experimental session
  memory, with feature gating and alternating strategies.

### Probe

Use LongMemEval or an equivalent fixed set only as an offline research probe.
Compare explicit project files, retrieval-backed memory, and no memory. Require
source attribution, supersession, abstention, and deletion behavior.

Do not add a P0 memory product or automatic user profile from this evidence.

### Sources

- Packer et al., "MemGPT", arXiv v2:
  https://arxiv.org/abs/2310.08560v2
- Wu et al., "LongMemEval", arXiv v2:
  https://arxiv.org/abs/2410.10813v2
- LongMemEval commit
  `9e0b455f4ef0e2ab8f2e582289761153549043fc`:
  https://raw.githubusercontent.com/xiaowu0162/LongMemEval/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md
- Letta release `0.16.8`, commit
  `5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a`:
  https://raw.githubusercontent.com/letta-ai/letta/5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a/README.md
- Local DeepSeek Harness L4 evidence:
  [`../../source-atlas/deepseek-harness/02-tools-session-context.md`](../../source-atlas/deepseek-harness/02-tools-session-context.md)
- Local Claude Code L4 evidence:
  [`../../source-atlas/claude-code/02-tools-session-context.md`](../../source-atlas/claude-code/02-tools-session-context.md)

## FR-03 Planning and Replanning

### Core question

How should a coding harness represent intended work, update it after new
evidence, and connect plan status to actual execution and verification?

### Facts

- `F-FR03-01`: ReAct v3 interleaves reasoning traces and task actions and reports
  that actions can provide environment feedback for later reasoning.
- `F-FR03-02`: PlanBench v4 is explicitly built to test planning and reasoning
  about change separately from tasks that may be solved by common-sense
  retrieval.
- `F-FR03-03`: DeepSeek Harness L0-L4 establishes turn, step, inbox, tool, and
  session-event state. The inspected atlas does not establish a first-class
  durable plan object.
- `F-FR03-04`: Claude Code L4 evidence states that post-compaction restoration
  can re-inject plan state, which makes plan persistence operationally relevant.

### Interpretation

- `I-FR03-01`: A harness-level plan should be explicit state with stable task
  identities and status transitions, not a generated message that must be
  rediscovered after compaction.
- `I-FR03-02`: Replanning should be triggered by contradictory evidence, tool
  failure, acceptance failure, or a changed user instruction. It should not
  become an unbounded search process.
- `I-FR03-03`: A plan cannot prove task completion. Completion still requires
  execution or verification evidence.

### Unresolved

- `U-FR03-01`: The minimum useful plan schema is unknown.
- `U-FR03-02`: The value of plan search, tree search, or model-generated
  alternatives for repository coding is not established by this evidence set.
- `U-FR03-03`: No local benchmark compares visible plan state with an
  unconstrained ReAct-style loop.
- `U-FR03-04`: Plan-mode interaction and approval semantics are product
  questions outside this note.

### Harness delta

- `DeepSeek Harness`: explicit step/turn state and durable event log, but no
  plan object established in the inspected L0-L4 evidence.
- `Claude Code`: plan state can be restored after compaction, although the full
  external-build behavior is feature- and version-dependent.

### Probe

Persist a small plan with task IDs, status, dependencies, evidence links, and a
revision reason. Test a task that changes direction after the first search or
test failure. Measure completion, stale-step rate, replanning count, and resume
quality.

Stop if the plan becomes redundant state or does not improve recovery and
completion.

### Sources

- Yao et al., "ReAct", arXiv v3:
  https://arxiv.org/abs/2210.03629v3
- Valmeekam et al., "PlanBench", arXiv v4:
  https://arxiv.org/abs/2206.10498v4
- Local DeepSeek Harness L2 evidence:
  [`../../source-atlas/deepseek-harness/01-entrypoints-runtime.md`](../../source-atlas/deepseek-harness/01-entrypoints-runtime.md)
- Local Claude Code L4 evidence:
  [`../../source-atlas/claude-code/02-tools-session-context.md`](../../source-atlas/claude-code/02-tools-session-context.md)

## FR-04 Verification and Completion Gates

### Core question

How does the harness prove that the requested outcome is complete, safe, and
supported by evidence rather than by the model's assertion?

### Facts

- `F-FR04-01`: "Let's Verify Step by Step" v1 compares outcome supervision with
  process supervision and reports improved performance for process supervision
  in its studied reasoning setting.
- `F-FR04-02`: SWE-bench v3 contains 2,294 real GitHub issue/pull-request tasks
  across 12 Python repositories and evaluates generated patches in a
  reproducible software environment.
- `F-FR04-03`: The official SWE-bench repository README identifies SWE-bench
  Verified as a 500-problem subset confirmed solvable by software engineers.
- `F-FR04-04`: DeepSeek Harness normalizes tool failures into structured results
  and persists tool-call/result relationships. This gives the runtime evidence
  boundaries but is not itself a semantic verification gate.
- `F-FR04-05`: Claude Code persists tool results and final conversation facts,
  but the mirror does not establish a universal proof that the final test covers
  the requested change.

### Interpretation

- `I-FR04-01`: Deterministic test and command evidence should dominate verbal
  self-critique for coding completion.
- `I-FR04-02`: Completion should record the exact verification command, working
  revision, exit status, relevant output, and any checks not run.
- `I-FR04-03`: Verification must be resistant to stale execution and test
  tampering. "A test passed" is not enough if it ran before the final edit or if
  the test itself was weakened.

### Unresolved

- `U-FR04-01`: Process-supervision evidence from reasoning tasks has not been
  shown to transfer directly to repository coding.
- `U-FR04-02`: No universal verifier exists for documentation, architecture,
  refactoring intent, or unstated acceptance criteria.
- `U-FR04-03`: The optimal completion policy after a failed or unavailable check
  is not defined.
- `U-FR04-04`: The current benchmark suite has not yet produced execution
  results in this repository.

### Harness delta

- `DeepSeek Harness`: strong durable execution evidence and result normalization;
  semantic acceptance remains externally supplied.
- `Claude Code`: visible tool results, diffs, and final reporting, but the mirror
  does not prove a universal verification gate.

### Probe

Add a verification record to the fixed task workflow. Test passing-before-final
edit, wrong-scope tests, modified tests, nonzero commands that are expected, and
non-code tasks. Measure false completion and unnecessary blocking.

Stop if the gate cannot distinguish substantive verification from command
execution.

### Sources

- Lightman et al., "Let's Verify Step by Step", arXiv v1:
  https://arxiv.org/abs/2305.20050v1
- Jimenez et al., "SWE-bench", arXiv v3:
  https://arxiv.org/abs/2310.06770v3
- SWE-bench commit
  `02e7a74ffd0b707aab73d203fe87bdc7c76afc8e`:
  https://raw.githubusercontent.com/SWE-bench/SWE-bench/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/README.md
- Local DeepSeek Harness L3-L4 evidence:
  [`../../source-atlas/deepseek-harness/02-tools-session-context.md`](../../source-atlas/deepseek-harness/02-tools-session-context.md)
- Local Claude Code L3-L4 evidence:
  [`../../source-atlas/claude-code/02-tools-session-context.md`](../../source-atlas/claude-code/02-tools-session-context.md)

## FR-05 Tool Learning and Function-Calling Evaluation

### Core question

How should the harness separate model tool-selection capability from schema
design, runtime validation, execution, permission, and recovery behavior?

### Facts

- `F-FR05-01`: Toolformer v1 trains a language model to decide which API to call,
  when to call it, what arguments to provide, and how to use the result.
- `F-FR05-02`: Gorilla v1 reports a fine-tuned model plus retrieval for API
  generation and explicitly identifies wrong APIs and inaccurate arguments as
  failure modes.
- `F-FR05-03`: BFCL V4 describes executable function-call evaluation across
  web search, agentic memory, and prompt/format sensitivity.
- `F-FR05-04`: The Gorilla repository snapshot at commit
  `6ea57973c7a6097fd7c5915698c54c17c5b1b6c8` contains the BFCL evaluator and
  links the V4 format-sensitivity release.
- `F-FR05-05`: DeepSeek Harness projects stable tool schemas to the model,
  validates arguments, normalizes failures, controls ordering, and persists
  call/result pairs.
- `F-FR05-06`: Claude Code's tool contract includes input/output schema,
  concurrency, permissions, edit staleness, UI, and model serialization.

### Interpretation

- `I-FR05-01`: Tool quality should be measured as a matrix of model, schema,
  prompt format, execution environment, permission policy, and recovery path.
- `I-FR05-02`: The first architectural response is stable contracts and
  evaluation, not custom model training.
- `I-FR05-03`: A format-sensitivity evaluation should run against the same real
  runtime schemas used by the product.

### Unresolved

- `U-FR05-01`: BFCL scores do not by themselves predict success on spool's
  multi-step coding tools and permission prompts.
- `U-FR05-02`: The cost/benefit of fine-tuning or distillation for a small
  coding-agent model is outside this evidence set.
- `U-FR05-03`: The correct level of schema normalization across providers is
  unresolved.
- `U-FR05-04`: No held-out spool tool-use evaluation exists yet.

### Harness delta

- `DeepSeek Harness`: runtime-first tool architecture with explicit lifecycle
  events and normalized outcomes.
- `Claude Code`: capability contract integrates tool behavior with permissions,
  UI, progress, and telemetry.

### Probe

Run selected BFCL V4 categories and spool-specific coding tool tasks through the
actual runtime. Record format, parsing, execution, permission, recovery, cost,
and safety separately. Use the result as a model qualification gate, not as a
claim that a model has learned safe tool use.

Stop if benchmark gains do not correlate with real coding-task or safety
outcomes.

### Sources

- Schick et al., "Toolformer", arXiv v1:
  https://arxiv.org/abs/2302.04761v1
- Patil et al., "Gorilla", arXiv v1:
  https://arxiv.org/abs/2305.15334v1
- Berkeley Function Calling Leaderboard V4 format sensitivity:
  https://gorilla.cs.berkeley.edu/blogs/17_bfcl_v4_prompt_variation.html
- BFCL V4 index and prior versions:
  https://raw.githubusercontent.com/ShishirPatil/gorilla/6ea57973c7a6097fd7c5915698c54c17c5b1b6c8/berkeley-function-call-leaderboard/README.md
- Local DeepSeek Harness L3 evidence:
  [`../../source-atlas/deepseek-harness/02-tools-session-context.md`](../../source-atlas/deepseek-harness/02-tools-session-context.md)
- Local Claude Code L3 evidence:
  [`../../source-atlas/claude-code/02-tools-session-context.md`](../../source-atlas/claude-code/02-tools-session-context.md)

## FR-06 Model-Runtime Co-Design

### Core question

Which runtime choices should follow from model serving characteristics such as
KV-cache reuse, prompt-prefix stability, structured decoding, retries, and
batching?

### Facts

- `F-FR06-01`: vLLM's PagedAttention paper v1 reports KV-cache memory efficiency
  and cache sharing through paged memory management.
- `F-FR06-02`: SGLang v2 combines a language for structured model programs with
  RadixAttention for KV-cache reuse and compressed finite-state machines for
  structured output decoding.
- `F-FR06-03`: Prompt Cache v2 treats repeated prompt segments as explicit
  reusable prompt modules and studies attention-state reuse.
- `F-FR06-04`: Anthropic's prompt-caching page states that it caches frequently
  used context between calls to reduce cost and latency, with general API
  availability noted in its update text.
- `F-FR06-05`: DeepSeek's context-caching documentation states that disk caching
  is enabled by default, prefix matches produce cache hits, and cache behavior
  is best-effort. Responses expose prompt cache hit and miss token fields.
- `F-FR06-06`: The vLLM prefix-caching design document describes hash-based
  block reuse, collision handling, and cache salting for isolation in shared
  environments.
- `F-FR06-07`: Claude Code's inspected runtime separates stable prompt-cache
  prefix pieces from request-specific messages. DeepSeek Harness persists the
  effective request context and freezes each model call before dispatch.

### Interpretation

- `I-FR06-01`: The core runtime should define stable semantic boundaries for
  system instructions, tools, project context, conversation history, and
  per-step dynamic facts.
- `I-FR06-02`: Cache metrics belong in observability, not correctness logic.
  A cache hit can reduce cost without proving that the model saw the right
  semantic state.
- `I-FR06-03`: Provider cache behavior should sit behind an adapter contract so
  that dynamic fields can be placed late without forcing one provider's cache
  semantics into the core loop.

### Unresolved

- `U-FR06-01`: The best cache-key layout across OpenAI-compatible, DeepSeek, and
  Anthropic providers has not been tested in spool.
- `U-FR06-02`: Cache privacy and isolation requirements for local and hosted
  deployments are not fully specified.
- `U-FR06-03`: Prefix reuse may conflict with rapid instruction or tool-list
  changes; the cost/benefit boundary is unresolved.
- `U-FR06-04`: Structured-output runtime behavior varies by provider and model.

### Harness delta

- `DeepSeek Harness`: durable request context, frozen model calls, provider
  adapter boundary.
- `Claude Code`: explicit prompt-cache breakpoints and separation of stable
  prefix context from per-request content.

### Probe

Measure cache hit/miss, input/output tokens, latency, and semantic correctness
across at least two providers while changing tool list, workspace instruction,
and dynamic timestamp placement. Include a cache-isolation case.

Stop if optimizing cache metrics harms semantic reconstruction or portability.

### Sources

- Kwon et al., "PagedAttention and vLLM", arXiv v1:
  https://arxiv.org/abs/2309.06180v1
- Zheng et al., "SGLang", arXiv v2:
  https://arxiv.org/abs/2312.07104v2
- Gim et al., "Prompt Cache", arXiv v2:
  https://arxiv.org/abs/2311.04934v2
- vLLM repository commit
  `71fc70d3ae1df53300a23ec69f6d97b7207a109f`:
  https://raw.githubusercontent.com/vllm-project/vllm/71fc70d3ae1df53300a23ec69f6d97b7207a109f/docs/design/prefix_caching.md
- SGLang repository commit
  `6bd1a0af1d9e5756d115dbec6d02e0289c1b6950`:
  https://raw.githubusercontent.com/sgl-project/sglang/6bd1a0af1d9e5756d115dbec6d02e0289c1b6950/README.md
- Anthropic prompt caching:
  https://www.anthropic.com/news/prompt-caching
- DeepSeek context caching:
  https://api-docs.deepseek.com/guides/kv_cache

## FR-07 Multi-Agent Orchestration

### Core question

When does splitting work across agents improve context isolation or parallelism
enough to justify coordination, cost, and new failure modes?

### Facts

- `F-FR07-01`: AutoGen v2 proposes programmable multi-agent conversations with
  customizable agents, tools, humans, and interaction behavior.
- `F-FR07-02`: The AutoGen repository snapshot pins `autogen-core` version
  `0.7.5` at commit `027ecf0a379bcc1d09956d46d12d44a3ad9cee14`.
- `F-FR07-03`: "Why Do Multi-Agent LLM Systems Fail?" v3 reports 1,600+
  annotated traces across seven frameworks and introduces a failure taxonomy;
  its abstract states that multi-agent gains are often minimal.
- `F-FR07-04`: DeepSeek Harness has Agent and job primitives plus independent
  session state, but the inspected L0-L4 evidence does not require a multi-agent
  society for the core loop.
- `F-FR07-05`: Claude Code has subagent transcript and coordinator-context paths,
  but the mirror marks important behavior as feature-gated and does not establish
  universal shipped orchestration.

### Interpretation

- `I-FR07-01`: The first credible use case is context isolation, not autonomous
  collaboration. A child agent should receive a bounded task and return one
  structured result.
- `I-FR07-02`: Shared mutable memory and unrestricted agent-to-agent messaging
  should be excluded from the first experiment.
- `I-FR07-03`: Multi-agent value must be measured against a capable single-agent
  baseline at equal or lower cost.

### Unresolved

- `U-FR07-01`: No cited result establishes that subagents improve repository
  coding reliability after cost normalization.
- `U-FR07-02`: Parent/child concurrency, cancellation, and repository-state
  merge semantics are unsolved for spool.
- `U-FR07-03`: Prompt-injection propagation across agent boundaries is not
  quantified.
- `U-FR07-04`: The boundary between a subagent, a background job, and a
  human-supervised worktree remains a product decision.

### Harness delta

- `DeepSeek Harness`: first-class agent/job/session primitives and a shared core
  loop; multi-agent society not established.
- `Claude Code`: feature-gated subagent and coordinator paths, with separate
  transcript storage.

### Probe

After P0, run one bounded read-heavy task with a child agent, a fixed budget,
read-only or non-overlapping writes, and a structured result. Compare with the
single agent. Stop before shared-memory or autonomous-society work.

Stop if success, latency, cost, or safety does not improve under the same
acceptance contract.

### Sources

- Wu et al., "AutoGen", arXiv v2:
  https://arxiv.org/abs/2308.08155v2
- Cemri et al., "Why Do Multi-Agent LLM Systems Fail?", arXiv v3:
  https://arxiv.org/abs/2503.13657v3
- AutoGen commit
  `027ecf0a379bcc1d09956d46d12d44a3ad9cee14`:
  https://raw.githubusercontent.com/microsoft/autogen/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-core/pyproject.toml
- Local DeepSeek Harness runtime evidence:
  [`../../source-atlas/deepseek-harness/01-entrypoints-runtime.md`](../../source-atlas/deepseek-harness/01-entrypoints-runtime.md)
- Local Claude Code L4 evidence:
  [`../../source-atlas/claude-code/02-tools-session-context.md`](../../source-atlas/claude-code/02-tools-session-context.md)

## FR-08 RSI and Self-Modification

### Core question

Can a harness safely improve its own runtime or policy, and what isolation,
evaluation, approval, and rollback conditions are prerequisites?

### Facts

- `F-FR08-01`: Darwin Godel Machine v3 modifies a coding agent's own code and
  evaluates candidate agents on coding benchmarks while maintaining an archive.
- `F-FR08-02`: The DGM repository at commit
  `a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2` warns that it executes untrusted,
  model-generated code and can behave destructively.
- `F-FR08-03`: Godel Agent v4 describes dynamic self-modification of its own
  logic and a repository that implements recursive self-improvement through
  runtime actions.
- `F-FR08-04`: The inspected DeepSeek Harness profile/patch architecture supports
  human-composed activation layers. It does not establish autonomous mutation
  of a running runtime.
- `F-FR08-05`: No shipped self-modifying runtime is established by the inspected
  Claude Code mirror evidence.

### Interpretation

- `I-FR08-01`: Self-modification turns evaluation integrity and sandboxing into
  part of the optimization target. A mutable or model-readable evaluator is a
  critical weakness.
- `I-FR08-02`: Offline harness search is a research problem, not a product
  runtime feature. It requires a frozen source snapshot, sealed tasks, isolated
  execution, and human approval.
- `I-FR08-03`: Current product scope should preserve extension points and
  observability, not add autonomous code mutation.

### Unresolved

- `U-FR08-01`: Whether reported self-improvement transfers outside the benchmark
  and model configuration used in the papers is not established.
- `U-FR08-02`: No accepted safety case exists for autonomous modification of a
  production coding-agent runtime.
- `U-FR08-03`: The relationship between self-modification, maintenance debt,
  license provenance, and user trust is unresolved.
- `U-FR08-04`: No local sandbox or evaluator seal is ready for an RSI experiment.

### Harness delta

- `DeepSeek Harness`: static composition and extension through profiles, patches,
  bundles, and tools, with human-controlled activation.
- `Claude Code`: extensibility through commands, hooks, skills, and related
  mechanisms in the inspected material, but no established self-modifying core.

### Probe

No runtime or product probe in the current horizon. Watch only until the P0
release gate is passed and a reproducible mechanism has independent evidence.

If revisited, start with offline optimization of a frozen, non-production
harness snapshot and a sealed evaluator outside the candidate's write boundary.

### Sources

- Zhang et al., "Darwin Godel Machine", arXiv v3:
  https://arxiv.org/abs/2505.22954v3
- DGM repository commit
  `a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2`:
  https://raw.githubusercontent.com/jennyzzt/dgm/a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2/README.md
- Sakana AI DGM project page:
  https://sakana.ai/dgm/
- Yin et al., "Godel Agent", arXiv v4:
  https://arxiv.org/abs/2410.04444v4
- Godel Agent repository commit
  `bbb508796be31c7140cdfc7106efd830a1324242`:
  https://raw.githubusercontent.com/Arvid-pku/Godel_Agent/bbb508796be31c7140cdfc7106efd830a1324242/README.md
- Local DeepSeek Harness provenance and runtime evidence:
  [`../../source-atlas/deepseek-harness/README.md`](../../source-atlas/deepseek-harness/README.md)

## Promotion Checklist

- Revalidate the paper version and project commit.
- Confirm the mechanism answers a pending architecture or benchmark decision.
- Add a bounded probe with a stop condition.
- Check whether a simpler runtime mechanism has equivalent evidence.
- Route any stable conclusion to the subtraction log through a separate change.
