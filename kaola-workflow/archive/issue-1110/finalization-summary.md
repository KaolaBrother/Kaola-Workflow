# Finalization — Summary: issue-1110

Issue **#1110** — "Finalize residue mirror admits foreign main-only untracked files as machinery-owned."
Branch `workflow/issue-1110`. Accepted head `1b785e55d86391a38061740f715323674dd190bc` (parent `1ccc3134`, baseline `b3aff5ca`).

## Delivered

Finalization no longer copies an unrelated untracked file from the main checkout into the run, and no longer treats that copy as machinery-authored. An untracked path absent from the linked worktree is copied only when this run's HEAD already contains that exact path. A path the main index already contains — a staged rename or a staged add — is still copied. Declined paths stay untracked in main, with their bytes unchanged, and are named on `residue_unattributed`. `finalize --check` reports the same declined set. The `#1077` overwrite refusal and forward edits of files the worktree already holds are unchanged.

Two commits:

- `1ccc3134` — do not mirror a main-only untracked file the run's HEAD does not contain.
- `1b785e55` — still mirror a staged rename the worktree does not yet hold. The first admission rule also skipped a staged rename whose new path is absent from HEAD (`R  old -> new` in main, clean worktree that still has only the old path). The repair copies a path the main index already names. The index probe fails closed.

Acceptance:

- Independent QA on `1ccc3134`: PASS, no defects. `/tmp/kw-i1110-qa/qa-report.md`
- Independent review on `1ccc3134`: PASS-with-notes, no blockers. `/tmp/kw-i1110-qa/review.md`
- The producer chain on clean `1ccc3134` was red: `node scripts/kaola-workflow-run-chains.js --project issue-1110` with `KAOLA_WORKFLOW_OFFLINE=1`, claude exit 1, sole red step `node scripts/test-bash-block-guards.js` (2 failed, 47 passed): `#361` A and `#423` D. That receipt is replaced by the green receipt below.
- Independent delta-check on `1b785e55`: PASS, zero defects. `/tmp/kw-i1110-qa/delta-check.md`

## Files Changed

7 files from `b3aff5ca` to `1b785e55` (+562 / −92).

- `scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- `scripts/test-claim-hardening.js`
- `docs/api.md`
- `CHANGELOG.md`

## Test Coverage

- Producer chain at `1b785e55`, offline, all four editions green, worktree clean. Receipt: `kaola-workflow/issue-1110/.cache/chain-receipt.json` (`headSha` `1b785e55d86391a38061740f715323674dd190bc`).
- Delta-check: `test-bash-block-guards.js` 49/49, `test-claim-hardening.js` 953, forge-findings 233, edition sync and script sync green; e2e 36/36 original plus 25/25 new, including staged-rename D and staged-add-with-untracked-neighbor E. `/tmp/kw-i1110-qa/delta-check.md`

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- docs/api.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-claim.js
- scripts/test-claim-hardening.js

## Documentation Docking

DOCKED. Evidence: `kaola-workflow/issue-1110/.cache/doc-docking.md`. `docs/api.md` and `CHANGELOG.md` state the HEAD-or-index rule, including staged adds. `README.md`, architecture records, and examples have no residue-mirror contract to update.

## Follow-Up Items

No follow-up issue. The items below are accepted known notes, not defects.

- KPR #212 consumer caveat: `finalize_transaction.residue_unattributed` (and `checks.residue_unattributed`) carries no source discriminator. Consumers must classify each path by where it exists — main checkout versus linked worktree — and must not infer sink impact from the array. Worktree-unattributed paths can hold up the sink; declined main paths are invisible to the sink's main-clean check.
- Untested: the manual recovery path for a legitimately-owned NEW main-only untracked file declined at finalize. The explicit owner action is to carry that file into the worktree and commit it. Widening admission to copy such files would reopen #1110.
- Known wording: the `1b785e55` commit message names only the staged rename. The admitted set also includes staged adds. `CHANGELOG.md` and `docs/api.md` disclose both. The delta-check judged that disclosure accurate.
- Untested pending scope from the original acceptance: the mixed declined-plus-worktree-unattributed reporting branch.

## Readiness

Accepted head `1b785e55` is the candidate. The chain receipt is bound to that commit. Sink is merge, issue #1110, close on the verified merge.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1110/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1110/.cache/doc-docking.md
- kaola-workflow/archive/issue-1110/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1110/finalization-summary.md
- kaola-workflow/archive/issue-1110/mission-ledger.jsonl
- kaola-workflow/archive/issue-1110/workflow-state.md
