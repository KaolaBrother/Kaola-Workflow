# Phase 3 - Plan: issue-122

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js` | Add `os` require, `readConfig()`, `maybeAutoMergeFromConfig()`, update `main()`, add to exports | Config-driven auto-merge missing; GitHub baseline parity |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js` | Same (mr_auto_merge key, no project param in maybeAutoMergeFromConfig) | Same gap in GitLab plugin |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | Append 3 test blocks with strong oracle | Verify opts shape, not just call presence |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | Mirror of Gitea test blocks | Same coverage for GitLab |

### Build Sequence
1. Task 1 (Gitea sink) and Task 2 (GitLab sink) — parallel, no dependencies
2. Task 3 (Gitea tests, after Task 1) and Task 4 (GitLab tests, after Task 2) — parallel with each other
3. Final: `node scripts/simulate-workflow-walkthrough.js`

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | Task 1, Task 2 | Disjoint files |
| B | Task 3, Task 4 | Disjoint files; each depends only on its own Group-A task |

### External Dependencies
None. All requires (`fs`, `path`, `os`, `child_process`) are Node built-ins already used in these files.

## Task List

### Task 1: Gitea Sink — kaola-gitea-workflow-sink-pr.js
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. Add `const os = require('os');` after `const path = require('path');` (currently line 5)
  2. Add `readConfig()` after `parseArgs` function (around line 47). Read `path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json')`; catch read errors with `'{}'`; catch JSON.parse errors with `{}`; guard non-object; Object.assign over `{ pr_auto_merge: false }`. Do NOT write defaults to disk (read-only variant).
  3. Add `maybeAutoMergeFromConfig(pr, project, configOverride)` after local `mergePullRequest` wrapper (after line 199). Implementation: `const config = configOverride !== undefined ? configOverride : readConfig(); if (config.pr_auto_merge === true) { try { mergePullRequest(pr, project, { autoMerge: true, squash: true, removeSourceBranch: true }); } catch (mergeErr) { process.stderr.write('Warning: pr auto-merge failed: ' + mergeErr.message + '\n'); } }`
  4. Update `main()` (line 204): replace `if (args.merge && !OFFLINE) mergePullRequest(pr, project, args);` with `if (args.merge && !OFFLINE) mergePullRequest(pr, project, args); else if (!OFFLINE) maybeAutoMergeFromConfig(pr, project);`
  5. Add `maybeAutoMergeFromConfig` to `module.exports` (do NOT add `readConfig`)
- Mirror: `scripts/kaola-workflow-sink-pr.js:34-47` (readConfig shape); lines 190-197 (trigger)
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`

### Task 2: GitLab Sink — kaola-gitlab-workflow-sink-mr.js
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Mirror of Task 1. Key differences:
  - Config key: `mr_auto_merge` (default false)
  - `maybeAutoMergeFromConfig(mr, configOverride)` — NO project parameter (forge's `mergeMergeRequest` takes only mrIid)
  - Inside `maybeAutoMergeFromConfig`: call `mergeMergeRequest(mr.mr_iid, { autoMerge: true, squash: true, removeSourceBranch: true })`
  - Warning message: `'Warning: mr auto-merge failed: ' + mergeErr.message + '\n'`
  - `main()` update: `if (args.merge && !OFFLINE) mergeMergeRequest(mr.mr_iid, args); else if (!OFFLINE) maybeAutoMergeFromConfig(mr);`
- Mirror: Same as Task 1
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`

### Task 3: Gitea Tests — test-gitea-sinks.js
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Depends On: Task 1
- Parallel Group: B
- Action: MODIFY
- Implement: Append 3 test blocks before final `console.log('Gitea sink tests passed')`. No new imports needed.

  **Test 1 — config-true trigger (strong oracle):**
  ```js
  {
    let forgeArgs = null;
    withForge({ mergePullRequest: (...args) => { forgeArgs = args; } }, () => {
      sinkPr.maybeAutoMergeFromConfig({ pr_number: 1 }, 'group/project', { pr_auto_merge: true });
    });
    assert.ok(forgeArgs !== null, 'mergePullRequest called when pr_auto_merge true');
    assert.strictEqual(forgeArgs[0], 'group/project');
    assert.strictEqual(forgeArgs[1], 1);
    assert.strictEqual(forgeArgs[2].autoMerge, true);
    assert.strictEqual(forgeArgs[2].squash, true);
    assert.strictEqual(forgeArgs[2].removeSourceBranch, true);
  }
  ```
  Note: `forge.mergePullRequest(project, prNumber, opts)` → forgeArgs[0]=project, [1]=prNumber, [2]=opts.

  **Test 2 — config-false skip:**
  ```js
  {
    let mergeCalled = false;
    withForge({ mergePullRequest: () => { mergeCalled = true; } }, () => {
      sinkPr.maybeAutoMergeFromConfig({ pr_number: 1 }, 'group/project', { pr_auto_merge: false });
    });
    assert.strictEqual(mergeCalled, false, 'auto-merge skipped when pr_auto_merge false');
  }
  ```

  **Test 3 — HOME-stub / real config file (strong oracle):**
  ```js
  {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cfg-'));
    const cfgDir = path.join(tmpHome, '.config', 'kaola-workflow');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ pr_auto_merge: true }));
    const origHome = process.env.HOME;
    process.env.HOME = tmpHome;
    try {
      let forgeArgs = null;
      withForge({ mergePullRequest: (...args) => { forgeArgs = args; } }, () => {
        sinkPr.maybeAutoMergeFromConfig({ pr_number: 1 }, 'group/project');
      });
      assert.ok(forgeArgs !== null, 'mergePullRequest called via real config file');
      assert.strictEqual(forgeArgs[2].autoMerge, true);
      assert.strictEqual(forgeArgs[2].squash, true);
      assert.strictEqual(forgeArgs[2].removeSourceBranch, true);
    } finally {
      process.env.HOME = origHome;
      fs.rmSync(tmpHome, { recursive: true });
    }
  }
  ```
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`

### Task 4: GitLab Tests — test-gitlab-sinks.js
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Depends On: Task 2
- Parallel Group: B
- Action: MODIFY
- Implement: Mirror of Task 3. Key differences:
  - Stub `forge.mergeMergeRequest` (not `forge.mergePullRequest`)
  - Call `sinkMr.maybeAutoMergeFromConfig({ mr_iid: 1 }, { mr_auto_merge: true/false })`
  - No project param in the call
  - `forge.mergeMergeRequest(mrIid, opts)` → forgeArgs[0]=mrIid(=1), forgeArgs[1]=opts
  - Config key in test data: `mr_auto_merge`
  - Config file content: `{ mr_auto_merge: true }`
  - No new imports needed (`os` already at line 6)

  **Test 1 oracle (GitLab):**
  ```js
  assert.ok(forgeArgs !== null, 'mergeMergeRequest called when mr_auto_merge true');
  assert.strictEqual(forgeArgs[0], 1);
  assert.strictEqual(forgeArgs[1].autoMerge, true);
  assert.strictEqual(forgeArgs[1].squash, true);
  assert.strictEqual(forgeArgs[1].removeSourceBranch, true);
  ```
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`

## Advisor Notes
- Blueprint is dependency-safe and implementable as-is
- Oracle strengthened per advisor: capture full forgeArgs, assert project/prNumber/opts triple (Gitea) or mrIid/opts pair (GitLab)
- Use property assertions (not deepStrictEqual) to avoid `sha: undefined` causing false failures
- Test 2 (negative) keeps boolean check — no call to inspect
- Downstream note: verify Gitea forge's `autoMerge: true` path is exercised in forge tests (non-blocking for this issue)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor directed fold-in, not re-arch |
