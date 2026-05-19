# TDD Task 5 — Integration walkthrough Step 0 (early-exit archive guard in runDirectMerge)

## File Modified
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`

## Diff
```diff
+  // Early-exit: if project is already archived, return exit 3 without touching git
+  const _liveDir = path.join(mainRoot, 'kaola-workflow', args.project);
+  const _archiveDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
+  if (!fs.existsSync(_liveDir) && fs.existsSync(_archiveDir)) {
+    process.stderr.write('sink-merge: project archived (' + args.project + '), skipping merge\n');
+    return { exitCode: 3 };
+  }
```
Inserted immediately after `const mainRoot = mainRootFromCoord(getCoordRoot(root));`, before the exit hook registration.

## RED Evidence
```
AssertionError [ERR_ASSERTION]: sink-merge on archived project must exit 3
1 !== 3
    at testFallbackGuardsAfterArchive (.../simulate-gitlab-workflow-walkthrough.js:51:12)
```
Root cause: `postMergeCleanup` guard unreachable — `git checkout` throws before it when no real git repo exists in tmpRoot.

## GREEN Evidence (test-gitlab-sinks.js)
```
sink-fallback live+archive guard test passed
branch name security validation test passed
classifyMergeError unit tests passed
exit-2 subprocess test passed
exit-3 subprocess test passed
success-path subprocess test passed
exit-3-archived subprocess test passed
GitLab sink tests passed
```

## GREEN Evidence (simulate-gitlab-workflow-walkthrough.js)
```
testFallbackGuardsAfterArchive: PASSED
GitLab workflow walkthrough simulation passed
```
