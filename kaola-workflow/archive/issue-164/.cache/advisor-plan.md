# Advisor — Plan Gate: issue-164

## Issues Found and Resolutions

### 1. Does sink-merge invoke checkClosureInvariants? → YES (locked)

Sink-merge IS a closure path and owns the branch-delete work. It MUST run `checkClosureInvariants`. Resolution:
- Compute `archiveDest = path.join(mainRoot, 'kaola-workflow', 'archive', args.project)` — finalize already ran (enforced by `assertNoLiveWorkflowFolder`); the archive dir exists.
- Call `checkClosureInvariants(mainRoot, receipt, archiveDest)` after building the receipt.
- Include `closure_invariants` in the emitted JSON.

### 2. cmdWatchPr per-folder archiveDest threading → explicit in plan

Each folder's `archiveProjectDir(root, folder)` call returns `result.dest`. That value is passed as `archiveDest` to `checkClosureInvariants(root, receipt, result.dest)`. If `archiveProjectDir` throws, `archiveDest` is undefined — invariant `archive-state-closed` skips gracefully (matches offline-skip pattern).

### 3. emptyReceipt() warnings field → in schema, safe

Confirmed: `CLOSURE_RECEIPT_FIELDS.warnings = 'string[]'` and `emptyReceipt()` initializes to `[]`. The `buildClosureReceipt` helper correctly appends `steps.warnings` to `receipt.warnings`. No schema change needed.

### 4. Invariant coverage in 4 tests → tests 1 and 3 add assertion

No 5th test needed (Phase 2 lock). Adjust:
- `testSinkMergeEmitsClosureReceipt`: also assert `receipt.closure_invariants.ok === true`
- `testFinalizeOfflineClosureReceiptSkipped`: also assert `closure_invariants.ok === true`

### 5. GitLab/Gitea sink-merge forge→receipt field mapping (per file:line)

**GitLab (`kaola-gitlab-workflow-sink-merge.js` L259-266):**
| Forge call | Receipt field |
|-----------|--------------|
| `forge.closeIssue(args.issue)` | `remote_issue_closed` → `'closed'`/`'failed'` |
| `forge.updateIssue(args.issue, {unlabels: [forge.CLAIM_LABEL]})` | `claim_label_removed` → `'removed'`/`'failed'` |
| `git branch -d args.branch` | `branch_removed` → `'removed'`/`'failed'` |
| `removeWorktree` result | `worktree_removed` → mapped enum |

**Gitea (`kaola-gitea-workflow-sink-merge.js` L259-266):**
| Forge call | Receipt field |
|-----------|--------------|
| `forge.closeIssue(args.issue)` | `remote_issue_closed` → `'closed'`/`'failed'` |
| `forge.updateIssueLabels(projectInfo, args.issue, {remove: [forge.CLAIM_LABEL]})` | `claim_label_removed` → `'removed'`/`'failed'` |
| `git branch -d args.branch` | `branch_removed` → `'removed'`/`'failed'` |
| `removeWorktree` result | `worktree_removed` → mapped enum |

Both forges: `OFFLINE` path → `remote_issue_closed: 'skipped_offline'`, `claim_label_removed: 'skipped_offline'`, `branch_removed: 'kept'` (or `'failed'` if branch delete attempted and fails; keep consistent with GitHub).

`archive`/`roadmap_source_removed`/`roadmap_regenerated` probed from post-conditions in all 3 sink-merges.

## Verdict
Blueprint is sound. Proceed with phase3-plan.md incorporating these 5 fixes.
