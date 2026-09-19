# Source Provenance

## DeepSeek Harness

| Field | Value |
|---|---|
| Local path | `/Users/liuminxuan/Desktop/spool/.references/deepseek-harness` |
| Upstream | `https://github.com/deepseek-ai/deepseek-harness.git` |
| Revision | `c291e7961a515f6d7af9304e7fd1d257929aef26` |
| Revision date | 2026-09-10 |
| Revision subject | `Merge pull request #3977 from deepseek-harness/worktree/release-0.1.5-sync-master` |
| Package version | `0.1.5-rc.2` |
| Working tree | Clean at inspection time |
| Live verification | 2026-09-19: revision matched; working tree clean |
| License | MIT |
| Source scale at inspection time | 406 MB; 10,343 files |

Facts:

- The repository is an upstream Git clone with public history and documentation.
- It contains package source, tests, generation scripts, architecture documents, and Agent Notes.
- Agent Notes and package READMEs can expose design rationale that is absent from code alone.

Research rules:

- Record the exact revision when a finding is committed to the atlas.
- Check licenses and dependency obligations before reusing any implementation.
- Prefer package README, tests, Agent Notes, and source over generated summaries when they disagree.

## Claude Code Source Mirror

| Field | Value |
|---|---|
| Local path | `/Users/liuminxuan/Desktop/spool/.references/claude-code` |
| Upstream mirror | `https://github.com/didilili/claude-code-source-mirror.git` |
| Revision | `5c4f331be6f162bb2f409a2435e9b989bedfafe3` |
| Revision date | 2026-04-01 |
| Package version label | `999.0.0-restored` |
| Working tree | Dirty at inspection time; source-mirror deletions and metadata changes are present |
| Live verification | 2026-09-19: revision matched; 25 dirty entries, including 22 deletions and 3 modifications |
| License file | Not present in the inspected revision |
| Source scale at inspection time | 47 MB; 2,089 files |

Facts:

- This is a source mirror reconstructed from source maps according to its package metadata, not the official Anthropic repository.
- It is useful for behavior and implementation-mechanism analysis.
- It is not a licensed product-code source and must not be treated as one.
- Original build history, release provenance, tests, and licensing obligations are not established by this mirror.
- The live dirty state removes 22 files and modifies 3 files, including package metadata and build configuration. Atlas findings must not treat affected paths or build behavior as clean upstream evidence without checking the working copy directly.

Research rules:

- Use clean-room behavior and mechanism analysis only.
- Do not copy source, prompts, identifiers, internal feature names, or implementation text into spool.
- Cross-check important findings against observable runtime behavior and public documentation.
- Record uncertainty when a mechanism may be internal, feature-gated, incomplete, or changed in shipped versions.

## Verification Commands

```sh
git -C .references/deepseek-harness rev-parse HEAD
git -C .references/deepseek-harness status --short --branch
git -C .references/claude-code rev-parse HEAD
git -C .references/claude-code status --short --branch
```

## Related Audit

- [Dependency and license audit](dependency-and-license-audit.md)
