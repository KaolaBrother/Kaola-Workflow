# Code Architect — Blueprint: issue-122

## Design Decisions

- **Option A (internal config read)**: Each sink reads `~/.config/kaola-workflow/config.json` itself. Dispatch scripts unchanged.
- **`readConfig` is private**: Not exported. Only `maybeAutoMergeFromConfig` is exported.
- **Simplified `readConfig`**: Read-only variant — does not write defaults to disk (diverges from GitHub baseline which does write). Intentional.
- **`configOverride` parameter**: When defined, used directly; when undefined, calls `readConfig()`. Enables unit tests without HOME-stubbing.
- **`main()` if/else if**: `args.merge` (CLI) wins over config-based auto-merge; they cannot both trigger on the same run.
- **Signature asymmetry**: Gitea `maybeAutoMergeFromConfig(pr, project, configOverride)` vs GitLab `maybeAutoMergeFromConfig(mr, configOverride)` — forced by forge API (GitLab's `mergeMergeRequest(mrIid, opts)` takes no project).
- **`os` import**: Must add to both sink files. Both test files already import `os`.

## Files to Create
None.

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js` | Add `os` require; add `readConfig()`; add `maybeAutoMergeFromConfig()`; update `main()`; export | 1 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js` | Add `os` require; add `readConfig()`; add `maybeAutoMergeFromConfig()`; update `main()`; export | 1 |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | Append 3 test blocks before final console.log | 2 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | Append 3 test blocks before final console.log | 2 |

## Build Sequence

1. Task 1 (Gitea sink) and Task 2 (GitLab sink) — parallel, no dependencies
2. Task 3 (Gitea tests) — depends on Task 1
3. Task 4 (GitLab tests) — depends on Task 2
4. Final: `node scripts/simulate-workflow-walkthrough.js`

## Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 1, 2 | disjoint files |
| B | 3, 4 | disjoint files, after respective sink |

## Task List

### Task 1: Gitea Sink
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Write Set: `kaola-gitea-workflow-sink-pr.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. Add `const os = require('os');` after `const path = require('path');`
  2. Add `readConfig()` after `parseArgs`: path = `path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json')`, read with fs.readFileSync (catch), JSON.parse (catch), guard non-object, Object.assign over `{ pr_auto_merge: false }`
  3. Add `maybeAutoMergeFromConfig(pr, project, configOverride)` after `mergePullRequest` (line 199): `const config = configOverride !== undefined ? configOverride : readConfig(); if (config.pr_auto_merge === true) { try { mergePullRequest(pr, project, { autoMerge: true, squash: true, removeSourceBranch: true }); } catch (mergeErr) { process.stderr.write('Warning: pr auto-merge failed: ' + mergeErr.message + '\n'); } }`
  4. Update `main()` line 204: `if (args.merge && !OFFLINE) mergePullRequest(pr, project, args); else if (!OFFLINE) maybeAutoMergeFromConfig(pr, project);`
  5. Add `maybeAutoMergeFromConfig` to `module.exports`
- Mirror: `scripts/kaola-workflow-sink-pr.js:34-47` for readConfig; lines 190-197 for trigger
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`

### Task 2: GitLab Sink
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: `kaola-gitlab-workflow-sink-mr.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Mirror of Task 1 with substitutions: `mr_auto_merge` key, `mergeMergeRequest(mr.mr_iid, opts)` (no project param in maybeAutoMergeFromConfig), `main()` uses `mr` not `{ pr, project }`, warning message uses "mr"
- Mirror: Same as Task 1
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`

### Task 3: Gitea Tests
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Write Set: `test-gitea-sinks.js`
- Depends On: Task 1
- Parallel Group: B
- Action: MODIFY
- Implement: Append 3 blocks before final console.log:
  - Test 1 (config-true): stub `forge.mergePullRequest`, call `sinkPr.maybeAutoMergeFromConfig({ pr_number: 1 }, 'group/project', { pr_auto_merge: true })`, assert mergeCalled === true
  - Test 2 (config-false): same stub, call with `{ pr_auto_merge: false }`, assert mergeCalled === false
  - Test 3 (HOME-stub): mkdtemp, write config.json `{ pr_auto_merge: true }`, set process.env.HOME, call without configOverride, assert mergeCalled === true, restore+cleanup in finally
- No new imports needed
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`

### Task 4: GitLab Tests
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: `test-gitlab-sinks.js`
- Depends On: Task 2
- Parallel Group: B
- Action: MODIFY
- Implement: Mirror of Task 3 — `mr_auto_merge`, stub `forge.mergeMergeRequest`, `sinkMr.maybeAutoMergeFromConfig({ mr_iid: 1 }, configOverride)` (no project)
- No new imports needed (os already at line 6)
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`

## Missing Imports / Dependencies

| File | Import to Add | Currently Present |
|------|--------------|-------------------|
| `kaola-gitea-workflow-sink-pr.js` | `const os = require('os');` | No |
| `kaola-gitlab-workflow-sink-mr.js` | `const os = require('os');` | No |
| `test-gitea-sinks.js` | `os` | Yes |
| `test-gitlab-sinks.js` | `os` | Yes |

No new npm packages.

## Out of Scope (confirmed)
- phase6.md, SKILL.md
- kaola-gitea-forge.js, kaola-gitlab-forge.js
- scripts/kaola-workflow-sink-pr.js (GitHub baseline)
- New config keys or CLI flags
- readConfig() inside ensurePullRequest/ensureMergeRequest
