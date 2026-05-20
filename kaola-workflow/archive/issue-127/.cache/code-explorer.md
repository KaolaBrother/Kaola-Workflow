# Code Explorer Output — Issue #127

## Summary
Three sink-merge scripts close the linked issue without removing the `workflow:in-progress` advisory label. The label-removal pattern (`clearAdvisoryClaim`) exists in all three claim scripts but is not imported or called in any sink-merge script.

## 1. clearAdvisoryClaim — Pattern to Mirror

**GitHub** (`scripts/kaola-workflow-claim.js:270-276`):
```js
function clearAdvisoryClaim(issueNumber, reason) {
  if (OFFLINE || issueNumber == null) return;
  try { ghExec(['issue', 'edit', String(issueNumber), '--remove-label', CLAIM_LABEL]); } catch (_) {}
  if (reason) {
    try { ghExec(['issue', 'comment', String(issueNumber), '--body', 'Kaola-Workflow advisory claim cleared: ' + reason]); } catch (_) {}
  }
}
```
- `CLAIM_LABEL = 'workflow:in-progress'` defined at line 16 of claim.js
- Uses local `ghExec`; all errors silently swallowed
- OFFLINE guard at start

**GitLab** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:220-228`):
```js
function clearAdvisoryClaim(issueIid, reason, projectInfo) {
  if (issueIid == null) return;
  try { forge.updateIssue(issueIid, { unlabels: [CLAIM_LABEL] }); } catch (_) {}
  ...
}
```
- CLAIM_LABEL from `forge.CLAIM_LABEL` (exported at gitlab-forge.js:214)

**Gitea** (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:220-232`):
```js
function clearAdvisoryClaim(issueIid, reason, projectInfo) {
  if (issueIid == null) return;
  try {
    if (projectInfo && projectInfo.full_name) {
      forge.updateIssueLabels(projectInfo, issueIid, { remove: [CLAIM_LABEL] });
    }
  } catch (_) {}
  ...
}
```
- CLAIM_LABEL from `forge.CLAIM_LABEL` (exported at gitea-forge.js:282)
- Requires `projectInfo.full_name`

## 2. Issue-Close Paths (Where to Add Label Cleanup)

**GitHub** (`scripts/kaola-workflow-sink-merge.js:202-206`):
```js
// Step 8 — Close issue
if (!OFFLINE && args.issue != null) {
  try { ghExec(['issue', 'close', String(args.issue), '--comment', 'Merged via sink-merge.']); }
  catch (_) {}
}
```
- No label cleanup. No `clearAdvisoryClaim` imported.
- Current import: `const { getCoordRoot, readActiveFolders, removeWorktree } = require('./kaola-workflow-claim.js');`
- Local `ghExec` already defined in this file — can inline label removal.

**GitLab** — two paths:
- `closeLinkedIssue(root, project, issueIid, opts)` at line 116 (skipGit/test path): calls `forge.createIssueNote` then `forge.closeIssue(issueIid)` — no label cleanup
- Step 8 direct at lines 232-237: `try { forge.createIssueNote(...) } ... try { forge.closeIssue(args.issue); } catch (_) {}` — no label cleanup
- `forge.updateIssue(issueIid, { unlabels: [forge.CLAIM_LABEL] })` would be the call to add

**Gitea** — two paths (identical structure):
- `closeLinkedIssue(root, project, issueIid, opts)` at line 116 (skipGit/test path)
- Step 8 direct at lines 232-237: same pattern
- `forge.updateIssueLabels(projectInfo, issueIid, { remove: [forge.CLAIM_LABEL] })` would be the call to add
- `readProjectInfo(root, args.project)` is already called in Step 8 — returns object with `full_name`

## 3. Forge Adapter Label APIs (verified exported)

**GitLab** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js:134-142`):
```js
function updateIssue(issueIid, opts) {
  // opts.unlabels = array of label strings to remove
  const args = ['issue', 'update', String(issueIid)];
  for (const label of options.unlabels || []) args.push('--unlabel', label);
  return raw ? normalizeIssue(parseJson(raw, {})) : null;
}
```
- Exported at line 214. CLAIM_LABEL exported at line 214.

**Gitea** (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:161-168`):
```js
function updateIssueLabels(project, issueNum, opts) {
  // opts.remove = array of label strings to remove
  // project.full_name required
  const args = ['issues', 'edit', String(issueNum)];
  if (options.remove && options.remove.length) args.push('--remove-labels=' + options.remove.join(','));
  return parseJson(raw, {});
}
```
- Exported at line 282. CLAIM_LABEL exported at line 282.

## 4. Test File Locations and Patterns

**GitHub**: No dedicated unit test file. Tested via `scripts/simulate-workflow-walkthrough.js` as subprocess integration test with `KAOLA_WORKFLOW_OFFLINE=1`. The `closeIssue` step is not unit-tested in isolation.

**GitLab**: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- `withForge(stubs, fn)` pattern (lines 15-26): monkey-patches `forge` in-process, restores in `finally`
- Representative closeIssue test (lines 188-212): stubs `createIssueNote` + `closeIssue`, calls `sinkMerge.runDirectMerge(..., { root, skipGit: true })`, asserts `result.merged === true`

**Gitea**: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Same `withForge` pattern (lines 14-25)
- closeIssue test (Test 6, lines 197-222): same structure

Neither test file includes `workflow:in-progress` or `CLAIM_LABEL` in fixtures or assertions — new tests needed.

## 5. clearAdvisoryClaim Call Sites (NOT in any sink-merge today)

GitHub claim.js: lines 464, 482, 594, 598 (finalize, release/discard, watch-pr merge, watch-pr close)
GitLab claim.js: lines 432, 453, 527, 531
Gitea claim.js: lines 418, 439, 513, 517

**None of the three sink-merge scripts call `clearAdvisoryClaim` today.**

## 6. Error Handling Pattern for Non-Fatal Operations

All three sink-merge scripts use identical pattern — every best-effort operation individually wrapped in `try/catch (_) {}`. Label cleanup must follow this pattern.

## 7. One-Time Cleanup (14 Stale Issues)

14 closed GitHub issues currently carry `workflow:in-progress`:
#126, #125, #119, #117, #116, #115, #113, #103, #89, #88, #86, #85, #82, #81

Cleanup: `gh issue list --state closed --json number,labels | <filter> | xargs gh issue edit {} --remove-label workflow:in-progress`
