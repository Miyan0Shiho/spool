# Cross-Product Security and Execution Models

> Status: Batch 3 candidate research
>
> Date: 2026-09-19
>
> Scope: DeepSeek Harness L5, Claude Code permission/sandbox mechanisms, and representative local process, OS sandbox, container, microVM, and remote-sandbox models.
>
> Decision boundary: this document does not change P0 scope or the subtraction log. Candidate mechanisms remain `probe` or `watch` until experiments justify a decision.

## 1. Evidence Baseline

Every material fact below ends with one or more source IDs from this table. Facts, interpretations, and unresolved questions are labeled separately.

| ID | Version / revision | Evidence |
|---|---|---|
| S1 | DeepSeek Harness `0.1.5-rc.2`, `c291e7961a515f6d7af9304e7fd1d257929aef26` | [Source provenance](../source-atlas/00-provenance/source-provenance.md#deepseek-harness), clean upstream Git clone |
| S2 | DeepSeek Harness `c291e796` | `docs/subsystems/tools.md:172`, `docs/subsystems/tools.md:376`, `packages/core/tools/README.md:103`, `packages/core/tools/src/index.ts:1366` |
| S3 | DeepSeek Harness `c291e796` | `docs/subsystems/approval.md:5`, `packages/interaction/user-approval/src/index.ts:47`, `packages/interaction/user-approval/src/types.ts:28` |
| S4 | DeepSeek Harness `c291e796` | `docs/subsystems/sandbox.md:5`, `packages/sandbox/sandbox/src/index.ts:23`, `packages/sandbox/sandbox/src/escalation.ts:22` |
| S5 | DeepSeek Harness `c291e796` | `packages/sandbox/sandbox-local/README.md:12`, `packages/sandbox/sandbox-local/src/index.ts:150`, `packages/sandbox/sandbox-local/src/profiles.ts:16`, real backend tests under `packages/sandbox/sandbox-local/tests/` |
| S6 | DeepSeek Harness `c291e796` | `packages/fs/fs-sandbox/README.md:10`, `packages/fs/fs-sandbox/src/index.ts:1`, `packages/fs/fs-sandbox/src/containment.ts:46` |
| S7 | DeepSeek Harness `c291e796` | `docs/subsystems/permission-presets.md:5`, `packages/interaction/permission-presets/src/index.ts:143` |
| S8 | DeepSeek Harness `c291e796` | `packages/e2b/e2b/README.md:5`, `packages/e2b/subprocess-e2b/README.md:5`, `packages/e2b/fs-e2b/README.md:5` |
| S9 | Claude Code source mirror `999.0.0-restored`, `5c4f331be6f162bb2f409a2435e9b989bedfafe3` | [Source provenance](../source-atlas/00-provenance/source-provenance.md#claude-code-source-mirror), reconstructed mirror with no established license and a dirty worktree |
| S10 | Claude Code mirror `5c4f331` | `src/types/permissions.ts:16`, `src/types/permissions.ts:44`, `src/types/permissions.ts:54`, `src/types/permissions.ts:271` |
| S11 | Claude Code mirror `5c4f331` | `src/utils/permissions/permissions.ts:473`, `src/utils/permissions/permissions.ts:1157`, `src/utils/permissions/permissionSetup.ts:91`, `src/utils/settings/constants.ts:3` |
| S12 | Claude Code mirror `5c4f331` | `src/utils/permissions/filesystem.ts:53`, `src/utils/permissions/filesystem.ts:667`, `src/utils/permissions/filesystem.ts:1205`, `src/utils/permissions/pathValidation.ts:322`, `src/utils/permissions/pathValidation.ts:373` |
| S13 | Claude Code mirror `5c4f331` | `src/utils/sandbox/sandbox-adapter.ts:172`, `src/utils/sandbox/sandbox-adapter.ts:447`, `src/entrypoints/sandboxTypes.ts:88`, `src/tools/BashTool/shouldUseSandbox.ts:18` |
| S14 | Claude Code mirror `5c4f331` | `src/hooks/toolPermission/permissionLogging.ts:178`, `src/services/tools/toolExecution.ts:173`, `src/Tool.ts:258` |
| S15 | POSIX.1-2024 online edition, accessed 2026-09-19 | [exec](https://pubs.opengroup.org/onlinepubs/9799919799/functions/exec.html) |
| S16 | macOS 15.2 build `24C101`, local `sandbox-exec(1)` man page dated 2017-03-09 | Local command: `man sandbox-exec`; command is present at `/usr/bin/sandbox-exec` and marked deprecated |
| S17 | Current Linux kernel documentation, accessed 2026-09-19 | [Landlock](https://docs.kernel.org/userspace-api/landlock.html), [seccomp](https://docs.kernel.org/userspace-api/seccomp_filter.html), [namespaces](https://docs.kernel.org/admin-guide/namespaces/index.html) |
| S18 | OCI Runtime Specification `v1.3.0`, released 2025-11-04 | [config](https://raw.githubusercontent.com/opencontainers/runtime-spec/v1.3.0/config.md), [Linux config](https://raw.githubusercontent.com/opencontainers/runtime-spec/v1.3.0/config-linux.md) |
| S19 | Docker documentation commits `b398f346a7e38451cacda1cfe54f1697d2685cdc` and `2d7809c7a74ba1e99609a44f421a15cbf8a4a4bc` | [Engine security](https://raw.githubusercontent.com/docker/docs/b398f346a7e38451cacda1cfe54f1697d2685cdc/content/manuals/engine/security/_index.md), [rootless mode](https://raw.githubusercontent.com/docker/docs/2d7809c7a74ba1e99609a44f421a15cbf8a4a4bc/content/manuals/engine/security/rootless/_index.md) |
| S20 | Firecracker `v1.17.0`, released 2026-09-10 | [Design document](https://raw.githubusercontent.com/firecracker-microvm/firecracker/v1.17.0/docs/design.md) |
| S21 | E2B docs page modified 2026-09-02, accessed 2026-09-19 | [Sandbox lifecycle](https://docs.e2b.dev/sandbox.md), [secured access](https://docs.e2b.dev/sandbox/secured-access.md) |
| S22 | Modal current docs, accessed 2026-09-19 | [Sandboxes](https://modal.com/docs/guide/sandbox), [networking](https://modal.com/docs/guide/sandbox-networking), [VM sandboxes](https://modal.com/docs/guide/vm-sandboxes) |
| S23 | Current development machine | macOS 15.2, arm64, Darwin 24.2.0; `sandbox-exec` present; `bwrap`, Docker, Podman, and Firecracker not installed |

## 2. Scope Model

**Fact:** The security problem should be separated into three layers:

1. Decision policy: whether a requested action may proceed, must ask, or must be denied.
2. Execution enforcement: whether filesystem, process, network, privilege, and resource access are actually confined.
3. Audit: what request, policy, approval, backend, effective enforcement, result, and failure were recorded.

DeepSeek Harness explicitly separates tool policy, approval, sandbox policy, and sandbox enforcement [S2][S3][S4]. Claude Code also has distinct permission rules, permission modes, path checks, and an external sandbox runtime [S10][S11][S13].

**Interpretation:** A single boolean named `sandboxed` is insufficient. Spool needs requested policy, effective provider, enforcement completeness, and failure reason as separate facts.

## 3. Permission Decision Matrix

| Dimension | DeepSeek Harness | Claude Code | Cross-product implication |
|---|---|---|---|
| Primary decision vocabulary | `allow`, `deny`, `ask`; approval outcomes are `allowed-once`, `rejected`, `cancelled`, `unavailable` [S2][S3] | `allow`, `deny`, `ask`, plus `passthrough` internally; user-visible modes include `default`, `plan`, `acceptEdits`, `dontAsk`, and `bypassPermissions` [S10][S11] | Keep behavior and mode separate. A mode selects policy; the final decision remains allow/ask/deny. |
| Policy placement | Reorderable `tools/pre-execute` waterfall, then monotonic guards that can only reduce permission [S2] | Tool-specific `checkPermissions`, global rules, hooks, modes, and safety checks [S11][S12] | The tool body must never be the only enforcement point. |
| Rule sources and precedence | Deployment plugins own policy; guard output is final and monotonically restrictive [S2] | User, project, local, flag, managed, CLI, command, and session sources; later setting sources override earlier ones when constructing rules [S10][S11] | Persist rule source and precedence. Do not serialize a merged rule without provenance. |
| Default behavior | The sandbox policy owner defaults to `read-only`; when the preset service is mounted, its default preset is `workspace-write` plus `ask` [S4][S7] | `default` permission mode; ordinary unknown paths/tools normally become `ask` [S10][S11][S12] | spool should make composition defaults explicit because the effective default changes with mounted extensions. |
| Explicit deny | A pre-execute denial or final guard denial prevents dispatch [S2] | Explicit deny rules are checked before allow paths; some safety checks and content-specific asks are bypass-immune [S11][S12] | `bypass` must not erase deny rules. Emergency bypass needs a narrower, auditable override. |
| User approval | `ask` maps to `allowed-once` or denial; missing approval service or agent fails closed [S2][S3] | Permission UI, hooks, SDK prompt tools, classifiers, or mode transformations resolve `ask` [S11] | One-shot grants should carry call identity and exact scope. |
| Persistence | `approval/policy`, `sandbox/mode`, and `permission/preset` are durable session events; approval ask/decision pairs are durable log-only events [S3][S7] | Rules can persist to user/project/local settings or remain session scope; permission decisions are stored in in-memory tool context and exported to analytics/OTel [S10][S14] | Durable local audit should not depend on telemetry. |
| Sandbox interaction | Tool policy asks, escalation asks, and sandbox enforcement are separate; only `allowed-once` permits a wider one-shot retry [S3][S4] | A sandboxed Bash command can be auto-allowed before ordinary ask rules when configured; excluded or unsandboxed commands return to normal permission handling [S11][S13] | Auto-allow based on confinement must know that confinement is actually active. |
| Fail-closed posture | Missing approval answerer, missing agent, invalid answer, unavailable sandbox backend, or runner failure cannot silently proceed [S3][S4][S5] | Missing sandbox dependencies normally disable sandbox and run commands unsandboxed unless `failIfUnavailable` is set; `dontAsk` converts ask to deny [S11][S13] | Spool must choose fail-closed separately for safety policy and optional isolation. Do not inherit a fail-open default accidentally. |

### 3.1 DeepSeek Harness Decision Facts

**Fact:** A tool may return `ask`; approval proceeds only on `allowed-once`. `rejected`, `cancelled`, and `unavailable` become denials [S2][S3].

**Fact:** A missing or throwing approval answerer becomes `unavailable`, not an implicit allow [S3].

**Fact:** `never` deterministically rejects asks before the answerer waterfall and cannot be bypassed by a later prepended listener [S3].

**Fact:** Sandbox escalation is strictly wider than the current mode, requires a non-empty justification and approval, and grants only the exact retry call [S4].

**Fact:** If a confined mode has no usable backend, `SandboxUnavailableError` is thrown instead of silently running unconfined [S4][S5].

**Fact:** The default sandbox-policy mode is `read-only`; the optional preset service's default preset is `workspace-write` plus `ask` [S4][S7].

**Interpretation:** DeepSeek Harness provides stronger primitives for deterministic fail-closed approval and enforcement, but danger semantics remain deployment policy. The core does not need to classify every command if a plugin supplies the decision and the enforcement layer reports its real boundary.

### 3.2 Claude Code Decision Facts

**Fact:** User-addressable modes include `default`, `plan`, `acceptEdits`, `dontAsk`, and `bypassPermissions`; `auto` is feature-gated [S10].

**Fact:** Permission rules carry a source and behavior. Rule sources include user, project, local, flag, managed, CLI, command, and session [S10].

**Fact:** Deny rules, content-specific ask rules, and sensitive-path safety checks can prevent later blanket allow paths from taking effect [S11][S12].

**Fact:** In `dontAsk`, an `ask` result is converted to `deny` at the final transformation layer [S11].

**Fact:** Dangerous allow-rule patterns are removed for auto mode when they would auto-allow interpreters, package runners, shells, remote command wrappers, or subagent spawning. The inspected list includes `python`, `node`, `npx`, `npm run`, shells, `ssh`, `sudo`, `eval`, `exec`, `env`, and `xargs`; some network and cloud entries are internal-only [S11].

**Fact:** Destructive-command warnings for Git history loss, recursive deletion, databases, Kubernetes, and Terraform are explicitly informational only and do not change permission logic [S12].

**Fact:** `excludedCommands` is explicitly documented in source as a convenience feature, not a security boundary [S13].

**Fact:** By default, sandbox-enabled can still become unsandboxed if dependencies are missing; `failIfUnavailable` changes startup to a hard error [S13].

**Interpretation:** Claude Code's product model is stronger at granular rules, modes, workspace paths, and no-prompt workflows. Its execution isolation is broader than DeepSeek Harness's current L5 vocabulary because it includes read and network policy, but its default availability behavior is not fail-closed.

## 4. Dangerous Command Classification

### 4.1 Observed Classification Approach

**Fact:** DeepSeek Harness exposes pre-execute policy, final guards, and sandbox denial markers, but the inspected core packages do not provide a single built-in semantic dangerous-command list [S2][S4].

**Fact:** Claude Code contains several distinct mechanisms:

- Arbitrary-code allow-rule detection for auto mode [S11].
- Bash parsing and safety validators for malformed, obfuscated, expansion-heavy, or misparsed input [S12].
- Dangerous removal paths such as root, home, wildcard deletion, direct children of root, and Windows drive roots [S12].
- Sensitive files and directories including `.git`, `.claude`, `.vscode`, `.idea`, shell profiles, `.mcp.json`, and related configuration [S12].
- Informational destructive-command warnings [S12].

**Interpretation:** Spool should not equate "matched a dangerous regex" with "final decision." Classification, policy, approval, and execution enforcement are separate outputs.

### 4.2 Proposed Risk Families

The following table is an interpretation and candidate taxonomy, not a decision.

| Family | Representative operations | Candidate default | Why it cannot be filesystem-only |
|---|---|---|---|
| Reversible workspace edit | Create, edit, rename inside canonical workspace | `allow` under writable workspace policy | A kernel path fence can enforce containment. |
| Destructive workspace operation | Recursive delete, overwrite, bulk replacement, history-discarding Git operation | `ask` unless an exact session grant exists | The target is inside the workspace, but loss is irreversible or costly. |
| Repository safety bypass | Force push, hard reset, clean, hook bypass, branch force-delete | `ask` | Remote state and hooks are outside ordinary file-write risk. |
| Privilege and system control | `sudo`, service control, process kill, mount, kernel/device access | `deny` by default, explicit elevated mode only | File sandboxing does not remove process or privilege authority. |
| Credential and security configuration | SSH keys, cloud credentials, shell profiles, agent settings, MCP configuration | `ask` or `deny` by default | Read access can leak secrets even when writes are denied. |
| Network access and exfiltration | Download, upload, callbacks, package fetches, tunnel creation | policy-dependent `allow`/`ask`; stricter for remote writes | Filesystem policy alone leaves network open in DeepSeek Harness. |
| Code interpreter and package execution | `python`, `node`, `npx`, package scripts, shell wrappers | `ask` unless a trusted project/runtime policy permits it | An allowed interpreter can reinterpret any prior static check. |
| Remote and infrastructure control | SSH, cloud CLIs, Kubernetes, Terraform, database administration | `ask` or `deny` by default | The effect boundary is an external account or production system. |
| Sandbox/control-plane manipulation | Disable sandbox, edit policy, alter authorization, bypass approval | `deny` by default, with narrowly audited operator override | The action attacks the enforcement system itself. |

**Unresolved:** The optimal classifier is not a simple regex union. It needs parsed commands where possible, explicit uncertainty, and enforcement facts from the selected provider.

## 5. Workspace Boundary

### 5.1 DeepSeek Harness

**Fact:** A normal sandboxed call derives `workspaceRoot` from the session's immutable canonical `cwd`; the configured root is only the fallback for agentless calls or a session without `cwd` [S4][S5].

**Fact:** `workspace-write` allows writes under the workspace and backend-defined temporary roots. `read-only` denies every mutation except required sinks such as `/dev/null` [S4][S5].

**Fact:** Reads are not confined by the filesystem sandbox; `SandboxedFileSystem` passes reads through unchanged [S6].

**Fact:** The filesystem fence canonicalizes immediately before mutation and uses filesystem identity as a fallback for aliases. A residual resolve-to-syscall TOCTOU remains and is explicitly accepted for this threat model [S6].

**Fact:** Bash sandboxing and filesystem mutation policy share one writable-root policy, but the filesystem fence is trusted-code policy while shell confinement is the kernel-grade boundary for untrusted code [S6].

**Interpretation:** DeepSeek Harness has a strong write boundary and a weaker read/network boundary. Spool must not describe its `workspace-write` mode as a full security sandbox.

### 5.2 Claude Code

**Fact:** The working-directory set includes the original cwd plus explicitly added working directories. Both input paths and working roots are resolved before containment checks [S12].

**Fact:** Writes outside allowed working directories normally become `ask`; session sandbox write allowlists can make explicitly configured writable directories available without an extra prompt [S12].

**Fact:** Sensitive files and directories are protected before general allow rules, with an explicit session-scoped exception path for narrowly scoped `.claude` skill editing [S12].

**Fact:** The sandbox runtime receives separate read, write, deny-read, deny-write, network-domain, Unix-socket, and local-binding settings [S13].

**Fact:** Claude Code automatically adds the cwd and a Claude temp directory to writable roots, but denies writes to settings files and skill directories to prevent sandbox escape [S13].

**Fact:** The sandbox adapter contains explicit defenses against planted bare Git repository files that could cause an unsandboxed Git operation to execute repository-controlled hooks or fsmonitor behavior [S13].

**Interpretation:** Claude Code treats workspace boundaries as both a user-area policy and an escape-prevention problem. Spool should include product configuration and executable control files inside the boundary model, not only project source files.

## 6. Fail-Closed Conditions

| Condition | DeepSeek Harness | Claude Code | Required spool behavior |
|---|---|---|---|
| Approval required, no answerer | Resolve `unavailable`, then deny [S3] | Depends on mode and host; `dontAsk` denies, prompt-capable hosts wait or resolve [S11] | Deny or explicit deterministic auto-policy. Never treat absence as allow. |
| Approval rejected/cancelled | Deny with distinct reason [S2][S3] | User rejection/abort ends or aborts according to tool flow [S14] | Preserve reason and call identity in audit. |
| Sandbox backend unavailable | Throw `SANDBOX_UNAVAILABLE`, no silent passthrough [S4][S5] | Warning plus unsandboxed execution by default; hard failure only with `failIfUnavailable` [S13] | Do not silently downgrade a safety-required policy. |
| Sandbox backend reports partial enforcement | Surface `partial`; callers may reject if absolute boundary is required [S4][S5] | Capability profile is provider-owned; no universal full/partial result was found in the mirror adapter [S13] | Carry `full`/`partial`/`unknown` explicitly into policy. |
| Sandbox runner fails before command | Distinguish runner failure from command denial [S4][S5] | Sandbox runtime failure behavior is delegated to the external runtime and not fully established by the mirror [S13] | Mark the command as not run and fail closed. |
| Explicit unsandboxed command | Only after a wider-mode one-shot approval [S4] | Allowed when `allowUnsandboxedCommands` permits it; excluded commands bypass sandbox by design but are not a security boundary [S13] | Require a separate, audited execution mode with its own policy. |
| Policy or rule cannot be parsed | Depends on the plugin decision; invalid durable events can be rejected by invariants [S2][S3] | Multiple malformed or ambiguous shell/path cases return `ask`, deny, or safety-check results [S11][S12] | Invalid security state must not degrade to allow. |
| Enforcement fact missing | Provider result includes enforcement for confined runs; tests assert it [S4][S5] | The adapter exposes the external runtime's config, but this mirror does not define a universal enforcement report [S13] | Spool should treat missing enforcement as `unknown`, not `full`. |

## 7. Sandbox Interface Boundary

### 7.1 DeepSeek Harness

**Fact:** `ctx.sandbox.confine(argv, policy)` wraps exact argv and returns replacement argv, enforcement completeness, denial signatures, and runner-failure rules [S4].

**Fact:** Containers, microVMs, and remote execution are described as sibling replacements for the surrounding capability seam, not alternate implementations behind the local same-world `ctx.sandbox` provider [S4].

**Fact:** The local provider chooses bwrap, Landlock, Seatbelt, or Windows ACL according to platform and probes, then reports `full` or `partial` enforcement [S5].

**Fact:** bwrap adds a read-only host root, private PID namespace, procfs, and ephemeral temp; Landlock grants read-only root plus limited read-write paths; Seatbelt uses a deny-write profile with allow-listed roots [S5].

### 7.2 Claude Code

**Fact:** `SandboxManager` wraps an external sandbox runtime with Claude-specific settings, lifecycle, settings reload, dependency checks, and cleanup [S13].

**Fact:** Its runtime config includes filesystem allow/deny and network domain/socket/local-binding controls [S13].

**Fact:** Sandboxing can be disabled by settings, unsupported platform, missing dependencies, or platform allowlist; the UI emits a warning unless hard-fail is configured [S13].

### 7.3 Candidate Spool Boundary

This interface is a candidate, not a P0 decision.

`ExecutionPolicy` should describe:

- Session and workspace identity.
- Exact argv or operation identity.
- Canonical workspace root and optional read/write roots.
- Filesystem read, write, create, delete, and metadata policy.
- Network allow/deny policy, including domains, CIDRs, local binding, and Unix sockets where supported.
- Process visibility and descendant-control policy.
- User, group, capability, privilege, and `no-new-privileges` policy.
- Explicit environment allowlist and credential handles. Do not pass the full host environment by default.
- CPU, memory, process, file-size, wall-time, and output limits.
- Cancellation and cleanup semantics.

`ExecutionGrant` should report:

- Provider and backend version.
- Requested policy and effective policy.
- `full`, `partial`, or `unknown` enforcement per dimension, not one blended score.
- Provider-specific limitations and reasons.
- Process/job identity and state.
- Whether the operation executed, was denied before execution, or failed in the runner.

**Interpretation:** Spool should reserve one multi-dimensional policy interface from day one, even if P0 initially implements only local process and one OS-sandbox backend.

## 8. Audit Record

### 8.1 DeepSeek Harness

**Fact:** Approval requests append paired `approval/asked` and `approval/decided` events to the session log. The events are log-only and do not enter model history [S3].

**Fact:** An approval request carries a request ID, agent/session ownership, tool name, optional exact call ID, optional human-readable reason, and cancellation signal [S3].

**Fact:** Sandbox mode and permission preset changes are durable session events, allowing replay to reconstruct policy [S3][S7].

**Fact:** Tool results can carry sandbox mode, denial, enforcement, and runner-failure facts [S4][S5].

### 8.2 Claude Code

**Fact:** Permission approval/rejection is fanned out to analytics, OTel, code-edit counters, and an in-memory `toolDecisions` map [S14].

**Fact:** The OTel `tool_decision` event records decision, source, and sanitized tool name. It does not establish a durable local record of the full command or effective sandbox policy [S14].

**Fact:** Sandbox violations are available through a sandbox violation store and are surfaced in stderr/UI, but the mirror does not establish a complete durable audit log for every denied action [S13][S14].

### 8.3 Candidate Audit Minimum

The candidate record should include:

- Event and correlation IDs: session, turn, tool call, approval, execution, parent job.
- Actor: user, agent, subagent, automation, or service identity.
- Requested action: operation type, exact argv or structured edit target, canonical paths, and argument digest.
- Policy: rule/source, mode, risk classification, and whether the decision came from user, rule, hook, classifier, or fail-closed default.
- Approval: request time, decision, one-shot/permanent scope, persistence destination, and reason.
- Execution: provider, backend version, requested/effective policy, enforcement per dimension, start/end, exit, signal, and runner-failure classification.
- Effects: files changed, processes started, network policy observed, output artifact paths, and hashes where available.
- Redaction: secret-safe references instead of raw credentials, with a documented redaction policy.

**Interpretation:** Audit must be append-only and independent of analytics consent. Product telemetry can be derived from audit, but audit correctness must not depend on telemetry delivery.

## 9. Execution Environment Comparison

| Environment | Isolation boundary | Filesystem / network / process | Cost and startup | Portability | Persistence and recovery | Main failure mode |
|---|---|---|---|---|---|---|
| Local trusted process | OS user identity and ordinary kernel permissions only | Full process authority; filesystem, network, environment, and readable secrets are host-visible unless separately restricted; `execve` replaces the process image and inherits many process attributes [S15] | Near-zero setup; no image or runtime service [S15] | Broadest platform portability | No inherent snapshot; cancellation depends on process-tree management | One policy bug or overbroad allow becomes a host-level effect |
| OS sandbox | Kernel policy around a host process, such as Seatbelt, Landlock, seccomp, or namespaces | Dimension-dependent. DeepSeek Harness covers file effects only; bwrap also provides private PID space and ephemeral temp. Claude Code adds filesystem and network configuration around its external runtime [S4][S5][S13][S16][S17] | Low setup and startup; backend availability and kernel version dominate [S5][S16][S17] | Platform-specific. macOS Seatbelt is deprecated; Linux features depend on kernel ABI; Windows ACL is partial [S5][S16][S17] | Shares host state. Some temp roots are ephemeral; others expose host temp directories [S5] | Silent fallback if availability is not checked; hidden gaps when enforcement is partial |
| Container | Rootfs, mounts, namespaces, cgroups, capabilities, and optional LSM/seccomp profiles; shares the host kernel [S18][S19] | Strong process, mount, PID, network, user, and resource separation when configured. Bind mounts can expose host paths; rootful Docker daemon is a major control-plane attack surface [S18][S19] | No per-command VM boot, but image, runtime, and daemon setup; higher operational burden than OS sandbox | Primarily Linux. macOS requires a separate VM backend and does not run Linux containers natively | Images, volumes, exported filesystems, or pause/checkpoint mechanisms can persist state, but the OCI runtime spec alone does not provide a session snapshot model | Misconfigured mounts, privileged containers, exposed daemon API, or shared kernel vulnerabilities |
| MicroVM | Hardware virtualization and guest kernel boundary; Firecracker uses KVM and recommends the jailer, seccomp, cgroups, and privilege dropping [S20] | Guest has its own kernel and virtual devices. Firecracker does not perform network filtering; host networking must enforce policy [S20] | Higher per-instance setup and host requirements than OS sandbox; still designed for fast, dense microVM creation [S20] | Linux/KVM host and guest specific | Root block devices can persist; pause/snapshot availability depends on the surrounding platform | Operational complexity, networking integration, image/kernel management, and host resource limits |
| Remote sandbox | Provider-managed isolated VM or container boundary plus authenticated control plane | Filesystem and process run away from the host. E2B describes an isolated Linux VM with lifecycle and secure access token. Modal describes secure containers, configurable outbound allowlists, and optional VM-backed sandboxes [S8][S21][S22] | Adds network latency and provider startup; E2B can pause/resume and retain full state; Modal offers snapshots, resources, and network policy [S21][S22] | Requires provider credentials, network connectivity, compatible templates/images, and data-residency review | E2B supports pause/resume and finite runtime windows; DeepSeek Harness's E2B implementation is explicitly ephemeral and POC-limited [S8][S21] | Authentication, credential leakage, network egress, provider outage, data residency, remote state loss, and split-brain host/sandbox files |

### 9.1 Platform Facts That Matter for spool

**Fact:** macOS `sandbox-exec` is deprecated but present on the current macOS 15.2 machine. Its profile language is not the public App Sandbox API [S16].

**Fact:** Landlock restricts ambient filesystem access and is enabled by the running kernel; enforcement depends on the kernel ABI [S17].

**Fact:** seccomp restricts system calls; sandbox designs must correctly handle architecture, syscall arguments, and notification behavior [S17].

**Fact:** Linux namespaces isolate global resources such as PID, network, mount, IPC, user, cgroup, and time; unspecified namespace types inherit from the runtime namespace [S17][S18].

**Fact:** OCI containers can configure capabilities, `noNewPrivileges`, AppArmor/SELinux, cgroups, mounts, and namespaces, but the spec describes mechanisms rather than a safe default profile [S18].

**Fact:** Docker's engine documentation describes namespaces and cgroups as core isolation mechanisms and warns that the rootful daemon has a significant control-plane attack surface. Rootless mode runs both daemon and containers in a user namespace [S19].

**Fact:** Firecracker's guest network egress should be filtered at the host level because Firecracker itself does not filter network traffic [S20].

**Fact:** DeepSeek Harness's E2B package excludes host environment variables and credential-shaped names by default, but it keeps harness/session state on the host. Its `cwd` is a resolution convention, not containment, and network policy comes from the base image [S8].

**Fact:** E2B secure access defaults on in SDK `v2.0.0+`; direct controller access requires an access token. Disabling it is documented as increasing risk [S21].

**Fact:** Modal Sandboxes allow outbound public connections by default; policy can be blocked, CIDR-allowlisted, or domain-allowlisted. VM-backed sandboxes are a separate runtime option [S22].

## 10. Candidate Spool Model

This section proposes mechanisms for experiments. It does not change P0.

### 10.1 Policy Model

- Keep permission decision, approval grant, and execution enforcement as separate data.
- Use `allow`, `ask`, `deny`, plus explicit `unavailable` and `cancelled` outcomes.
- Make `allowed-once` the default approval grant. Permanent grants must name scope, source, and revocation path.
- Evaluate deny and safety rules before blanket allow rules or mode fast paths.
- Persist policy source and precedence, not only the final decision.
- Require risk classification to return uncertainty rather than pretending parsed confidence.

### 10.2 Execution Model

- Use one `ExecutionProvider` contract for local process, OS sandbox, container, microVM, and remote execution.
- Negotiate capabilities and report per-dimension enforcement. Missing capability means unsupported, not implicitly allowed.
- Keep workspace canonicalization, environment allowlisting, credential handles, cancellation, and audit context outside provider-specific code.
- Represent explicit unsandboxed execution as a distinct mode. It should not be an invisible provider fallback.
- Treat network and process visibility as first-class policy dimensions even if P0 initially leaves them unrestricted.

### 10.3 Candidate Default Posture

- Prefer the strongest available local OS sandbox for shell execution on macOS/Linux when the selected product mode requires confinement.
- If confinement is required and unavailable, deny or require an explicit user-approved unsandboxed execution. Do not silently downgrade.
- If confinement is optional, display `not enforced` in the execution result and audit record.
- Keep destructive workspace operations, privilege escalation, credential access, remote infrastructure control, and policy modification in separate risk classes from ordinary file edits.
- Never let a failed classifier, missing backend, malformed policy, or missing audit sink become an allow.

## 11. Minimum Experiments

### E1: macOS Seatbelt Boundary

Question: Which file effects are actually blocked for spool-style read-only and workspace-write policies?

Method: Reuse the DeepSeek Harness Seatbelt test shape on macOS 15.2: read-only write denial, `/dev/null` allowance, host temp behavior, inside/outside workspace writes, symlink swaps, hard links, and network reachability.

Exit criteria: Produce a capability matrix with per-dimension `full`/`partial`/`unknown`, not a binary result.

### E2: Linux OS-Sandbox Parity

Question: Can one policy map to bwrap and Landlock without hidden semantic drift?

Method: Run the same write, temp, PID visibility, procfs escape, descendant-control, and network probes on a pinned Linux VM.

Exit criteria: Record differences in denial dialect, ephemeral temp, PID visibility, network, and partial Landlock enforcement.

### E3: Dangerous Command Corpus

Question: Which risk classes can be identified with acceptable false-positive and false-negative rates?

Method: Build a versioned corpus across destructive filesystem, Git history, privilege, credential, network, interpreter/package, remote/cloud, database, and sandbox-policy manipulation. Compare AST parsing, shell-free structured requests, and conservative regex fallback.

Exit criteria: Freeze precision, recall, ask-rate, and bypass-rate thresholds before implementation.

### E4: Workspace Escape and TOCTOU

Question: Which path checks need a kernel boundary rather than trusted-code canonicalization?

Method: Test `..`, symlink ancestors, symlink swaps, hard links, case aliases, Windows short names, network mounts, and deletion followed by recreating a path.

Exit criteria: Separate policy-only checks from kernel-enforced guarantees and record residual races.

### E5: Process Tree and Cancellation

Question: Can spool reliably terminate foreground and background work without leaving descendants?

Method: Test direct child, shell child, detached process, process group, remote job, and sandbox-runner failures with graceful and forced termination.

Exit criteria: Prove quiescence or report the exact residual process identity.

### E6: Container Boundary and Cost

Question: When does an OCI container materially improve safety or reproducibility over an OS sandbox?

Method: Compare bind-mount exposure, network control, resource limits, rootless/rootful operation, cold/warm start, image cache, reproduction, and failure recovery.

Exit criteria: Measure whether the boundary improvement justifies daemon and image operations for the intended task class.

### E7: MicroVM Boundary and Operations

Question: Which threat model actually requires a guest-kernel boundary?

Method: Evaluate Firecracker jailer setup, image/kernel lifecycle, network filtering, start time, resource overhead, snapshot support, and host portability.

Exit criteria: Identify a workload class where OS sandbox and container isolation are demonstrably insufficient.

### E8: Remote Sandbox Trust Boundary

Question: What must remain on the host, and what can safely move remotely?

Method: Test authentication, token scope, environment scrubbing, credential injection, network policy, host/remote file synchronization, pause/resume, provider outage, and audit reconciliation.

Exit criteria: Produce a trust-boundary diagram and a fail-closed recovery table.

### E9: Audit Replay

Question: Can a reviewer reconstruct why an operation ran, what policy was requested, what was enforced, and what changed?

Method: Replay normal execution, denial, one-shot approval, sandbox partial enforcement, runner failure, cancellation, remote disconnect, and secret-redaction cases.

Exit criteria: Reconstruct the decision and effect without provider-private console access or raw credentials.

### E10: Approval Fatigue

Question: Which risk classes can be safely consolidated without becoming effectively `allow all`?

Method: Run representative coding tasks under per-action ask, scoped session grants, and sandbox auto-allow. Measure task interruption, unsafe approvals, permanent grant breadth, and user reversal.

Exit criteria: Select a UX policy based on measured safety and interruption cost, not command-count heuristics.

## 12. Unresolved Questions

- DeepSeek Harness danger classification may exist in deployment plugins outside the inspected core L5 packages. The exact built-in product preset and plugin composition still need source evidence.
- Claude Code is a source-map mirror, not an official licensed repository. Feature flags, deleted mirror files, and unreconstructed dependencies can change conclusions. Cross-check critical behavior against a shipped version.
- The external Claude Code sandbox runtime is not present in the mirror. Its actual platform implementation, enforcement reporting, network proxy behavior, and failure taxonomy remain unresolved.
- Seatbelt is deprecated on macOS. The practical replacement path for a standalone CLI agent is not established.
- Windows ACL confinement in DeepSeek Harness is explicitly partial. Read-side and network confinement are out of scope for that backend.
- Container and microVM cost cannot be decided from specification documents alone. Cold start, memory, image distribution, snapshots, and GPU support need host-local benchmarks.
- Remote sandbox portability depends on provider APIs, templates, quotas, data residency, and network policy. A single E2B integration does not establish a provider-neutral contract.
- Spool's acceptable read boundary is unresolved. DeepSeek Harness allows broad reads; Claude Code can deny reads. Secret discovery may require denying reads or injecting only selected files.
- The durable audit format, retention, encryption, and redaction policy are not defined.
- The relationship between session cancellation, provider cancellation, and audit completeness under crash or network partition needs a recovery experiment.

## 13. Source Verification

External links in this document were checked on 2026-09-19 with redirects enabled. The intended sources are:

- POSIX `exec`: <https://pubs.opengroup.org/onlinepubs/9799919799/functions/exec.html>
- Linux Landlock: <https://docs.kernel.org/userspace-api/landlock.html>
- Linux seccomp: <https://docs.kernel.org/userspace-api/seccomp_filter.html>
- Linux namespaces: <https://docs.kernel.org/admin-guide/namespaces/index.html>
- OCI Runtime Spec `v1.3.0`: <https://raw.githubusercontent.com/opencontainers/runtime-spec/v1.3.0/config.md>
- OCI Linux config `v1.3.0`: <https://raw.githubusercontent.com/opencontainers/runtime-spec/v1.3.0/config-linux.md>
- Docker Engine security docs pinned commit: <https://raw.githubusercontent.com/docker/docs/b398f346a7e38451cacda1cfe54f1697d2685cdc/content/manuals/engine/security/_index.md>
- Docker Rootless docs pinned commit: <https://raw.githubusercontent.com/docker/docs/2d7809c7a74ba1e99609a44f421a15cbf8a4a4bc/content/manuals/engine/security/rootless/_index.md>
- Firecracker `v1.17.0` design: <https://raw.githubusercontent.com/firecracker-microvm/firecracker/v1.17.0/docs/design.md>
- E2B lifecycle: <https://docs.e2b.dev/sandbox.md>
- E2B secured access: <https://docs.e2b.dev/sandbox/secured-access.md>
- Modal Sandboxes: <https://modal.com/docs/guide/sandbox>
- Modal networking: <https://modal.com/docs/guide/sandbox-networking>
- Modal VM sandboxes: <https://modal.com/docs/guide/vm-sandboxes>
