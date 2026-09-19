# BENCH-FIXED-V1 results

Result files in this directory are immutable run records. Do not merge or edit
them to improve a reported score. A suite result must be summarized from one
complete run file, not from the latest row of each task across different runs.

The calibration record is used only to freeze thresholds. The formal record is
the authoritative suite result:

- `BENCH-FIXED-V1-2026-09-19.jsonl`: calibration run.
- `BENCH-FIXED-V1-2026-09-19-formal.jsonl`: formal run after threshold freeze.

The formal run completed T01-T27 with 27 pass, 0 fail, 0 infra errors, and no
retries. It does not replace clean-machine installation and post-install
release validation.
