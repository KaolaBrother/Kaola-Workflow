# Advisor — Plan Gate, Issue #108

## Issues Found (require architect revision)

### Issue 1 — Part B hardening dropped (revert)
Architect reframed "Part B is already implemented" but AC #3 explicitly states: "`sink-fallback` does not treat a receipt-only recreated folder as a live workflow project."

The existing `!fs.existsSync(projectDir(...))` check (issue #83) is necessary but not sufficient for AC #3. Defense in depth:

```javascript
const archivePath = path.join(root, 'kaola-workflow', 'archive', args.project);
if (!fs.existsSync(projectDir(root, args.project)) || fs.existsSync(archivePath)) {
  output({ updated: false, project: args.project, reason: 'project archived' });
  return;
}
```

Also add matching Block 2 unit test case ("live and archive both exist → {updated:false}") directly proving AC #3.

### Issue 2 — Phase 4 must use worktree path
Fix code edits MUST go to:
- ✅ `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-108/plugins/kaola-workflow-gitlab/scripts/...`
- ❌ `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/plugins/kaola-workflow-gitlab/scripts/...`

### Issue 3 — Minor: verify line numbers before editing
Code-explorer found `resolveProjectFile` at lines 49–55; architect cited 51–53. Verify exact lines before Phase 4 edits.

## What's Solid
- Block 5 test design is correct
- `!live && archive` guard logic is correct (handles neither-exists and both-exist edge cases)
- `testFallbackGuardsAfterArchive` extension preserves byte-equality assertion intact
- Validation command list is correct

## Recommended Action
One architect revision: add Part B back (4 lines in claim.js + 1 test case in test-gitlab-sinks.js Block 2 extension), then proceed to Phase 4.
