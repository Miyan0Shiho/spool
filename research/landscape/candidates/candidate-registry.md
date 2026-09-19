# External Candidate Registry

> Purpose: maintain a broad research map while keeping deep dives selective.
>
> Current external facts must be revalidated before a candidate is promoted to a deep-research batch.
>
> Status describes this research pass only. `queued` does not remove a
> candidate; a later deep dive still requires current source, version, and
> maintenance revalidation.

## Candidate categories

| ID | Category | Candidate examples | Unique question | Status | Latest evidence |
|---|---|---|---|---|---|
| CAND-001 | CLI agents | Codex, Aider, OpenCode, Goose, OpenHands | How do local agent runtimes differ in loop, tools, safety, and UX? | adjacent expansion abandoned; existing light scan retained | [`runtime-paradigm-scan.md`](../products/runtime-paradigm-scan.md) |
| CAND-002 | IDE agents | Cline, Roo Code, Continue, Cursor-class products | How does editor state change task lifecycle and approval design? | adjacent expansion abandoned | None |
| CAND-003 | Cloud/remote agents | OpenHands, Devin-class products, remote execution services | Which execution, persistence, and collaboration problems require a remote runtime? | adjacent expansion abandoned; existing scan retained | [`runtime-paradigm-scan.md`](../products/runtime-paradigm-scan.md) |
| CAND-004 | Agent APIs/SDKs | OpenAI Agent SDK, Claude Agent SDK, provider SDKs | What belongs in an SDK contract versus an interactive product? | light scan retained; adjacent-source deep dive abandoned | [`extensions-and-product-surfaces.md`](../../comparisons/extensions-and-product-surfaces.md) |
| CAND-005 | Tool protocols | MCP, ACP, A2A, OpenAPI-based bridges | Which interoperability seam should spool own or consume? | light scan complete | [`mcp-acp-a2a-boundaries.md`](../protocols/mcp-acp-a2a-boundaries.md) |
| CAND-006 | Sandbox/runtime | OS sandboxes, containers, microVMs, remote sandboxes | What is the viable safety, portability, and performance envelope? | architecture scan complete; experiments queued | [`security-and-execution-models.md`](../../comparisons/security-and-execution-models.md) |
| CAND-007 | Evaluation | SWE-bench, Terminal-Bench, OSWorld, agent trajectory benchmarks | How should task success, recovery, cost, and safety be measured? | specification complete; execution queued | [`fixed-task-suite.md`](../benchmarks/fixed-task-suite.md) |
| CAND-008 | Agent research | context engineering, memory, planning, verification, tool learning, multi-agent systems | Which mechanisms generalize beyond one product implementation? | light scan complete | [`mechanism-notes.md`](../papers/mechanism-notes.md) |
| CAND-009 | Self-improvement | RSI, self-modifying agents, automated harness optimization | What evidence exists, and what risks or prerequisites remain? | watch | [`2026-09-current-mechanism-radar.md`](../../frontier-radar/2026-09-current-mechanism-radar.md) |
| CAND-010 | Product surfaces | TUI, IDE, Desktop, Web, mobile/remote task products | Which shell best exposes the coding-agent core without distorting it? | adjacent expansion abandoned; product breadth remains out of P0 | [`extensions-and-product-surfaces.md`](../../comparisons/extensions-and-product-surfaces.md) |

## Abandoned Adjacent-Source Expansion

On 2026-09-19, the adjacent open-source harness expansion was abandoned. No
candidate from this pass is promoted, queued, or approved for follow-up work.

Historical evidence:

- [`open-source-harness-radar-2026-09.md`](open-source-harness-radar-2026-09.md)
- [`codex-and-china-agent-open-source-2026-09.md`](codex-and-china-agent-open-source-2026-09.md)

The closure rule is:

- no additional open-source harness downloads merely to broaden perspective;
- no probes derived only from this comparison;
- no P0/P1 scope change from these documents;
- reopen only for a concrete P0 blocker that the two core sources cannot
  answer.

## Promotion criteria

A candidate enters deep research only when it:

1. Answers a question that the two core source trees do not answer sufficiently.
2. Has primary evidence such as source, a specification, a paper, tests, or reproducible behavior.
3. Represents a materially different architecture, execution model, safety model, or product form.
4. Can be studied within a bounded batch and connected to a pending spool decision.

## Candidate record

Use [the evidence template](../../templates/evidence-entry.md) for every promoted candidate.
