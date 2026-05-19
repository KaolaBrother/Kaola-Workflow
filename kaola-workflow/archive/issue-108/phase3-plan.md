# Phase 3 - Plan: issue-108

## Blueprint

### Files to Create
None — pure fix, no new files.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | Add Block 2b test (live+archive both exist → `{updated:false}`) and Block 5 (exit-3 archived subprocess test) | Regression coverage for AC #3 and AC #4 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Add `!live && archive` guard in `postMergeCleanup` before `mkdirSync` | Part A fix — stop receipt from recreating archived live dir |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Replace single-condition guard with `!live \|\| archive` in `cmdSinkFallback` lines 576–579 | Part B fix — defense in depth, satisfies AC #3 directly |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | Insert Step 0 sink-merge dispatch in `testFallbackGuardsAfterArchive` | Integration coverage tying Part A + Part B together |

**Worktree path**: ALL code edits use `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-108/` — NOT the main worktree.

### Build Sequence
1. Task 1 — write Block 2b failing test (Part B unit test, independent)
2. Task 2 — write Block 5 failing test (Part A subprocess test, independent)
3. Task 3 — implement Part A guard in `sink-merge.js` (makes Block 5 pass)
4. Task 4 — implement Part B guard in `claim.js` (makes Block 2b pass)
5. Task 5 — extend walkthrough integration (depends on Task 3)
6. Run full validation suite

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | Task 1, Task 2 | different test blocks in same file, non-overlapping line ranges |
| B | Task 3, Task 4 | different files entirely |
| serial | Task 5 | depends on Task 3 (Step 0 exercises sink-merge path) |

### External Dependencies
None — Node.js built-ins only (`fs`, `path`, `child_process`).

## Task List

### Task 1: Block 2b — `cmdSinkFallback` live+archive test
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: `test-gitlab-sinks.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY (insert after line 291, before line 293)
- Implement:
  ```javascript
  {
    // Bug 2 (Part B): sink-fallback with live dir AND archive dir → returns {updated: false}
    const root = tempRoot('kw-gl-sflive-archive-');
    try {
      const projDir = path.join(root, 'kaola-workflow', 'already-moved');
      fs.mkdirSync(projDir, { recursive: true });
      fs.writeFileSync(path.join(projDir, 'workflow-state.md'),
        'sink: merge\nbranch: workflow/already-moved\nlast_result: phase6_complete\n');
      const archiveDir = path.join(root, 'kaola-workflow', 'archive', 'already-moved');
      fs.mkdirSync(archiveDir, { recursive: true });
      const result = spawnSync(process.execPath, [claimScript, 'sink-fallback', '--project', 'already-moved'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert.strictEqual(result.status, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.updated, false);
      assert.strictEqual(parsed.reason, 'project archived');
      const stateContent = fs.readFileSync(path.join(projDir, 'workflow-state.md'), 'utf8');
      assert(stateContent.includes('sink: merge'), 'workflow-state.md must not be modified');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  ```
- Mirror: existing Block 2 patterns at lines 273–291 (`tempRoot`, `spawnSync`, `JSON.parse`)
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (should fail at Block 2b before Task 4)

### Task 2: Block 5 — sink-merge exit-3 archived subprocess test
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: `test-gitlab-sinks.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY (insert after line 410, before final `console.log`)
- Implement:
  ```javascript
  {
    // Block 5: exit-3 with archived project — no live dir, no receipt written
    const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
    const { root, branch } = setupRealRepo('exit3-archived-test', 'test-exit3-archived');
    const liveDir = path.join(root, 'kaola-workflow', 'test-exit3-archived');
    const archiveDir = path.join(root, 'kaola-workflow', 'archive', 'test-exit3-archived');
    fs.mkdirSync(path.join(root, 'kaola-workflow', 'archive'), { recursive: true });
    fs.renameSync(liveDir, archiveDir);
    const result = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', 'test-exit3-archived'], {
      cwd: root,
      env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert(result.status === 3, `expected exit 3, got ${result.status}. stderr: ${result.stderr}`);
    assert(!fs.existsSync(liveDir), 'live dir must not be recreated');
    assert(!fs.existsSync(path.join(liveDir, '.cache', 'sink-fallback.json')), 'receipt must not be at live path');
    assert(!fs.existsSync(path.join(archiveDir, '.cache', 'sink-fallback.json')), 'receipt must not be at archive path');
    assert((result.stderr || '').includes('project archived'), 'stderr must mention project archived');
    console.log('exit-3-archived subprocess test passed');
  }
  ```
- Mirror: existing Block 3 at lines 392–410 (`setupRealRepo`, `spawnSync`, `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE`)
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (should fail at Block 5 before Task 3)

### Task 3: Part A — archive guard in `postMergeCleanup`
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Write Set: `kaola-gitlab-workflow-sink-merge.js`
- Depends On: Task 2 (test written first)
- Parallel Group: B (parallel with Task 4)
- Action: MODIFY (`postMergeCleanup`, replace lines ~191–201)
- Implement: Insert `liveProjectDir`/`archiveProjectDir` check before mkdirSync:
  ```javascript
  const liveProjectDir = path.join(mainRoot, 'kaola-workflow', args.project);
  const archiveProjectDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
  if (!fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir)) {
    process.stderr.write('sink-merge: project archived (' + args.project + '), skipping receipt write\n');
    return { exitCode: 3 };
  }
  const receiptPath = path.join(liveProjectDir, '.cache', 'sink-fallback.json');
  ```
- Mirror: `resolveProjectFile` live-first/archive-fallback pattern at lines 49–55
- Validate: Block 5 passes

### Task 4: Part B — archive guard in `cmdSinkFallback`
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Write Set: `kaola-gitlab-workflow-claim.js`
- Depends On: Task 1 (test written first)
- Parallel Group: B (parallel with Task 3)
- Action: MODIFY (replace lines 576–579 in `cmdSinkFallback`)
- Implement:
  ```javascript
  const archivePath = path.join(root, 'kaola-workflow', 'archive', args.project);
  if (!fs.existsSync(projectDir(root, args.project)) || fs.existsSync(archivePath)) {
    output({ updated: false, project: args.project, reason: 'project archived' });
    return;
  }
  ```
- Mirror: `projectDir` helper at lines 131–133; `path.join` pattern for archive path
- Validate: Block 2b passes

### Task 5: Integration — `testFallbackGuardsAfterArchive` Step 0
- File: `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`
- Write Set: `simulate-gitlab-workflow-walkthrough.js`
- Depends On: Task 3 (sink-merge fix required for Step 0 assertion)
- Parallel Group: serial
- Action: MODIFY (insert Step 0 block after snapshot loop ~line 44, before Step 1 ~line 46)
- Implement:
  ```javascript
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const smResult = spawnSync(process.execPath,
    [sinkScript, '--branch', 'workflow/fb-project', '--project', 'fb-project'],
    { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' } });
  assert.strictEqual(smResult.status, 3, 'sink-merge on archived project must exit 3');
  assert(!fs.existsSync(liveDir), 'sink-merge must not recreate live dir for archived project');
  assert((smResult.stderr || '').includes('project archived'), 'sink-merge stderr must mention project archived');
  ```
- Mirror: `testFallbackGuardsAfterArchive` at lines 24–73; `spawnSync` pattern throughout file
- Validate: `testFallbackGuardsAfterArchive: PASSED`

## Advisor Notes
- Original blueprint dropped Part B (advisor flagged this as insufficient for AC #3)
- Part B defense-in-depth required: `cmdSinkFallback` must explicitly check archive dir, not just rely on Part A preventing recreation
- All code edits must target worktree path `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-108/`
- Byte-equality assertion in `testFallbackGuardsAfterArchive` must remain intact (preserves issue #83 invariant)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked | .cache/architect-revision-1.md | one revision: Part B re-added |
