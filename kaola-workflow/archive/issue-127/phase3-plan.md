# Phase 3 - Plan: issue-127

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-sink-merge.js` | Add label removal try/catch inside Step 8 OFFLINE guard | GitHub sink-merge drops issue but leaves workflow:in-progress |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Add label removal try/catch at closeLinkedIssue (line 122) and Step 8 (line 236) | GitLab has two close paths; both need label cleanup |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Add label removal try/catch at closeLinkedIssue (line 122) and Step 8 (line 236) | Gitea has two close paths; both need label cleanup |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | Extend withForge closeIssue test (lines 188-212) with updateIssue stub + assertion | No test coverage for label removal today |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | Extend withForge Test 6 (lines 197-222) with updateIssueLabels stub + assertion | No test coverage for label removal today |
| `CHANGELOG.md` | Add ### Fixed entry under [Unreleased] | Document user-visible fix |

### Build Sequence
All tasks have disjoint write sets — all run in parallel.

1. Task A, B, C, D — parallel (all disjoint files)

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | A, B, C, D | all write sets are disjoint |

### External Dependencies
None new. All forge APIs already imported.

## Task List

### Task A: GitHub — label removal at Step 8
- File: `scripts/kaola-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (regression check; no new unit test feasible)
- Write Set: `scripts/kaola-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Inside `if (!OFFLINE && args.issue != null)` block (lines 202-206), after the `catch (_) {}` on line 205 and before the closing `}` on line 206, add:
  ```js
    try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress']); } catch (_) {}
  ```
  Result:
  ```js
  if (!OFFLINE && args.issue != null) {
    try { ghExec(['issue', 'close', String(args.issue), '--comment', 'Merged via sink-merge.']); }
    catch (_) {}
    try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress']); } catch (_) {}
  }
  ```
  Note: GitHub sink-merge has no `forge` module; uses literal string `'workflow:in-progress'`, not `forge.CLAIM_LABEL`.
- Mirror: `scripts/kaola-workflow-claim.js:272` — `try { ghExec(['issue', 'edit', String(issueNumber), '--remove-label', CLAIM_LABEL]); } catch (_) {}`
- Validate: `node scripts/simulate-workflow-walkthrough.js` from worktree root (must exit 0)

### Task B: GitLab — test + impl (full red→green cycle in one tdd-guide task)
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`, `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY (both files)
- Implement — Test first (RED phase):
  Extend the `withForge` block at lines 188-212 in `test-gitlab-sinks.js`:
  - Add `let updateIssueCalled = null;` before the `withForge(` call
  - Add `updateIssue(issueIid, opts) { updateIssueCalled = { issueIid, opts }; return null; },` to the stubs object
  - After `assert.strictEqual(result.close.note_id, 9001);` add:
    ```js
    assert.ok(updateIssueCalled, 'forge.updateIssue should have been called');
    assert.strictEqual(updateIssueCalled.issueIid, 71);
    assert.ok(
      Array.isArray(updateIssueCalled.opts.unlabels) &&
      updateIssueCalled.opts.unlabels.includes(forge.CLAIM_LABEL),
      'updateIssue opts.unlabels must include forge.CLAIM_LABEL'
    );
    ```
  Test should fail (RED) — `updateIssue` not yet called in production code.
- Implement — Production (GREEN phase):
  In `kaola-gitlab-workflow-sink-merge.js`:
  - **Site 1 — `closeLinkedIssue`** (after line 122 `const closed = forge.closeIssue(issueIid);`, before line 123 `return { note_id: ... }`):
    ```js
    try { forge.updateIssue(issueIid, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}
    ```
  - **Site 2 — Step 8** (after line 236 `try { forge.closeIssue(args.issue); } catch (_) {}`, before line 237 `}`):
    ```js
    try { forge.updateIssue(args.issue, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}
    ```
- Mirror: `kaola-gitlab-workflow-claim.js:224` — `try { forge.updateIssue(issueIid, { unlabels: [CLAIM_LABEL] }); } catch (_) {}`
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` from worktree root (must exit 0)

### Task C: Gitea — test + impl (full red→green cycle in one tdd-guide task)
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`, `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY (both files)
- Implement — Test first (RED phase):
  Extend the `withForge` block at lines 197-222 (Test 6) in `test-gitea-sinks.js`:
  - Add `let updateIssueLabelsCalled = null;` before the `withForge(` call
  - Add `updateIssueLabels(project, issueNum, opts) { updateIssueLabelsCalled = { project, issueNum, opts }; return {}; },` to the stubs object
  - After `assert.strictEqual(result.close.comment_id, 9001);` add:
    ```js
    assert.ok(updateIssueLabelsCalled, 'forge.updateIssueLabels should have been called');
    assert.strictEqual(updateIssueLabelsCalled.issueNum, 71);
    assert.ok(
      Array.isArray(updateIssueLabelsCalled.opts.remove) &&
      updateIssueLabelsCalled.opts.remove.includes(forge.CLAIM_LABEL),
      'updateIssueLabels opts.remove must include forge.CLAIM_LABEL'
    );
    ```
  Test should fail (RED) — `updateIssueLabels` not yet called in production code.
- Implement — Production (GREEN phase):
  In `kaola-gitea-workflow-sink-merge.js`:
  - **Site 1 — `closeLinkedIssue`** (after line 122 `const closed = forge.closeIssue(issueIid, options);`, before line 123 `return { comment_id: ... }`). `projectInfo` is in scope from line 120:
    ```js
    try { forge.updateIssueLabels(projectInfo, issueIid, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}
    ```
  - **Site 2 — Step 8** (after line 236 `try { forge.closeIssue(args.issue); } catch (_) {}`, before line 237 `}`). Line 234 declares `const root = mainRoot;`; line 235 already uses `readProjectInfo(root, args.project)`:
    ```js
    try { forge.updateIssueLabels(readProjectInfo(root, args.project), args.issue, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}
    ```
- Mirror: `kaola-gitea-workflow-claim.js:222` — `try { if (projectInfo && projectInfo.full_name) { forge.updateIssueLabels(projectInfo, issueIid, { remove: [CLAIM_LABEL] }); } } catch (_) {}`
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` from worktree root (must exit 0)

### Task D: CHANGELOG entry
- File: `CHANGELOG.md`
- Test File: none
- Write Set: `CHANGELOG.md`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Under `[Unreleased]`, add (creating `### Fixed` section if absent):
  ```
  ### Fixed
  - Remove `workflow:in-progress` label when linked issue is closed via sink-merge (GitHub, GitLab, Gitea) (#127)
  ```
- Mirror: existing CHANGELOG convention (see prior entries)
- Validate: visual inspection only

## Advisor Notes
Advisor confirmed Option A approach. Recommended per-forge task consolidation (test + impl in one tdd-guide invocation per forge) to enable proper red→green TDD cycle. Confirmed: GitHub uses literal label string (no forge module); Step 8 production path in GitLab/Gitea has no new test (accepted gap); Gitea Step 8 uses `root` variable (not `mainRoot`).

## Known Coverage Gap (Accepted)
Step 8 production-merge path in GitLab/Gitea (reached when `skipGit: false` and MR completes) is not covered by a new test. Only the `closeLinkedIssue` skipGit:true path is tested. Both paths call the same forge API. This gap is documented and accepted per Phase 1 research.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | single pass sufficient; advisor items synthesized directly | task structure and variable name were minor clarifications |
