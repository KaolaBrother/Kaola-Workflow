# Advisor — Ideation Gate: issue-164

## Advisor Response

### D1 — checkClosureInvariants expansion: trim to invariants 3, 4, 7

Add only:
- invariant 3 (`active-folder-absent`): cheap local check; always true after archiveProjectDir
- invariant 4 (`archive-state-closed`): reads workflow-state.md in archive; offline-safe
- invariant 7 (`branch-worktree-resolved`): checks worktree_removed/branch_removed not 'failed'; local-only

Do NOT add invariant 5 (`remote-closed-after-publish`): requires gh API call; skip logic interacts with #165's receipt unification. Defer to #165.

Rationale: Three local-only invariants are safe to add now without risk of offline-skip edge cases. Invariant 5 depends on `remote_issue_closed` being correctly populated — which #165 will wire up properly across all paths.

### D2 — sink:pr deferred closure: docs-only

Option B (planner) correctly assesses that `cmdSinkPr` does not emit a closure receipt. The authoritative closure receipt for sink:pr is emitted by `cmdWatchPr` at merge. No schema change to `kaola-workflow-closure-contract.js`. Document this in `docs/api.md` as explicit pending-watcher behavior.

AC #4 from the issue ("Keep sink:pr deferred behavior explicit") is satisfied by docs note alone.

### Test 2 — drop "sink:pr deferral explicit" test

As written in the planner, "PR sink pending — run sink-pr (or plant sink:pr folder), assert `archive: 'skipped'` or explicit pending field" is not a testable AC against new code. No new code drives this path. Drop it (option a). Replace the test slot with 4 concrete tests:

1. Merge sink receipt — run finalize (sink:merge path) with shim; assert full receipt including `worktree_removed`
2. watch-pr merged — run watch-pr with shim on sink:pr folder; assert per-folder receipt `receipts[0]`
3. Offline skipped — run finalize with OFFLINE=1; assert `remote_issue_closed: 'skipped_offline'`
4. sink-merge mockability + receipt — exercise `KAOLA_GH_MOCK_SCRIPT` path; assert JSON receipt emitted to stdout

### Context Risk

Ship issue #164, then STOP. Do not chain into #165 in this session. The `remote-closed-after-publish` invariant and `remote_issue_closed` field depend on #164's buildClosureReceipt helper being stable — let #164 merge to main before extending in #165.

### No Missed Approaches

Option B (buildClosureReceipt helper + full receipt) is the correct choice. Option A (in-place, no helper) fails unification. Option C (closure subcommand) forces artificial unification. No additional approaches were missed.

### Risks Accurate

Planner risks are accurate. The circular dependency risk (Q1) is confirmed no-risk: sink-merge already requires claim.js at L6. The COMMON_SCRIPTS enforcement risk is confirmed: both claim.js and sink-merge.js are listed at L39/L46 of validate-script-sync.js — byte-identical copy must cover both files.

### Recommendation

Proceed with Option B as specified. Begin Phase 3 blueprint immediately.
