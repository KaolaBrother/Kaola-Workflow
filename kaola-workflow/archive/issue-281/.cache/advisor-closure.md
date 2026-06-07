# Closure Decision — issue #281 (advisor-consulted)

## State
- All 14 plan nodes `complete`; plan frozen (`plan_hash=45c7197d…`).
- 4 script-enforced barrier gates GREEN: resume-check=0, gate-verify=0, barrier-check=0 (outOfAllow:[], sensitiveHits:[]), verdict-check=0 (code-review + adversarial-verify both `verdict: pass`).
- `npm test` green across all four editions; `simulate-workflow-walkthrough.js` exit 0.
- 36 changed files (uncommitted in the worktree).

## Acceptance criteria
AC#1 (ready-pending vs active) ✅; AC#2 (read-only batches) ✅; AC#3 (write-role fanout batches) ✅ with documented honest partial (degrades to serialized where host lacks isolated-worktree support); AC#4 (downstream closed until members terminal) ✅; AC#5 (multi-in_progress legal only with manifest; else typed refusal) ✅ (orient `orphan_multi_in_progress` — repaired after the adversarial-verifier caught the gap); AC#6 (crash/resume across 5 states) ✅; AC#7 (barrier/gate/verdict/Phase-6 still hold) ✅; AC#8 (four-edition parity) ✅.

## Advisor recommendation
- **#281 can close.** AC met, R1–R4 are non-blocking and recorded, all gates green.
- **User permission required before merge+close** (phase-6 Closure Decision Gate; overrides the /goal directive). Asking ≠ stalling.
- **Follow-ups:** one consolidated follow-up issue for R1 (compliance-row dedup, cosmetic), R2 (open-batch ledger-flip-before-baseline atomicity, fails-closed), R4 (orient/crossCheckStatus partial-seal exact-equality, fails-closed, needs a coordinated two-gate subset-predicate fix). R3 (write-role-join gitCheckout ref-vs-path) is already an honest partial in the design note — no issue needed.
- **Leave [Unreleased]; no version bump** (a codex-manifest/version bump without a release fails the npm-test parity contract). "Finish" = merge + close, not release.

## Critical sink-safety checks (advisor-flagged)
- Verify the finalize commit carries the IMPLEMENTATION (`git show --stat HEAD` includes scripts/, plugins/, docs/, README.md, CHANGELOG.md, install.sh, package.json) — not just the workflow folder, else sink-merge merges an empty branch.
- Reconcile the staged `.roadmap/issue-281.md` + untracked `kaola-workflow/issue-281/` in MAIN so the worktree sink's "must be clean" check does not choke.
- Check sink-merge exit code (0 merged / 1 conflict / 2 FF-race / 3 PR-fallback). Expect worktree removal + `git push -u`, possible origin-advance rebase.
- Post-sink verify: origin/main carries the 36 files; #281 closed; worktree gone; project folder archived.
