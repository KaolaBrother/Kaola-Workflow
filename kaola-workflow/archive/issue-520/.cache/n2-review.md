evidence-binding: n2-review e5af1a24d4f9
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=follow_up status=deferred severity=low fix_role=tdd-guide rationale=#520 tests pass against an add-only half-fix because they run on a fresh repo where the journal was never previously tracked; add an already-tracked-journal case so the commit-side exclude regression bites.

## n2-review (G1 code-review gate) — issue #520

Reviewed the accumulated branch diff vs baseline: exactly 7 files, matching the declared write set.

### Checklist results
1. Two surfaces (add + commit) — PASS. The :(exclude) pathspecs (sink-receipt.json + sink-fallback.json) are applied to BOTH the `git add -- <ps> ...exclude` AND the `git commit -- <ps> ...exclude` in all 4 editions. Verified empirically that `git commit -- <archive-band>` re-sweeps an already-tracked, modified journal even after an exclude-aware `git add` — so the commit-side exclude is load-bearing and the fix correctly carries it. No half-fix.
2. Exclude, not delete — PASS. Fix only keeps journals out of staging/commit; no rm/move of the on-disk file. The post-commit writeSinkReceipt(archRcptPath/archiveReceiptPath, ...) into the archive .cache/ path is untouched in every edition (claude 1184, gitlab 1061, gitea 1055).
3. Both journals excluded — PASS. sink-receipt.json AND sink-fallback.json both excluded everywhere.
4. Codex twin byte-identity — PASS. `diff scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` → zero diff.
5. Forge ports faithful — PASS. gitlab + gitea apply the same semantic exclusion; pathspec construction correct per edition; exclude paths match each port's receipt/fallback write target (archive .cache/).
6. Test asserts tracked-status, not disk-existence — PASS. All 3 homes assert `git ls-files ... === ''` AND on-disk existence of the receipt (crash-resume invariant). Not vacuous.
7. Pathspec correctness — PASS. `:(exclude)kaola-workflow/archive/<project>/.cache/sink-receipt.json` exactly matches the write path resolved relative to mainRoot (the `-C mainRoot` cwd). Same for sink-fallback.json.
8. Scope — PASS. No file outside the 7-file write set; `git diff --stat -- kaola-workflow/archive/` empty (no foreign committed receipts removed; FOREIGN_ARCHIVE guard intact).

### Verification run (read-only)
- claude `simulate-workflow-walkthrough.js` → exit 0, testSinkTransactionCleanEndToEnd PASSED, "Workflow walkthrough simulation passed".
- `test-gitlab-sinks.js` → exit 0, "GitLab #520 journal-exclusion from archive_commit: PASSED".
- `test-gitea-sinks.js` → exit 0, "Gitea #520 journal-exclusion from archive_commit: PASSED".
- Mutation test (temp copy, full revert of source fix): gitlab #520 test goes RED (AssertionError on lsFiles === '') — confirms the test bites the real #520 bug (untracked-journal sweep). RED→GREEN genuine.

### Non-blocking finding (R1)
The #520 tests run on a fresh repo where the journal was never previously tracked. Empirically, an add-only half-fix (commit-side exclude removed) still PASSES these tests, because `git commit -- <ps>` only re-sweeps a journal that is ALREADY tracked. The shipped fix is correct (commit-side exclude present), but the test would not catch a future regression that drops only the commit-side exclude. Recommend a follow-up test case with an already-tracked, modified journal. Test-robustness improvement, not a defect in the deliverable — does not block.

Verdict: PASS — 0 blocking findings; 1 low-severity non-blocking follow-up (R1).
