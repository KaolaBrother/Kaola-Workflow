# Task A Evidence — Remove sole-active branch; add worktree_path hoist

## Diff Applied

```diff
@@ -370,15 +370,12 @@ function cmdStartup() {
   if (!target) {
-    const active = readActiveFolders(root);
-    if (active.length === 1) {
-      output({ verdict: 'owned', claim: 'owned', project: active[0].project, issue: active[0].issue_number, selected_project: active[0].project, selected_issue: active[0].issue_number, worktree_path: active[0].worktree_path || '' });
-      return;
-    }
     output({ verdict: 'no_target', claim: 'none', project: null, issue: null }, 1);
     return;
   }
   const result = claimExplicitTarget(root, Object.assign({}, args, { targetIssue: target }));
   output(Object.assign({
     verdict: result.status === 'acquired' ? (result.verdict || 'green') : result.status,
     claim: result.status === 'acquired' ? 'acquired' : (result.status === 'owned' ? 'owned' : 'none'),
     selected_project: result.project || null,
     selected_issue: result.issue || null,
-    target_source: 'user_directed'
+    target_source: 'user_directed',
+    worktree_path: result.folder ? (result.folder.worktree_path || '') : (result.worktree_path || '')
   }, result), result.status === 'acquired' || result.status === 'owned' ? 0 : 1);
 }
```

## RED Evidence
N/A — regression tests for this behavior are added in Task B, which depends on Task A completing first.

## GREEN Evidence
```
Workflow walkthrough simulation passed
```
Exit code: 0. All pre-existing tests pass.

## Deviations
None. Edit confined to cmdStartup lines 370-386.
