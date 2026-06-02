# Phase 6 - Summary: issue-224

## Delivered
Three roadmap-mirror edge-case fixes in `kaola-workflow-roadmap.js`:
- **#16+#17 (unified)** `readRoadmapIssues` derives the issue number from the filename (single authority) — fixes the #17 filename-vs-field split and the #16 silent-drop of a source missing the `issue:` field (dead trailing filter removed). All 4 editions.
- **#18 (root+Codex only)** `parseRoadmapTable` unescapes `\|`→`|` in the title/workflow_project/next_step cells, fixing the generate→migrate→generate double-escape. Forge has no `cmdMigrate` → not applicable there.
`claim.js` unchanged (already filename-authoritative).

## Files Changed
- `scripts/kaola-workflow-roadmap.js` (canonical) + `plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js` (byte-identical cp)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` + `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` (forge-adapted, #16+#17 only)
- `scripts/simulate-workflow-walkthrough.js` (3 tests) + `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` + `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (2 #16/#17 tests each)
- `CHANGELOG.md` — `### Fixed` entry under `[Unreleased]`
- `kaola-workflow/archive/issue-224/` — archived; `kaola-workflow/ROADMAP.md` — regenerated (no active work)

## Test Coverage
3 root walkthrough tests (filename authority over missing field; filename-vs-field mismatch; migrate round-trip single-escape) + 2 forge tests per port (#16/#17). Failing-first; the filename and #18 fixes each revert-proven to bite (gitlab #16/#17 bite + symmetric root #18 bite). Backward-compatible (field==filename fixtures render identically).

## Final Validation Evidence
- `npm test` (claude + codex + gitlab + gitea) → exit 0. Evidence: `.cache/final-validation.log`.
- `node scripts/validate-script-sync.js` → OK (root↔Codex byte-identity).

## Documentation Docking
DOCKED — see `.cache/doc-docking.md`.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| n/a | — | — | — | no failures |

## Follow-Up Items
- None.

## Closure Decision
#224 fully resolves audit findings #16/#17/#18 — acceptance met (all fixes done, byte-sync intact, code review PASSED with empirical bite proofs, full suite green). The #17 filename-authority design decision is recorded in phase2-ideation.md. No new deferred items. User pre-authorized closure (full sink per convention). No advisor-closure gate required.

## Commit And Push
[pending final Git gate; final hash reported after push]

## GitHub Issue
[pending close via sink-merge]

## Roadmap
Regenerated (no .roadmap source; "No active work").

## Archive
[pending — cmdFinalize Step 8b]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | .cache/doc-docking.md | internal roadmap-generation change; only CHANGELOG impacted, entry written directly — README/api/.env/arch/state-contract no-impact |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan | no new closure-blocking items |
| final-validation fix executors | N/A | .cache/final-validation.log | no failures |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/upstream check | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
