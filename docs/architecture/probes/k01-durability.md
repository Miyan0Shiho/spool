# K01 durability probe

> Date: 2026-09-19
>
> Status: waived for P0 by explicit user decision. Process-crash durability is
> tested; hardware power loss is not verified and is not promised.

## Verified

- SQLite writes use WAL, `synchronous=FULL`, foreign keys, and a bounded busy
  timeout.
- On macOS file-backed stores, `PRAGMA fullfsync = ON` is enabled.
- Artifact writes use a unique temporary file, file `fsync`, atomic rename, and
  directory `fsync`.
- `SIGKILL` after committed event prefixes leaves contiguous committed records
  after reopening.
- Uncommitted transactions are absent after process death.
- Interrupted runs and unresolved tool intents are repaired as `failed` and
  `unknown` rather than silently replayed.

## Not Verified

- Physical power loss.
- Host operating-system crash.
- Storage-controller cache loss.
- Disk firmware or hardware failure.

The user confirmed on 2026-09-19 that the project does not have a safe,
controlled environment for this test. DEC-044 therefore removes hardware
power-loss validation from the P0 release gate. This is a scope/risk decision,
not a pass result.

Passing this report's process-crash tests must not be described as verified
power-loss durability. Release notes must disclose the limitation.
