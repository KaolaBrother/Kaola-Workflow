# Node `code-review` (code-reviewer, G1 gate) — issue #293

Reviewed the changes from `align` (tdd-guide) and `align-forge` (implementer): the `crossCheckStatus`
alignment across all four editions, the shared fixture, and both fixture-driven tests.

## Verified
1. **Correctness.** The `ip.length <= 1` short-circuit is hoisted above the manifest branch; `>1`
   orphan paths preserved (probed directly: `ip=2 + no manifest → orphan_multi_in_progress`,
   `ip=2 + mismatch → orphan_member_set_mismatch`, `ip=2 + matching → valid_batch`). R4 partial-seal
   (T799–T802) and P6a–P6d multi-`in_progress` tests pass. The headline flip
   `ip=1 + sealed manifest → single_in_progress` is the intended fix (aligns with `runOrient`).
2. **Cross-edition parity.** `crossCheckStatus` body md5-identical across all four editions;
   `validate-script-sync.js` green (claude↔plugin byte-identical; gitlab/gitea diffs byte-identical
   to base).
3. **Shared fixture / anti-drift.** `fixtures-orphan-legality.js` imported by both test files; both
   share `ORPHAN_LEGALITY_MANIFEST` + EXPECTED constants — the manifest axis (the F1 disagreement
   source) is genuinely shared on both sites.
4. **No scope creep.** Exactly the 7 intended files changed; `adaptive-node.js` production untouched.
5. **Tests green (real exit codes).** test-parallel-batch 120 assertions exit 0; test-adaptive-node
   140 assertions exit 0; simulate-workflow-walkthrough exit 0; `npm test` exit 0 (all four lanes).

## Verdict

verdict: pass
findings_blocking: 0
finding: id=R1 severity=low scope=out_of_scope action=follow_up status=open file=scripts/test-adaptive-node.js summary=imported-ORPHAN_LEGALITY_IN_PROGRESS_IDS-unused-orient-test-rederives-single-in_progress-row-from-inline-ledger-so-anti-drift-binding-covers-in_progress-axis-only-on-parallel-batch-site-manifest-axis-shared-both-sites-non-blocking

## R1 disposition (orchestrator judgment, advisor-confirmed)
Non-blocking and accepted as a follow-up. The `in_progress` axis cannot be mechanically shared by
construction (`crossCheckStatus` consumes an array; `runOrient` parses a markdown ledger), so the
"fix" (deriving the inline ledger row from the array) would catch zero production drift the current
tests don't already catch. The load-bearing manifest axis IS shared on both sites. Recorded as a
durable follow-up (CHANGELOG note + follow-up issue), not deferred required work.
