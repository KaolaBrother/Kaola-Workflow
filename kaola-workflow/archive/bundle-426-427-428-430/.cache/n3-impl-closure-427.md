evidence-binding: n3-impl-closure-427 2eec1e20dfec
non_tdd_reason: glue/wiring — connecting existing ghExec + probeIssueState building blocks to complete the issue-close path in cmdFinalize; no natural failing unit test; verified by regression-green four-chain suite
regression-green

## #427 — cmdFinalize closes issues (impl)

### Changes made

**`scripts/kaola-workflow-claim.js`** (and byte-identical codex twin):
1. Added `closeIssueIdempotent(n, opts)` function (probe-before-close pattern, mirrors sink-merge.js).
2. Added `#427` close-execution block in `cmdFinalize` after the probe-bucket computation, gated on `!keepIssueOpen && !OFFLINE && !args.keepWorktree`. For bundles: drains `openIssues` bucket, calls `closeIssueIdempotent` per member, moves to `closedIssues` or `failedIssueClosures`, recomputes `remoteIssueClosed`. For single-issue: closes if not already closed.
3. Added `closure` roll-up attachment post-build: `closureReceipt.closure = { attempted, closed, failed, skipped_offline, kept_open }`.

**`scripts/test-bundle-finalize.js`**:
- Test (2b) "merge-lane finalize" added `--keep-worktree` to `runFinalize` call. Without `--keep-worktree`, the new close-execution block would fire and attempt to close member 47, conflicting with the merge-lane scenario where sink-merge owns member closure.

Note: `scripts/kaola-workflow-closure-contract.js` schema edits (adding `anchored_root` to CLOSURE_RECEIPT_FIELDS, `roadmap-residue-clean` to CLOSURE_INVARIANTS) moved to n4's write-set (FILE_CEILING constraint).

### Test result
All four chains green:
- `npm run test:kaola-workflow:claude` → exit 0
- `npm run test:kaola-workflow:codex` → exit 0
- `npm run test:kaola-workflow:gitlab` → exit 0
- `npm run test:kaola-workflow:gitea` → exit 0

### Byte-pair verification
```
diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js → empty
```
