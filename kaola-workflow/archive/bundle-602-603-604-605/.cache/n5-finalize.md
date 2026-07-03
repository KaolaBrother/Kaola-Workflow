evidence-binding: n5-finalize bc1af99b0648

# n5-finalize — sink node (main-session-direct)

compliance: main-session-direct

## Work performed

1. CHANGELOG.md: four `[Unreleased]` entries added — `### Added` #605 (run-progress mirror) + #604 (announcement contract); `### Fixed` #602 (summary dispatch card) + #603 (dispatch-mode threading) — written BEFORE the binding chain run (receipt-freshness discipline). They join the existing #600/#601 entries pending the next release.

2. Gate-surfaced repair (recorded): n4-review R1 (MEDIUM, in_scope) — the n3-docs edit to docs/workflow-state-contract.md was correct but uncommitted (stranded in the working tree; the sink would have dropped it). Resolved by the orchestrator between windows: committed to the branch as 33768cc9 (`docs: state-contract coverage for the run-progress mirror and codex dispatch mode field`); n4 evidence re-recorded with status=resolved.

## Validation (binding receipt)

- `KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --project bundle-602-603-604-605` from the worktree: claude/codex/gitlab/gitea ALL exit 0, accepted_red none; receipt at kaola-workflow/bundle-602-603-604-605/.cache/chain-receipt.json, headSha 33768cc9 (current branch HEAD), completedAt 2026-07-03T05:43:24Z; workTreeHash covers the uncommitted CHANGELOG state.
- Validation reuse boundary: the receipt covers all code/test/prose impact through n4's close, the R1 docs commit, and n5's CHANGELOG write (hashed in the receipt's work tree). No edits after the receipt.
- n4-review (opus gate) independently ran the four chains pre-receipt (all exit 0) plus edition-sync --check, validate-script-sync, route-reachability (233), test-claim-hardening (155).

## Gate verdicts

- n4-review (opus): verdict pass, findings_blocking 0; R1 resolved (33768cc9); two LOW advisory notes (cmdBootstrap literal-check asymmetry; byte-identity oracle is a proxy proof) recorded in its evidence.

verdict: pass
