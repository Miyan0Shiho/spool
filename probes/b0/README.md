# B0 probe suite

This directory preserves the bounded probe source used for the
[B0 report](../../docs/architecture/probes/b0.md). It is evidence tooling, not
product code and not part of the published runtime.

Run from the repository root:

```bash
node probes/b0/storage/transaction_probe.mjs
node probes/b0/storage/wal_probe.mjs
node probes/b0/storage/concurrency_driver.mjs
node probes/b0/storage/crash_driver.mjs
node probes/b0/storage/migration_probe.mjs
node probes/b0/storage/backup_probe.mjs

node probes/b0/process/process-probe.mjs
node probes/b0/sandbox/sandbox-probe.mjs
node probes/b0/sandbox/sandbox-cancel-probe.mjs

node probes/b0/provider-install/provider/probe.mjs
zsh probes/b0/provider-install/install/run-probe.sh
```

The storage, process, and sandbox probes intentionally create databases, raw
event logs, and temporary process records next to their scripts. The install
probe creates a unique work directory under `TMPDIR` and prints its path. Those
generated paths are ignored by Git and are not evidence by themselves; the
durable interpretation and limitations are recorded in the B0 report.

`node:sqlite` probes require the target Node runtime. The process and Seatbelt
probes are macOS-specific. The provider probe uses only a local HTTP/SSE mock
and does not validate a real provider.
