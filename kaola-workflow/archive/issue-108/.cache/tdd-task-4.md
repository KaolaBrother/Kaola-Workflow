# TDD Task 4 — Part B Fix (claim.js cmdSinkFallback archive guard)

## File Modified
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`

## Diff
```diff
@@ -573,7 +573,8 @@ function cmdSinkFallback() {
   const args = parseArgs(process.argv.slice(3));
   assert(args.project, '--project required');
   assert(isSafeName(args.project), 'unsafe project name');
-  if (!fs.existsSync(projectDir(root, args.project))) {
+  const archivePath = path.join(root, 'kaola-workflow', 'archive', args.project);
+  if (!fs.existsSync(projectDir(root, args.project)) || fs.existsSync(archivePath)) {
     output({ updated: false, project: args.project, reason: 'project archived' });
     return;
   }
```

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
