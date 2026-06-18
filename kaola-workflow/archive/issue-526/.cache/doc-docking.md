# Documentation Docking — issue-526

## Changed files reviewed (git diff)
- `docs/decisions/D-526-01.md` (new) — the decision record; the run's primary deliverable.
- `CHANGELOG.md` — `### Changed` entry under [Unreleased] summarizing the #526 resolution.

## Documents checked against CLAUDE.md Documentation Update Checklist
- README.md — no impact (no feature/usage/env-var change). SKIP (explicit no-impact).
- API docs — no impact (no API/schema/CLI change). SKIP.
- CHANGELOG.md — UPDATED (### Changed entry, #526).
- Architecture docs — no impact (no structural change; serial test execution is unchanged). SKIP.
- .env.example — no impact (no new env var; KAOLA_RUN_CHAINS_TIMEOUT_MS already documented under D-512). SKIP.
- Inline comments — no impact (no code touched). SKIP.
- docs/decisions/ — ADDED D-526-01.md (continues the D-523 series; D-526-01 was verified the next free number at authoring time).

## Acceptance-criteria docking (issue #526)
The issue's bimodal acceptance: a recorded design analysis answering the parallelism question against all five D-523-01 constraints, then EITHER a proven implementation OR a documented "serial is the right posture" decision record continuing the D-523 series.
- Recorded design analysis → the n1–n4 investigation chain (probe → assume → adversarially falsify → converge), evidence in `.cache/{n1-probe-surface,n1-probe-knowledge,n2-assume,n3-falsify,n4-converge}.md`, against all five constraints with REAL measured experiments.
- Outcome branch taken → the documented "serial is the right posture" decision record `docs/decisions/D-526-01.md`, continuing the D-523 series, with measurements and an explicit reopen condition. No flaky speed-up shipped (precedence #1 honored).

## Gaps found / fixed
None. The decision record and CHANGELOG entry fully reflect the change; no other document class is impacted.

## Final verdict
DOCKED
