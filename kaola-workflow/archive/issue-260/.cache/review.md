# Node review (code-reviewer, G1) — evidence

verdict: pass
findings_blocking: 0

G1 gate post-dominates impl-core, impl-forge, impl-docs. Reviewed full cumulative diff (4 claim.js editions + tests + docs). Re-ran `npm test` independently: exit 0, all 4 editions green, validate-script-sync green ("15 common scripts and 5 byte-identical file group in sync").

## Per-AC
- AC1 in-place startup → HEAD on workflow/issue-N, base_branch recorded, tree clean: PASS (claimProject in-place block; testWorktreeNativeDefaultOff Case A).
- AC2 idempotent re-claim reuses branch: PASS (branchExists→checkout, testWorktreeNativeInPlaceIdempotentReclaim, folder-absent/branch-present).
- AC3 dirty→typed refusal; detached/no-history→record-only no crash: PASS (dirty_tree_refused gate; Cases C, D).
- AC4 worktree-native path unchanged: PASS (standalone if, mutually exclusive; #246 tests green).
- AC5 discard restores base + removes created branch: PASS (cmdRelease reads base_branch via field() pre-archive, checkout base before branch -D, only folder.branch; Case F + non-default-base discriminating test).
- AC6 regression tests + npm test ×4 + validate-script-sync: PASS.

## Focus confirmations
- Trigger: standalone `if (wouldInPlace)`, not else; does not fire OFFLINE/no-history/NATIVE=1; worktree guard untouched.
- Ordering: dirty gate after existing→owned early-return + probe, before mkdir (no orphan folder; resume not refused).
- base_branch trap guard `(cur && cur!=='HEAD' && cur!==branch)?cur:''` prevents self-base.
- Cross-edition byte-identity (scripts vs plugins/kaola-workflow) holds; forge prefixes from buildBranchName; active-folders.js untouched all editions.
- cmdFinalize keeps branch_removed:'kept' (sink-merge unaffected); watch-pr CLOSED/MERGED keep branch.

## Non-blocking nits
1. cmdRelease (discard) now force-deletes workflow/issue-N even in NATIVE=1 mode (previously kept) — acceptable: explicit abandon path, reflog-recoverable, removeWorktree --force already dropped uncommitted; non-discard paths untouched. Intentional per plan.
2. LOW: no test for folder-PRESENT+dirty→owned (resume-not-refused ordering); verified by code read.
3. Follow-up (plan-flagged): watch-pr CLOSED/abandoned paths lack in-place branch restore/delete — out of write-set.

Verdict: PASS — no CRITICAL/HIGH. Ready for finalize.
