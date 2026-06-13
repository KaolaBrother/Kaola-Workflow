# Finalization - Summary: issue-449

## Delivered

Fixed version-blind `isStepDone` bug in `kaola-workflow-release.js` (×4 editions). `isStepDone(receipt, step)` was matching receipt rows without checking `r.version === version`, so cutting version B after version A in the same workspace without clearing `.cache/release-receipt.jsonl` would short-circuit every B step on A's `done` rows, emit `result:ok` with a fabricated tag/steps_completed, and leave `package.json`+git tag at A — a silent fabricated pass. Fix: `isStepDone(receipt, step, version)` adds `r.version === version` to every lookup; `git_tag` receipt row now stamps `version` field for uniform keying. Regression test T11 (real subprocess CLI, real tag/package.json/CHANGELOG assertions) proves RED→GREEN.

## Files Changed

| File | Change |
|------|--------|
| `scripts/kaola-workflow-release.js` | `isStepDone` version-keyed; `git_tag` row stamps `version` |
| `plugins/kaola-workflow/scripts/kaola-workflow-release.js` | Byte-identical codex mirror |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js` | Rename-normalized forge port |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js` | Rename-normalized forge port |
| `scripts/test-release.js` | T11 regression test (52 total assertions) |
| `CHANGELOG.md` | `[Unreleased] ### Fixed` entry for #449 |

## Test Coverage

52 assertions in `scripts/test-release.js` (T1–T11). T11 is the new regression: cuts 5.1.0, then 5.2.0 in the same workspace without receipt clear; asserts 5.2.0 tag exists, `package.json`==5.2.0, CHANGELOG has `[5.2.0]` — never fabricated `result:ok`. Prior contracts (T2/T3/T5 idempotent crash-resume for a SINGLE version) confirmed unaffected.

## Final Validation Evidence

| Command | Result | Evidence Path |
|---------|--------|---------------|
| `npm run test:kaola-workflow:claude` | PASSED | `kaola-workflow/issue-449/.cache/finalize.md` |
| `npm run test:kaola-workflow:codex` | PASSED | `kaola-workflow/issue-449/.cache/finalize.md` |
| `npm run test:kaola-workflow:gitlab` | PASSED | `kaola-workflow/issue-449/.cache/finalize.md` |
| `npm run test:kaola-workflow:gitea` | PASSED | `kaola-workflow/issue-449/.cache/finalize.md` |

Validation reuse boundary: all four chains ran inside the finalize node (n4). The doc-docking step adds only `kaola-workflow/issue-449/.cache/doc-docking.md` + `kaola-workflow/issue-449/finalization-summary.md` afterward — both are project-local workflow artifacts, barrier-invisible (`kaola-workflow/{project}/**`), and do not trigger a rerun.

## Documentation Docking

DOCKED — `kaola-workflow/issue-449/.cache/doc-docking.md`

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items

None. Code-reviewer node n2 (opus) found no blocking findings.

## Closure Decision Gate Scan

Scanned all phase artifacts (workflow-plan.md, n1/n2/n3/finalize evidence). No deferred items, partial implementations, unresolved review follow-ups, or user decisions pending. Safe to close.

## Closure Decision

None needed — implementation complete, all acceptance criteria met.

## Commit And Push

pending final Git gate; final hash is reported after push and is not written back here

## GitHub Issue

#449 — to be closed after sink-merge

## Roadmap

to be updated — `.roadmap/issue-449.md` to be removed; `ROADMAP.md` regenerated

## Archive

pending — `kaola-workflow/issue-449/` to be archived to `kaola-workflow/archive/`

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | `kaola-workflow/issue-449/.cache/doc-docking.md` | internal `isStepDone` only; no public behavior, API, setup, architecture, or docs impact; CHANGELOG already written by n3-changelog |
| documentation docking | invoked | `kaola-workflow/issue-449/.cache/doc-docking.md` | |
| final-validation fix executors | N/A | — | All four chains passed on first run; no fix needed |
| roadmap refresh | pending | `kaola-workflow/ROADMAP.md` | runs at closure |
| archive completed folder | pending | | |
| final commit and push | ready | git diff shows 6 expected files committed on `workflow/issue-449` | final gate runs after sink |

## Status

ARCHIVED AFTER FINAL GIT GATE
