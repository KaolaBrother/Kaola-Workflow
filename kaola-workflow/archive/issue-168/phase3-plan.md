# Phase 3 - Plan: issue-168

## Blueprint

### Files to Create
| File | Purpose | Key Interfaces |
|------|---------|----------------|
| (none) | — | — |

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-sink-merge.js` | `closeIssue` catch → stderr warning (line 239) | AC#3: non-silent failure warning |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Sync via `cp` from canonical | Plugin copy must be byte-identical per validate-script-sync.js |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | `forge.closeIssue` catch → stderr warning (line 269) | AC#3: GitLab edition |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | `forge.closeIssue` catch → stderr warning (line 269) | AC#3: Gitea edition |
| `scripts/simulate-workflow-walkthrough.js` | Add `testSinkMergeCloseFailureWarning()` fn + register | AC#3 regression test |

### Build Sequence
1. T1 — GitHub canonical (line 239 catch change) — gates T2 and T5
2. T2 — plugin copy `cp` — depends on T1 complete
3. T3 — GitLab edition (line 269 catch change) — independent
4. T4 — Gitea edition (line 269 catch change) — independent
5. T5 — Add test function + registration — after T1
6. `npm test` — final gate

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | T1, T3, T4 | Disjoint files |
| Serial | T2 after T1 | `cp` depends on T1 being complete |
| Serial | T5 after T1 | Test targets T1's change |
| Final | npm test | After all above |

### External Dependencies
None. All patterns are internal.

## Task List

### Task 1: GitHub canonical — closeIssue catch warning
- File: `scripts/kaola-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Line 239 — change `catch (_) { remoteIssueClosed = 'failed'; }` to `catch (e) { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for ' + args.issue + '; receipt.remote_issue_closed=failed. Manually run: gh issue close ' + args.issue + '\n'); }`
- Mirror: Existing catch-with-warning pattern at close site
- Validate: `node -c scripts/kaola-workflow-sink-merge.js`

### Task 2: Plugin copy sync
- File: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Depends On: Task 1
- Parallel Group: serial (after T1)
- Action: MODIFY (via cp)
- Implement: `cp scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Validate: `node scripts/validate-script-sync.js` + `diff -q scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`

### Task 3: GitLab edition — closeIssue catch warning
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Line 269 — change `catch (_) { remoteIssueClosed = 'failed'; }` to `catch (e) { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for ' + args.issue + '; receipt.remote_issue_closed=failed. Manually run: glab issue close ' + args.issue + '\n'); }`
- Validate: `node -c plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`

### Task 4: Gitea edition — closeIssue catch warning
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Line 269 — change `catch (_) { remoteIssueClosed = 'failed'; }` to `catch (e) { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for ' + args.issue + '; receipt.remote_issue_closed=failed. Manually run: tea issues close ' + args.issue + '\n'); }`
- Validate: `node -c plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`

### Task 5: Test — testSinkMergeCloseFailureWarning
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Task 1
- Parallel Group: serial (after T1)
- Action: MODIFY
- Implement:
  - Add function `testSinkMergeCloseFailureWarning()` after line 3013 (after `testSinkMergeMockabilityAndReceipt` function body ends)
  - Shim: exits 1 for `issue close`, exits 0 (stdout `{}\n`) for all other calls
  - Setup: `initGitRepoWithBareRemote(tmp)`, create/push `workflow/issue-168f`, checkout main
  - Invoke: `sinkMergeScript` with project `issue-168f`, branch `workflow/issue-168f`, issue `168`
  - Assertions: (1) `result.status === 0`, (2) `result.stderr.includes('sink-merge: WARNING: issue close failed for 168')`, (3) `parsed.closure_receipt.remote_issue_closed === 'failed'`, (4) `parsed.closure_receipt.claim_label_removed === 'removed'`
  - Register: insert `testSinkMergeCloseFailureWarning();` after line 3378 (`testSinkMergeMockabilityAndReceipt();`)
- Validate: `node scripts/simulate-workflow-walkthrough.js` — exit 0 + `testSinkMergeCloseFailureWarning: PASSED`

## Advisor Notes

Blueprint is execution-ready per `.cache/advisor-plan.md`. No architect revision needed. Build sequence is dependency-safe. Test shim discriminates `issue close` (exit 1) from `issue edit` (exit 0) to isolate close-path assertion. Four assertions cover exit code, stderr warning, receipt field, and negative control.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor found no gaps; blueprint approved in one pass |
