# TDD Task 3 — Part A Fix (sink-merge.js archive guard)

## File Modified
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`

## Diff
```diff
     } catch (_) {}
-    const receiptPath = path.join(mainRoot, 'kaola-workflow', args.project, '.cache', 'sink-fallback.json');
+    const liveProjectDir = path.join(mainRoot, 'kaola-workflow', args.project);
+    const archiveProjectDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
+    if (!fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir)) {
+      process.stderr.write('sink-merge: project archived (' + args.project + '), skipping receipt write\n');
+      return { exitCode: 3 };
+    }
+    const receiptPath = path.join(liveProjectDir, '.cache', 'sink-fallback.json');
     fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
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
