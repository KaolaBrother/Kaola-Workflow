# Architect Blueprint: issue-168 — sink-merge non-silent failure warning (AC#3)

## Summary

Only AC#3 remains: add stderr warning when `closeIssue` fails. 3 source files + 1 plugin copy sync + 1 test.

## Design Decisions

- stderr warning + receipt field, not exit code change (merge already succeeded; non-zero would falsely signal merge failure)
- Warn ONLY on `closeIssue` catch; label-removal and merge-note catches stay silent `catch (_)`
- Per-edition CLI hint in warning (gh/glab/tea)
- Plugin copy is a `cp`, not hand-edit (`validate-script-sync.js` enforces byte-identical parity)
- Test shim discriminates on argv (exits 1 only for `issue close`, exits 0 for `issue edit`) to isolate the close-path assertion
- No `registerTest()` helper exists — use bare call inside `main()` after line 3378

## Files to Modify

| # | File | Change | Line |
|---|------|--------|------|
| T1 | `scripts/kaola-workflow-sink-merge.js` | `issue close` catch → warning | 239 |
| T2 | `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | cp from canonical | whole file |
| T3 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | `forge.closeIssue` catch → warning | 269 |
| T4 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | `forge.closeIssue` catch → warning | 269 |
| T5 | `scripts/simulate-workflow-walkthrough.js` | add `testSinkMergeCloseFailureWarning` fn + register | after 3013; register after 3378 |

## Exact Changes

### T1 — GitHub canonical line 239
Old: `catch (_) { remoteIssueClosed = 'failed'; }`
New: `catch (e) { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for ' + args.issue + '; receipt.remote_issue_closed=failed. Manually run: gh issue close ' + args.issue + '\n'); }`
Line 240 (issue edit catch) stays `catch (_) { claimLabelRemoved = 'failed'; }`.

### T2 — plugin copy sync
`cp scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
Run from repo root. Do NOT hand-edit.

### T3 — GitLab line 269
Old: `try { forge.closeIssue(args.issue, forgeOpts); remoteIssueClosed = 'closed'; } catch (_) { remoteIssueClosed = 'failed'; }`
New: `try { forge.closeIssue(args.issue, forgeOpts); remoteIssueClosed = 'closed'; } catch (e) { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for ' + args.issue + '; receipt.remote_issue_closed=failed. Manually run: glab issue close ' + args.issue + '\n'); }`
Lines 268 and 270 untouched.

### T4 — Gitea line 269
Old: `try { forge.closeIssue(args.issue, forgeOpts); remoteIssueClosed = 'closed'; } catch (_) { remoteIssueClosed = 'failed'; }`
New: `try { forge.closeIssue(args.issue, forgeOpts); remoteIssueClosed = 'closed'; } catch (e) { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for ' + args.issue + '; receipt.remote_issue_closed=failed. Manually run: tea issues close ' + args.issue + '\n'); }`
Lines 268 and 270 untouched.

### T5 — AC#3 test
New function `testSinkMergeCloseFailureWarning()` after line 3013.
- Setup: `initGitRepoWithBareRemote(tmp)`, create/push `workflow/issue-168f`, checkout main
- Shim: exits 1 for `issue close`, exits 0 for all other calls
- Invoke `sinkMergeScript` with project `issue-168f`, branch `workflow/issue-168f`, issue `168`
- Assertions:
  1. `result.status === 0`
  2. `result.stderr.includes('sink-merge: WARNING: issue close failed for 168')`
  3. `parsed.closure_receipt.remote_issue_closed === 'failed'`
  4. Negative control: `parsed.closure_receipt.claim_label_removed === 'removed'`
- Register: insert `testSinkMergeCloseFailureWarning();` after `testSinkMergeMockabilityAndReceipt();` in `main()` (line ~3378)

## Build Sequence

1. T1 (GitHub canonical) — gates T2, T5
2. T2 (cp plugin copy) — depends on T1; must follow immediately
3. T3 (GitLab) — independent; can be done with T1/T4
4. T4 (Gitea) — independent; can be done with T1/T3
5. T5 (test) — after T1
6. `npm test` — final gate

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A (parallel) | T1, T3, T4 | disjoint files |
| Serial | T2 after T1 | cp depends on T1 being complete |
| Serial | T5 after T1 | test targets T1's change |
| Final | npm test | after all above |

## Validation per Task

- T1: `node -c scripts/kaola-workflow-sink-merge.js`
- T2: `node scripts/validate-script-sync.js` + `diff -q scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- T3: `node -c plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- T4: `node -c plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- T5: `node scripts/simulate-workflow-walkthrough.js` — exit 0 + `testSinkMergeCloseFailureWarning: PASSED`
- Gate: `npm test` — authoritative completion gate

## Out of Scope

- CWD fix — already applied; no change
- `testSinkMergeMockabilityAndReceipt` — leave intact
- `issue edit --remove-label`, `updateIssue`, `updateIssueLabels`, `createIssueNote`, `createIssueComment` catches — stay `catch (_)`
- Exit codes — must stay 0
- `validate-script-sync.js` — invoke only, never edit
- `simulate-kaola-workflow-walkthrough.js` — no test added
