# Architect Blueprint — Issue #127

## Verified Line Numbers (from worktree .kw/issue-127/)

### scripts/kaola-workflow-sink-merge.js
- Step 8 block: lines 202-206
  ```js
  // Step 8 — Close issue
  if (!OFFLINE && args.issue != null) {
    try { ghExec(['issue', 'close', String(args.issue), '--comment', 'Merged via sink-merge.']); }
    catch (_) {}
  }
  ```
  Add label removal inside the `!OFFLINE && args.issue != null` guard, after the close try/catch.

### plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js
- `closeLinkedIssue` function: line 116-124
  - Line 122: `const closed = forge.closeIssue(issueIid);` → add label removal after
- Step 8 block: lines 232-237
  - Line 236: `try { forge.closeIssue(args.issue); } catch (_) {}` → add label removal after

### plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js
- `closeLinkedIssue` function: line 116-124
  - Line 122: `const closed = forge.closeIssue(issueIid, options);` → add label removal after
  - `projectInfo` is a local variable at line 120
- Step 8 block: lines 232-237
  - Line 235: `try { forge.createIssueComment(readProjectInfo(root, args.project), args.issue, ...); } catch (_) {}`
  - Line 236: `try { forge.closeIssue(args.issue); } catch (_) {}` → add label removal after (call readProjectInfo inline)

### plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js
- Existing closeIssue test: lines 188-212 (`withForge` block with `createIssueNote` + `closeIssue`)
- Extend: add `updateIssue` stub + `labelRemoved` assertion variable

### plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js
- Existing Test 6: lines 197-222 (`withForge` block with `createIssueComment` + `closeIssue`)
- Extend: add `updateIssueLabels` stub + `labelRemoved` assertion variable

## Files to Create
None.

## Files to Modify

| File | Specific Change | Why |
|------|----------------|-----|
| `scripts/kaola-workflow-sink-merge.js` | Add label removal try/catch after issue close in Step 8 (inside existing OFFLINE guard) | GitHub sink-merge does not remove workflow:in-progress on close |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Add label removal try/catch after `forge.closeIssue` in both `closeLinkedIssue` (line 122) and Step 8 (line 236) | GitLab sink-merge does not remove label on either code path |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Add label removal try/catch after `forge.closeIssue` in both `closeLinkedIssue` (line 122) and Step 8 (line 236) | Gitea sink-merge does not remove label on either code path |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | Extend withForge closeIssue test (lines 188-212): add `updateIssue` stub + assert called with CLAIM_LABEL | No test coverage for label removal today |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | Extend withForge Test 6 (lines 197-222): add `updateIssueLabels` stub + assert called with CLAIM_LABEL | No test coverage for label removal today |
| `CHANGELOG.md` | Add `### Fixed` entry under `[Unreleased]` for issue #127 | Document user-visible fix |

## Build Sequence

1. Task A, Task B, Task D, Task F — all disjoint files, run in parallel
2. Task C — depends on Task B (tests the GitLab implementation)
3. Task E — depends on Task D (tests the Gitea implementation)

Tasks C and E can run in parallel with each other after their respective implementations.

## Task List

### Task A: GitHub — label removal at Step 8
- File: `scripts/kaola-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (regression check only; no new unit test feasible)
- Write Set: `scripts/kaola-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: Group 1
- Action: MODIFY
- Implement: Inside the `if (!OFFLINE && args.issue != null)` block (lines 202-206), after the existing `catch (_) {}` at line 205, add:
  ```js
    try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress']); } catch (_) {}
  ```
- Mirror: `scripts/kaola-workflow-claim.js:272` — `try { ghExec(['issue', 'edit', String(issueNumber), '--remove-label', CLAIM_LABEL]); } catch (_) {}`
- Validate: `node scripts/simulate-workflow-walkthrough.js` (regression — exits 0)

### Task B: GitLab — label removal at two sites
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: Group 1
- Action: MODIFY
- Implement Site 1 — `closeLinkedIssue` (after line 122 `const closed = forge.closeIssue(issueIid)`):
  ```js
  try { forge.updateIssue(issueIid, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}
  ```
  Insert before the `return { note_id: ... }` on line 123.
- Implement Site 2 — Step 8 (after line 236 `try { forge.closeIssue(args.issue); } catch (_) {}`):
  ```js
  try { forge.updateIssue(args.issue, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}
  ```
- Mirror: `kaola-gitlab-workflow-claim.js:224` — `try { forge.updateIssue(issueIid, { unlabels: [CLAIM_LABEL] }); } catch (_) {}`
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (regression — exits 0)

### Task C: GitLab test — assert label removal called
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Test File: same (self-contained)
- Write Set: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Depends On: Task B
- Parallel Group: Group 2
- Action: MODIFY
- Implement: Rewrite the `withForge` block at lines 188-212 to add:
  - `let labelRemoved = false;` before the `withForge(` call
  - `updateIssue(issueIid, opts) { assert.strictEqual(issueIid, 71); assert.deepStrictEqual(opts.unlabels, [forge.CLAIM_LABEL]); labelRemoved = true; }` in the stubs object
  - `assert.strictEqual(labelRemoved, true, 'updateIssue should be called with CLAIM_LABEL');` inside the callback after the existing assertions
- Mirror: existing `withForge` pattern at lines 188-212
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (must exit 0 with new assertion passing)

### Task D: Gitea — label removal at two sites
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: Group 1
- Action: MODIFY
- Implement Site 1 — `closeLinkedIssue` (after line 122 `const closed = forge.closeIssue(issueIid, options)`):
  ```js
  try { forge.updateIssueLabels(projectInfo, issueIid, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}
  ```
  `projectInfo` is the local variable from line 120. Insert before the `return { comment_id: ... }` on line 123.
- Implement Site 2 — Step 8 (after line 236 `try { forge.closeIssue(args.issue); } catch (_) {}`):
  ```js
  try { forge.updateIssueLabels(readProjectInfo(root, args.project), args.issue, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}
  ```
  `root` is already `const root = mainRoot` at line 234.
- Mirror: `kaola-gitea-workflow-claim.js:222-226` — `try { if (projectInfo && projectInfo.full_name) { forge.updateIssueLabels(projectInfo, issueIid, { remove: [CLAIM_LABEL] }); } } catch (_) {}`
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` (regression — exits 0)

### Task E: Gitea test — assert label removal called
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Test File: same (self-contained)
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Depends On: Task D
- Parallel Group: Group 2
- Action: MODIFY
- Implement: Rewrite the `withForge` block at lines 197-222 (Test 6) to add:
  - `let labelRemoved = false;` before the `withForge(` call
  - `updateIssueLabels(projectInfo, issueNum, opts) { assert.strictEqual(issueNum, 71); assert.deepStrictEqual(opts.remove, [forge.CLAIM_LABEL]); labelRemoved = true; }` in the stubs object
  - `assert.strictEqual(labelRemoved, true, 'updateIssueLabels should be called with CLAIM_LABEL');` inside the callback after the existing assertions
- Mirror: existing `withForge` pattern at lines 197-222
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` (must exit 0 with new assertion passing)

### Task F: CHANGELOG entry
- File: `CHANGELOG.md`
- Test File: none
- Write Set: `CHANGELOG.md`
- Depends On: none
- Parallel Group: Group 1
- Action: MODIFY
- Implement: Under `[Unreleased]` → `### Fixed`, add:
  `- Remove \`workflow:in-progress\` label on linked issue closure in GitHub, GitLab, and Gitea sink-merge scripts (issue #127)`
- Mirror: existing CHANGELOG convention
- Validate: manual inspection (no test)

## Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| 1 | A, B, D, F | disjoint write sets (different files) |
| 2 | C, E | disjoint write sets; each depends on its forge implementation (B and D respectively) from Group 1 |

## External Dependencies
None new. All forge label APIs already imported via `const forge = require('./kaola-XXX-forge')` at line 8 of each sink-merge script.

## Out of Scope
- No shared cross-forge label-removal helper
- No clearAdvisoryClaim export or import in any sink-merge script
- No comment posting on label clear
- No change to closeLinkedIssue function signature
- No changes to any claim script
- No new GitHub unit test harness
- No cleanup script committed to the repo
- One-time cleanup of 14 stale closed issues deferred to Phase 6 Step 7
