# Phase 6 - Summary: roadmap-per-issue-regenerator

## Delivered

Per-issue ROADMAP.md regenerator for the Kaola-Workflow project. Eliminates ROADMAP.md merge conflicts when multiple sessions work simultaneously: each session commits its own `kaola-workflow/.roadmap/issue-{N}.md` file; `ROADMAP.md` becomes a generated artifact rebuilt from those inputs.

Key components:
- `scripts/kaola-workflow-roadmap.js` — regenerator with 4 subcommands: `generate` (rebuild ROADMAP.md from per-issue files), `migrate` (one-time bootstrap from existing ROADMAP.md table), `validate` (staleness check), `init-issue` (create one per-issue file at Phase 1)
- `kaola-workflow/.roadmap/` — directory containing per-issue state files (one per active issue)
- Phase 1 Step 5b — creates per-issue file via `init-issue` when a GitHub issue is linked
- Phase 6 Step 7 — deletes per-issue file, runs `generate`, stages both for final commit
- workflow-next Startup Step 2 — runs `validate`; warns if stale but does NOT commit (thin router principle)
- workflow-init bootstrap — `mkdir -p .roadmap` + `generate` on new installs
- Pre-commit hook — `.roadmap/` exclusion prevents cross-session ownership false-positive

## Files Changed

### New
- `scripts/kaola-workflow-roadmap.js` (229 LOC after Phase 5 fixes)
- `kaola-workflow/.roadmap/issue-2.md`
- `kaola-workflow/.roadmap/issue-5.md`
- `kaola-workflow/.roadmap/issue-6.md`
- `kaola-workflow/.roadmap/issue-7.md`
- `kaola-workflow/.roadmap/issue-8.md`
- `kaola-workflow/.roadmap/issue-9.md`
- `kaola-workflow/.roadmap/issue-10.md`

### Modified
- `kaola-workflow/ROADMAP.md` — generated header comment; rows sorted descending by issue number
- `hooks/kaola-workflow-pre-commit.sh` — `.roadmap/` exclusion added
- `install.sh` — `kaola-workflow-roadmap.js` added to copy loop
- `commands/kaola-workflow-phase1.md` — Step 5b (conditional init-issue)
- `commands/kaola-workflow-phase6.md` — Step 7 roadmap regeneration block
- `commands/workflow-next.md` — Startup Step 2 validate-only + warn
- `commands/workflow-init.md` — bootstrap mkdir + generate
- `scripts/validate-workflow-contracts.js` — 6 new assertions
- `scripts/simulate-workflow-walkthrough.js` — Epic Case 5 (6 sub-tests A-F)
- `README.md` — kaola-workflow-roadmap.js added to Scripts Reference table
- `CHANGELOG.md` — entry under [Unreleased] > Added

## Test Coverage

- `node scripts/validate-workflow-contracts.js` — PASS (all 6 new assertions + all existing)
- `node scripts/simulate-workflow-walkthrough.js` — PASS (Epic Case 5: generate, idempotency, validate-current, validate-stale, migrate+idempotent, init-issue+idempotent)
- `node scripts/kaola-workflow-roadmap.js validate` — PASS (ok)
- bash syntax checks — PASS (hook + install.sh)

No external framework; hand-rolled Node.js assertions per project convention.

## Final Validation Evidence

| Command | Result | Evidence |
|---------|--------|---------|
| `node scripts/validate-workflow-contracts.js` | PASS | Workflow contract validation passed |
| `node scripts/simulate-workflow-walkthrough.js` | PASS | Workflow walkthrough simulation passed |
| `node scripts/kaola-workflow-roadmap.js validate` | PASS | ok |
| `node -c scripts/kaola-workflow-roadmap.js` | PASS | syntax ok |
| `bash -n hooks/kaola-workflow-pre-commit.sh` | PASS | syntax ok |
| `bash -n install.sh` | PASS | syntax ok |

## Documentation Docking

DOCKED — evidence: `.cache/doc-docking.md`. README.md and CHANGELOG.md updated. No new env vars, no API surface, architecture unchanged.

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items

None — all Phase 5 MEDIUM/LOW findings were fixed inline as Trivial Inline Edit Exception:
1. Newline injection in string fields (`cmdInitIssue`, `cmdMigrate`)
2. Dead code removed (`OFFLINE`, `isSafeName`, `ghExec`)
3. No-op assert removed (`cmdMigrate`)
4. Pipe escaping added to `workflow_project` in `buildTableRow`

## Closure Decision

No deferred items, no unresolved conflicts, no partial work, no user-decision items. The phase1-research.md note about `workflow-init.md` was resolved in Phase 4 Task 7. Closure scan result: clean.

## Commit And Push

pending final Git gate

## GitHub Issue

ready to close (#5)

## Roadmap

updated — issue-5.md deleted, `generate` ran, #5 row removed from kaola-workflow/ROADMAP.md

## Archive

kaola-workflow/archive/roadmap-per-issue-regenerator

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | README.md + CHANGELOG.md updated (Trivial Inline Edit Exception for 1-line doc additions) | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan: no deferred items, conflicts, or user-decision items | |
| final-validation fix executors | N/A | no final validation failures | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (issue-5.md deleted, generate ran) | |
| archive completed folder | invoked | kaola-workflow/archive/roadmap-per-issue-regenerator | |
| final commit and push | ready | git status/git diff confirm no unrelated changes | final gate runs after this file is committed |

## Status

READY FOR FINAL GIT GATE
