# Phase 6 - Summary: issue-169

## Delivered
Hardened `/workflow-next` tooling so unverified targets fail loudly:
1. Added `target_unverified` classifier verdict (offline + no `.roadmap/issue-N.md` + no active folder for the target).
2. Wired `target_unverified` through `claimExplicitTarget()` → `claim: 'none'`, exit code 1, no folder created.
3. Step 0b in `commands/workflow-next.md` and `plugins/.../SKILL.md` now extracts `KAOLA_VERDICT` and `KAOLA_REASONING` from startup output.
4. Step 0 in both docs has a new target-existence check (item 7 / item 6) requiring online `gh issue view` against cwd context, or offline `.roadmap/issue-N.md` or active folder — explicitly framed as consumer-repo context.
5. Required Output prints `Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING` when `claim:none`; `target_unverified` added to verdict enum.
6. Classifier CLI accepts top-level `--issue N` and `--help` (backward compatible with `classify --issue N`).
7. 4 new tests + 1 renamed/flipped test + 4 setup-precondition fixes in pre-existing tests; all GREEN.
8. Byte-identical mirrors maintained between `scripts/` and `plugins/kaola-workflow/scripts/`.

## Files Changed
| File | Lines | Purpose |
|------|-------|---------|
| scripts/kaola-workflow-classifier.js | +25 | OFFLINE guard + CLI ergonomics |
| scripts/kaola-workflow-claim.js | +9 | target_unverified branch |
| scripts/simulate-workflow-walkthrough.js | +151 / −22 | tests + setup fixes |
| commands/workflow-next.md | +35 / −10 | Step 0 + Step 0b + Required Output |
| plugins/kaola-workflow/scripts/kaola-workflow-classifier.js | +25 | byte-identical mirror |
| plugins/kaola-workflow/scripts/kaola-workflow-claim.js | +9 | byte-identical mirror |
| plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md | +22 / −6 | mirror of workflow-next.md doc |
| CHANGELOG.md | +10 | `[Unreleased]` Added + Changed entries |
| docs/api.md | +10 / −1 | new `Verdict: target_unverified` subsection |
| kaola-workflow/.roadmap/issue-169.md | created in Phase 1 | will be deleted on close (Step 7) |
| kaola-workflow/issue-169/ | workflow artifacts | will archive on close (Step 8b) |

## Test Coverage
5 new/renamed classifier tests cover the 6 new code branches (OFFLINE guard, claim-script mapping, top-level `--issue`, `--help`, `cmdClassify(argv)` refactor, `printHelp`). Non-regression covered by `testClassifierOfflineVerifiedRoadmapAcquires` + `testClassifierOfflineVerifiedOwnedFolderRoutes` + 4 `plantRoadmapIssue` setup fixes in pre-existing tests.

## Final Validation Evidence
- `node scripts/validate-script-sync.js` → exit 0; "OK: 10 common scripts and 2 byte-identical file group in sync." — `.cache/final-validation.md`
- `node scripts/simulate-workflow-walkthrough.js` → exit 0; "Workflow walkthrough simulation passed" — `.cache/final-validation.md`
- Sanity: `--help` and `KAOLA_WORKFLOW_OFFLINE=1 --issue 99999` → expected JSON

## Documentation Docking
DOCKED — `.cache/doc-docking.md`

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|

(none)

## Follow-Up Items
From Phase 5:
- LOW finding accepted as defense-in-depth (redundant active-folder check in OFFLINE guard) — no action

From corrected issue text (out of scope for #169):
- GitLab/Gitea forge port `commands/workflow-next.md` updates — same gap; should be filed as follow-up issues if not already
- `PICK_NEXT_PROJECT` → `KAOLA_PROJECT` rename in SKILL.md — out-of-scope parity drift

## Closure Decision
Closure scan: no deferred items requiring user decision. The LOW finding is accepted, not deferred. Follow-up items (forge ports, SKILL.md rename) are explicit out-of-scope per Phase 2 plan, not blocking decisions. **No advisor consultation required.**

## Commit And Push
pending final Git gate; final hash is reported after push and is not written back here.

## GitHub Issue
pending close after Step 7 (will close KaolaBrother/Kaola-Workflow#169)

## Roadmap
pending refresh in Step 7 (delete `.roadmap/issue-169.md`, regenerate `ROADMAP.md`)

## Archive
pending atomic archive via `cmdFinalize` in Step 8b → `kaola-workflow/archive/issue-169/`

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan (this file) | no deferred/conflict items |
| final-validation fix executors | N/A | | final validation passed first try |
| roadmap refresh | pending | will run in Step 7 | |
| archive completed folder | pending | will run in Step 8b | |
| final commit and push | ready | git status, validation evidence | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
