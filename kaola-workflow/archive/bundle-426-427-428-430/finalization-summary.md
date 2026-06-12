# Finalization - Summary: bundle-426-427-428-430

## Delivered

Four interrelated bugs in `cmdFinalize`, `archiveProjectDir`, `reconcileRoadmapForClosure`, and `cmdStartup` fixed together as a bundle. All four touch `kaola-workflow-claim.js` and its edition twins:

- **#426**: `archiveProjectDir` — copy-then-verify-then-delete replaces unsafe rename; worktree live copy deleted on `keepWorktree: false`; `verifyArchiveComplete` guards deletion; `anchored_root` in closure receipt.
- **#427**: `cmdFinalize` closes GitHub issues via `closeIssueIdempotent`; `closureReceipt.closure` roll-up added; sink-merge gains probe-before-close guard for idempotency; closure-contract updated with `anchored_root` field and `roadmap-residue-clean` invariant.
- **#428**: `reconcileRoadmapForClosure` removes `.roadmap/issue-N.md` from both main root and worktree root; `roadmap_removed_by_root` / `roadmap_residue` in receipt.
- **#430**: Three-point bundle coherence: `target_set_mismatch` at claim, `bundle_state_incoherent` at handoff and orient; prose updated on all 6 #400-family surfaces.

## Files Changed

### scripts/kaola-workflow-claim.js (+ codex twin)
- verifyArchiveComplete helper, copy-then-verify-then-delete archiveProjectDir (#426)
- closeIssueIdempotent, cmdFinalize close-execution block, closure roll-up (#427)
- dual-root reconcileRoadmapForClosure, roadmap_residue (#428)
- target_set_mismatch refusal in cmdStartup bundle path (#430)

### plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
### plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- All #426/#427/#428/#430 changes mirrored with forge adaptations (n5b)

### scripts/kaola-workflow-sink-merge.js (+ codex twin + 2 forge ports)
- probe-before-close idempotency guard (#427/n9)

### scripts/kaola-workflow-closure-contract.js ×4
- anchored_root field, roadmap-residue-clean invariant (#427/n3→n4)

### scripts/kaola-workflow-adaptive-handoff.js ×4
- bundle_state_incoherent guard in runHandoff (#430/n6)

### scripts/kaola-workflow-adaptive-node.js ×4
- bundle_state_incoherent guard in orient (#430/n7)

### scripts/test-bundle-state.js
- 12 new assertions (tests d/e) for orient coherence check (#430/n7)

### scripts/test-bundle-finalize.js
- --keep-worktree fix in merge-lane test (2b) (#427/n3)

### scripts/simulate-workflow-walkthrough.js ×6
- 4 new scenarios: testFinalizeArchiveVerifiesBeforeDelete, testFinalizeClosesIssueBundleMembers, testFinalizeRoadmapResidueDetection, testStartupRefusesTargetSetMismatch/testBundleStateIncoherent (#426/#427/#428/#430/n10)

### agents/workflow-planner.md + 3 toml
- Bundle startup consistency prose (n8a)

### commands/kaola-workflow-adapt.md + 3 SKILL packs
- target_set_mismatch refusal row (n8b, #400-family)

### docs/api.md, docs/workflow-state-contract.md
- Closure receipt fields, refusal codes, bundle coherence invariant (n12)

### docs/decisions/D-426-01.md through D-430-01.md
- 4 decision records (n12)

### CHANGELOG.md
- 4 Fixed entries for #426/#427/#428/#430 (n13)

## Test Coverage

Four-chain suite (simulate-workflow-walkthrough.js + test-bundle-state.js + test-bundle-finalize.js + validate-*-contracts.js) — all four editions green. No coverage metric available (no coverage tooling in this project).

## Final Validation Evidence

Command: `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`
Result: PASS (exit 0, background task b83202x95)
Evidence: `.cache/final-validation.md`
Reuse boundary: covers all code/test impact through n13; CHANGELOG edit is docs-only.

Adaptive barrier: resume=0 gate=0 barrier=0 verdict=0 (all pass)

## Documentation Docking

DOCKED — `.cache/doc-docking.md`

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items

Code-reviewer n11 noted two non-blocking findings:
- R1 (LOW): `testStartupRefusesTargetSetMismatch` name slightly misleading (drives orient coherence, not cmdStartup target_set_mismatch). Cosmetic; no behavior impact.
- R2 (INFO): `verifyArchiveComplete` checks only `workflow-state.md` presence — acceptable because `copyDir` throws before verify is reached, so a silent partial copy is not a reachable failure mode.

Neither warrants follow-up issues.

## Closure Decision

No deferred items, conflicts, partial work, or user-decision items. Implementation complete for all four issues. All issues can close.

## Commit And Push

pending final Git gate; final hash is reported after push and is not written back here

## GitHub Issue

issues #426, #427, #428, #430 — to be closed by cmdFinalize (all-or-nothing bundle)

## Roadmap

to be updated by cmdFinalize (removes .roadmap/issue-426.md, issue-427.md, issue-428.md, issue-430.md; regenerates ROADMAP.md)

## Archive

pending (cmdFinalize will archive to kaola-workflow/archive/bundle-426-427-428-430.archived-<timestamp>/)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked (n8a, n8b, n12) | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | — | no failures |
| roadmap refresh | pending (cmdFinalize) | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending (cmdFinalize) | | |
| final commit and push | ready | git status/diff clean except bundle changes | final gate runs after this file |

## Status
ARCHIVED AFTER FINAL GIT GATE
