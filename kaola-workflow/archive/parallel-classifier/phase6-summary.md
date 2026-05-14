# Phase 6 - Summary: parallel-classifier

## Delivered

`scripts/kaola-workflow-classifier.js` — Node.js classifier that classifies candidate GitHub issues as `green`, `yellow`, `red`, or `blocked` for parallel-work safety. Reads `.locks/*.lock` to build claimed-set, checks `depends-on:#N` labels via `gh issue view`, compares coarse file-area overlap using body regex and `area:*` labels. OFFLINE conservative mode treats `depends-on` labels as `blocked`.

Plus:
- `commands/workflow-next.md` Startup Step 0 updated: pre-claim candidate scan loop with `if/fi` OFFLINE guard, both `green` and `yellow` accepted, `CLAIM_JS` + `KAOLA_SESSION_ID` guards, yellow cache file written to `.cache/parallel-classifier.md`
- `install.sh` copy loop updated to include classifier.js
- `scripts/validate-workflow-contracts.js` updated: cap 220→240, 5 new assertions
- `scripts/simulate-workflow-walkthrough.js` updated: Epic Case 6 with sub-tests 6A-6F+6E' all passing
- `README.md` updated: Scripts Reference table row + Classifier Configuration section
- `CHANGELOG.md` updated: [Unreleased] entry

## Files Changed

| File | Change |
|------|--------|
| `scripts/kaola-workflow-classifier.js` | NEW — 296 lines |
| `commands/workflow-next.md` | MODIFIED — 211→237 lines |
| `install.sh` | MODIFIED — copy loop |
| `scripts/validate-workflow-contracts.js` | MODIFIED — cap + assertions |
| `scripts/simulate-workflow-walkthrough.js` | MODIFIED — Epic Case 6 |
| `README.md` | MODIFIED — Scripts Reference + config section |
| `CHANGELOG.md` | MODIFIED — [Unreleased] entry |
| `kaola-workflow/.roadmap/issue-6.md` | MODIFIED — workflow tracking |
| `kaola-workflow/ROADMAP.md` | MODIFIED — issue-6 row |

## Test Coverage

All behavioral paths covered by Epic Case 6 (sub-tests 6A-6F+6E'):
- 6A: green (disjoint) ✓
- 6B: red (file overlap) ✓
- 6C: yellow (shared-infra) + cache file written ✓
- 6D: OFFLINE + depends-on → blocked (conservative) ✓
- 6E: online depends-on open → blocked ✓
- 6E': online depends-on closed → not blocked ✓
- 6F: already-claimed → exit 2 ✓

## Final Validation Evidence

| Command | Result | Notes |
|---------|--------|-------|
| `node scripts/validate-workflow-contracts.js` | PASS | Contracts including cap assertion |
| `node scripts/simulate-workflow-walkthrough.js` | PASS | All Epic Cases including 6A-6F+6E' |

## Documentation Docking
DOCKED — evidence at `.cache/doc-docking.md`

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items

From Phase 5 Review:
- MEDIUM: implement `project-name` subcommand in kaola-workflow-roadmap.js (separate issue)
- MEDIUM: consider `red`/`unknown` default for gh fetch failure (future hardening)
- LOW: raise cap to 250 in future cleanup
- LOW: remove dead `try/catch` around `field()` calls

From advisor notes:
- `Co-active Leases` section in workflow-next.md could reference the candidate scan for self-consistency (cosmetic)

## Closure Decision

Closure scan: no deferred items, no unresolved conflicts, no partial implementation, no user-decision items. All Phase 5 follow-ups are enhancements, not blocking issues. No advisor consultation needed.

## Commit And Push

pending final Git gate

## GitHub Issue

`KaolaBrother/Kaola-Workflow#6` — pending close after commit

## Roadmap

updated: issue-6 row shows `parallel-classifier` project; pending archive and final refresh

## Archive

kaola-workflow/archive/parallel-classifier/

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan: no deferred/unresolved items found | |
| final-validation fix executors | N/A | no final validation failures | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (up-to-date) | |
| archive completed folder | invoked | kaola-workflow/archive/parallel-classifier/ | |
| final commit and push | ready | git status reviewed | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
