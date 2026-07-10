evidence-binding: n6-finalize f074eece54ee
upstream_read: n5-adversarial b3fa5f4ba4ab
compliance: main-session-direct

## Phase 6 — Finalization sink (main-session-direct, non-delegable)

Bundle bundle-651-652 (issues #651 + #652, closure_policy all_or_nothing). All five upstream
nodes complete; final gate chain: n3-review pass (findings_blocking: 0 — N3-1 resolved in-run by
the reopened n4-docs pass, verified by the gate owner), n5-adversarial pass (findings_blocking: 0 —
original refutation findings R1/R2 independently re-attacked and confirmed resolved).

## Steps

1. CHANGELOG.md: added `## [Unreleased]` with the #651 entry (Added — mechanical pre-tag
   `--release-check` gate, 7-slot typed precedence family, hermeticity fix, documented-flow wiring,
   in-run adversarial repair loop recorded) and the #652 entry (Fixed — bare-token negative
   controls + merge-diff band narrowing, test-only). Last test-consumed prose edit before the
   receipt stamp (stamp-last discipline).
2. Feature commit on workflow/bundle-651-652 (worktree): 7942335e, 37 files +1265/−81 (both
   implementation lanes, the R1+R2 repair window, the docs ripple, CHANGELOG, workflow state).
3. Serial four-chain receipt via kaola-workflow-run-chains.js --project bundle-651-652, stamped
   LAST at the feature commit: DONE below.
4. Finalize gate + push + sink-merge from main root + bundle closure (#651 + #652 closed with
   CLOSED-state verification, roadmap sources removed, ROADMAP regenerated, folder archived):
   recorded in the closure receipt / sink output.

## Validation

`KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --project
bundle-651-652 --json` → `{"result":"pass","failed":[]}`, exit 0. Receipt:
headSha 7942335ea9edf9f616e224b7b7476f33bed6271e (== HEAD, the feature commit),
workTreeHash "clean", chains claude/codex/gitlab/gitea all exitCode 0, all accepted_red false —
UNWAIVED four-chain green receipt at the finalize candidate, stamped after the last test-consumed
prose edit (CHANGELOG). Stamp-last discipline held: no code or test-consumed prose changed after
the stamp.
