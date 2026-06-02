# Phase 6 - Summary: issue-223

## Delivered
Three grouped claim/closure lifecycle fixes in `kaola-workflow-claim.js` across all four editions:
- **#13** `checkClosureInvariants` skips the two roadmap invariants when `receipt.archive === 'abandoned'` (no false-positive `closure_invariants.ok:false` for an abandoned PR).
- **#14** `claimProject` reclaims an orphaned stateless project dir (EEXIST + no state file → reclaim; happy path unchanged), curing the permanent `target_occupied` for a crash-window orphan.
- **#15** `cmdPatchBranch` asserts `isSafeName(args.project)` + `activeByProject` before `updateState`, closing a path-traversal write and a phantom `status: unknown` folder.
`closure-contract.js` unchanged (holds only the data array).

## Files Changed
- `scripts/kaola-workflow-claim.js` (canonical) + `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical cp)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` + `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (forge-adapted)
- `scripts/simulate-workflow-walkthrough.js` (3 tests) + `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` + `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (3 forge tests each)
- `CHANGELOG.md` — `### Fixed` entry under `[Unreleased]`
- `kaola-workflow/archive/issue-223/` — archived workflow folder; `kaola-workflow/ROADMAP.md` — regenerated (no active work)

## Test Coverage
3 root walkthrough tests (abandoned-PR clean invariants; stateless-orphan reclaim + target_occupied-when-state-present negative control; patch-branch ghost/traversal guards) + 3 analogous forge tests per port. All failing-first; every fix revert-proven to bite in Phase 5.

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
- LOW (pre-existing, out of scope, from Phase 5 security review): `args.branch` in `cmdPatchBranch` is written unvalidated into state content; a newline could forge other state fields. Not introduced by #223; operator-controlled; never reaches a path/shell. Candidate for a separate hygiene pass — no follow-up issue created (pre-existing, negligible).

## Closure Decision
#223 fully resolves audit findings #13/#14/#15 — acceptance met (all sub-fixes done, byte-sync intact, code + security review PASSED, full suite green). The one follow-up is pre-existing and out of scope. User pre-authorized closure (full sink per convention). No advisor-closure gate required (no new closure-blocking decisions).

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
| doc-updater | skipped | .cache/doc-docking.md | internal lifecycle change; only CHANGELOG impacted, entry written directly (precise facts) — README/api/.env/arch/state-contract no-impact |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan | no new closure-blocking items |
| final-validation fix executors | N/A | .cache/final-validation.log | no failures |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/upstream check | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
