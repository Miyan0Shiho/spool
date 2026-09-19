# Claude Code Source Mirror Atlas

> Pinned mirror revision: `5c4f331be6f162bb2f409a2435e9b989bedfafe3`
>
> Package version label: `999.0.0-restored`
>
> Local path: `.references/claude-code`
>
> Research status: Batch 1 source map and Trace A/B/C coverage completed for the currently available mirror.

## Coverage

| Layer | Document |
|---|---|
| L0-L2: provenance, entrypoints, query/runtime | [Entrypoints and runtime](01-entrypoints-runtime.md) |
| L3-L4: tools, session, context, compaction | [Tools, session, and context](02-tools-session-context.md) |
| L5-L8: permissions, UI, extensions, operations | [Security, extensions, and operations](03-security-extensions-operations.md) |

## Trace

- [Trace A: pure model turn](../traces/trace-a-claude-code.md)
- [Trace B: repository coding turn](../traces/trace-b-claude-code.md)
- [Trace C: interrupt, failure, compaction, and recovery](../traces/trace-c-claude-code.md)

## Research rules

- This mirror is reconstructed from source maps and has no established license in the inspected revision.
- Use it only for clean-room behavior and mechanism analysis.
- Cross-check important findings against runtime behavior and public documentation.
- Do not copy source, prompts, internal identifiers, feature names, or implementation text into spool.
- Record uncertainty where build restoration, feature flags, or internal-only paths may affect the result.

## Evidence strength

The atlas uses three labels:

- **High**: complete, directly observed call chain or cross-file agreement.
- **Medium**: directly observed, but dependent on feature gates, provider/platform state, or an absent dependency.
- **Low**: inferred from comments, generated metadata, or a path that cannot be fully verified.

Every material entry separates:

- **Fact**: what the current mirror directly shows.
- **Interpretation**: the narrow meaning supported by that evidence.
- **Unresolved**: what cannot be established without tests, runtime execution, history, or official source.

## Mirror limitations

- Current worktree is dirty relative to the pinned revision.
- `bun.lock`, `readme.md`, all tracked `shims/` sources, and four `vendor/*-src` sources are deleted locally.
- `node_modules` is absent, so dependencies cannot be resolved from this mirror.
- No tests, fixtures, CI configuration, complete build lockfile, or license file are available.
- Public SDK functions in `src/entrypoints/agentSdkTypes.ts` are stubs in this restored tree.
- Many runtime branches depend on private feature flags, provider capabilities, platform support, or unavailable dependencies.
- Source presence is not treated as proof of stable product availability.

## Verification

Run from `.references/claude-code`:

```sh
git rev-parse HEAD
git status --short --branch
```

Expected revision:

```text
5c4f331be6f162bb2f409a2435e9b989bedfafe3
```

Existing source paths cited by this atlas are verified against the current worktree; the deliberately deleted paths are recorded in the mirror limitations. The dirty-state inventory is recorded in `../00-provenance/source-provenance.md` and repeated in the L0 section of `01-entrypoints-runtime.md`.
