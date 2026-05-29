# Code Explorer: issue-175

## Summary
6 files to change across GitLab and Gitea editions.

## Architecture
- GitHub classifier: subprocess model (spawned by claim script, verdict via stdout JSON)
- GitLab/Gitea classifiers: module-import model (classifyIssue() called directly in claim script)
- Key field difference: GitLab/Gitea active folders use `issue_iid`, GitHub uses `issue_number`

## Edit Targets
1. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`
   - Lines 248-254: OFFLINE path in classifyIssue() — add no-evidence guard before calling localRoadmapIssue()
   - Lines 288-295: Mirror guard in cmdClassify() too
2. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
   - Lines 400-416: claimExplicitTarget() missing target_unverified handler (add after target_unavailable)
3. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`
   - Lines 241-255: Same OFFLINE path gap as GitLab
4. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
   - Lines 403-419: Same missing handler as GitLab
5. `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
   - Line ~819: Existing test asserts green (wrong) — update to target_unverified + add regression tests
6. `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
   - Line ~820: Same — update to target_unverified + add regression tests

## GitHub Reference
- Classifier guard: `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` lines 334-358
- Claim handler: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` lines 443-451
- Test patterns: `scripts/simulate-workflow-walkthrough.js` lines 2341-2483

## Guard Pattern (for GitLab/Gitea classifiers)
```js
if (OFFLINE) {
  const roadmapFile = path.join(repoRoot, 'kaola-workflow', '.roadmap', 'issue-' + issueIid + '.md');
  if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_iid === issueIid)) {
    return {
      verdict: 'target_unverified',
      reasoning: 'OFFLINE and no local evidence for issue #' + issueIid + '...'
    };
  }
  return classify(localRoadmapIssue(issueIid, repoRoot), activeFolders);
}
```

## Not In Common-Script Sync
GitLab/Gitea scripts are NOT in the validate-script-sync.js common group — port must be done manually.

## Test Requirements
- Assert target_unverified (exit 1) for no-evidence offline case
- Assert acquisition with .roadmap/issue-N.md seeded
- Assert owned-folder routes to owned
- Assert unrelated active folder does NOT prevent target_unverified for different issue
