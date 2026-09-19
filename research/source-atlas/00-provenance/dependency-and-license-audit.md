# DeepSeek Harness Dependency and License Audit

> Revision: `c291e7961a515f6d7af9304e7fd1d257929aef26`
>
> Package version: `0.1.5-rc.2`
>
> Audit date: 2026-09-19

## Fact

- The repository root is licensed under MIT in `LICENSE`.
- The root workspace declares `pnpm@11.7.0` and supports Node `^22.19.0 || >=24.0.0` in `package.json`.
- A repository-wide inventory found 298 `package.json` files at the pinned revision: 283 declare MIT, 6 declare BSD-3-Clause, and 9 do not declare a license field.
- The 6 BSD-3-Clause manifests are under `native/system` and its platform packages.
- The 9 manifests without a license field are test fixtures under `packages/typert/generator/tests/fixtures/` plus `python/sdk-runtime/package.json` and `website/package.json`.
- `scripts/verify-dsh-package-licenses.ts` enforces MIT only for workspace packages whose names match `@deepseek-ai/dsh`; it is not a complete repository or transitive-dependency license audit.
- `THIRD_PARTY_NOTICES.md` states that vendored Cordis and foundation libraries are MIT and preserve their upstream license files.
- `THIRD_PARTY_NOTICES.md` lists runtime dependencies under multiple licenses. Notable non-MIT entries include Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, and `@anthropic-ai/claude-agent-sdk`, whose notice says `SEE LICENSE IN README.md`.
- Three pnpm patches modify shipped package contents and record the changes under `patches/`.

## Interpretation

- Reusing DeepSeek Harness implementation code is legally plausible because the first-party source is MIT, but file-level and transitive dependency review is still required before copying or redistributing a subsystem.
- The repository already contains useful license-integrity tooling. Reuse should begin from that tooling rather than inventing a new policy.
- Test fixtures and non-workspace manifests must be excluded from a first-party reuse inventory unless intentionally selected.
- The `@anthropic-ai/claude-agent-sdk` dependency requires separate license review before a spool distribution includes its runtime path.

## Verification Commands

```sh
git rev-parse HEAD
git status --short --branch
rg --files -g 'package.json' | wc -l
rg -l '"license": "MIT"' --glob 'package.json' | wc -l
rg -n '"license": "(?!MIT)[^"]+"' --pcre2 --glob 'package.json'
pnpm run verify-dsh-package-licenses
```

## Unresolved

- `pnpm run verify-dsh-package-licenses` was not executed because `node_modules` is absent at audit time.
- The full transitive npm and Python license closure has not been materialized into this atlas.
- No selected spool reuse boundary exists yet, so a component-level license decision cannot be completed.
- The patch obligations and redistribution requirements for packaged desktop artifacts have not been audited.
