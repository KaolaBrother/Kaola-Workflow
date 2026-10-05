# Finalization Summary — issue-1115

## Delivered

- **Fixture isolation**: `scripts/test-install-upgrade-rewrite.js` `COPY_SKIP` now excludes `.kaola` (private runner state, not install surface), with the constraint comment recording the measured 12.5.1-gate failure, plus a vacuous-elsewhere isolation guard (when the repo root holds `.kaola`, the fixture source must not contain it). Original upgrade-rewrite acceptance assertions unchanged; no chmod/retry substitute; retained evidence and user permissions untouched. CHANGELOG `[Unreleased]` entry.

## Candidate

- Branch `workflow/issue-1115` @ `aa09b3f275cea5473f222d37f6c4af6342640101` (base `94566333`, 1 commit, 2 files; author/committer `KaolaBrother <yanleichen@hotmail.com>`).
- Outer personal acceptance: `.kaola/outer-review-1115/accepted-aa09b3f2.md` — two-file diff read; independent causal verification by executing the exact candidate test body against the real main root via root-locator substitution (exit 0, isolation + original assertions passed, outer heartbeat bytes unchanged); `evaluateChainReceipt` chains_green.

## Evidence

- Chain receipt (reused, unchanged, candidate-bound): `kaola-workflow/issue-1115/.cache/chain-receipt.json` (sha256 `9c0d9667…`; headSha `aa09b3f2`; four chains exit 0, no waivers). Durable log: `.cache/chain-aa09b3f2….log`.
- Causal proof: worker overlay harness + Host independent main-checkout rerun (exit 0 vs the two preserved pre-fix `ENOTEMPTY` receipts at `/tmp/kw-i1114-dispatch/release-receipt-run1-flake.json` and `release-chains-run2.json`); outer independent root-locator execution (above).
- Preservation: retained-evidence entry count (271,844) and 1.3 GB du identical before/after; `delegator-heartbeat.json` sha256 unchanged across runs. (Counts/du are not a full byte audit — noted by outer; the fix bypasses copying the tree entirely.)
- Mission ledger: `kaola-workflow/.ledger/issue-1115.jsonl` (1 done).

## Known failures and unverified scope

- No open product defect in this scope. Non-product unverified facts kept honest: codex/luna pool start prerequisite still not verified this run; #1114-era dispatch-index tombstones for m1/m2/m3 preserved (m5/m6 cleanly closed via collect/retire).
- Outer note: causal evidence is targeted test evidence, not live Harness-session verification.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- scripts/test-install-upgrade-rewrite.js

## Follow-Up Items

- None filed: no new run-discovered defect emerged in this run (the defect this issue tracks is fixed by this candidate).
- Release hold remains: no 12.5.2 or any release action without separate outer continuation after fresh zero-open, no known unresolved defect, and explicit final integrated acceptance.

## Final readiness

READY — outer-accepted candidate `aa09b3f2`, reused candidate-bound unwaived receipt, worktree clean, serial finalize/merge/closure authorized.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1115/.cache/chain-aa09b3f275cea5473f222d37f6c4af6342640101.log
- kaola-workflow/archive/issue-1115/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1115/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1115/finalization-summary.md
- kaola-workflow/archive/issue-1115/mission-ledger.jsonl
- kaola-workflow/archive/issue-1115/workflow-state.md
