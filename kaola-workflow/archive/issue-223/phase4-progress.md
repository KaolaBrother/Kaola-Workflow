# Phase 4 - Progress: issue-223

## Implementation (tdd-guide, subagent-executed)
Build sequence followed: failing-tests-first → root edits → cp to Codex → forge hand-adapt → forge tests → full validation.

## RED (before fixes)
- testWatchPrAbandonedClosureInvariantsClean: closure_invariants.ok=false, violations [roadmap-source-absent, roadmap-mirror-clean].
- testClaimReclaimsStatelessOrphanDir: status=target_occupied (instead of acquired).
- testPatchBranchGuards: (a) ghost-proj → patched:true + dir created; (b) ../escape-poc → exit 0, no error.

## Edits applied
- #13 checkClosureInvariants (root :574): `const abandoned = receipt && receipt.archive === 'abandoned';` + guard `!abandoned && Number.isInteger(...)`.
- #14 claimProject EEXIST (:404): return target_occupied only if stateFile exists; else fall through to reclaim. Happy path unchanged.
- #15 cmdPatchBranch (:737): assert isSafeName + assert activeByProject before updateState.
- Codex: `cp` from root (byte-identical). GitLab/Gitea: same logical edits, #14 return uses `issueIid`.

## Byte-sync
`node scripts/validate-script-sync.js` → OK: 10 common scripts and 3 byte-identical file group in sync.

## GREEN (after fixes)
- validate-script-sync.js exit 0
- simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed"
- simulate-gitlab-workflow-walkthrough.js → passed
- simulate-gitea-workflow-walkthrough.js → passed
- test-gitlab-workflow-scripts.js → passed
- test-gitea-workflow-scripts.js → passed

## Files modified (7)
scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js (cp), plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js. closure-contract.js UNMODIFIED.

## Flagged for Phase 5 review
- Forge tests were written AFTER the forge fixes, so NOT observed RED. Phase 5 must verify the forge tests actually bite (revert-probe a forge fix, confirm the test fails) — TDD-discipline gap to close.
- #15 adds a path-traversal guard (isSafeName) → security-reviewer pass required.
- Canary: verify #14's happy path (mkdir-succeeds → writeState) is byte-for-byte unchanged so every subsequent claim is unaffected.
