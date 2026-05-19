# Architect Revision 1 — Issue #108

## Changes from Original Blueprint

- Part B re-added: `cmdSinkFallback` guard extended to check archive dir existence
- Block 2b test added: "live+archive both exist → {updated:false}" directly proves AC #3
- Worktree path noted: all code edits go to `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-108/plugins/...`

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `test-gitlab-sinks.js` | Add Block 2b test (live+archive → updated:false) | 1 — failing test for Part B |
| `test-gitlab-sinks.js` | Add Block 5 after line 410: archived-project exit-3 test | 2 — failing test for Part A |
| `kaola-gitlab-workflow-sink-merge.js` | Add `!live && archive` guard in `postMergeCleanup` before mkdirSync | 3 — Part A fix |
| `kaola-gitlab-workflow-claim.js` | Replace single-condition guard with `!live || archive` in `cmdSinkFallback` lines 576–579 | 4 — Part B fix |
| `simulate-gitlab-workflow-walkthrough.js` | Insert Step 0 sink-merge dispatch in `testFallbackGuardsAfterArchive` | 5 — integration |

## Exact Changes

### Task 1 — test-gitlab-sinks.js Block 2b (insert after line 291, before line 293)
```javascript
{
  // Bug 2 (Part B): sink-fallback with live dir AND archive dir → returns {updated: false, reason: 'project archived'}
  const root = tempRoot('kw-gl-sflive-archive-');
  try {
    const projDir = path.join(root, 'kaola-workflow', 'already-moved');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'),
      'sink: merge\nbranch: workflow/already-moved\nlast_result: phase6_complete\n');
    const archiveDir = path.join(root, 'kaola-workflow', 'archive', 'already-moved');
    fs.mkdirSync(archiveDir, { recursive: true });
    const result = spawnSync(process.execPath, [claimScript, 'sink-fallback', '--project', 'already-moved'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert.strictEqual(result.status, 0, 'sink-fallback should exit 0 when both live and archive dirs exist');
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.updated, false, 'updated should be false');
    assert.strictEqual(parsed.reason, 'project archived', 'reason should be project archived');
    const stateContent = fs.readFileSync(path.join(projDir, 'workflow-state.md'), 'utf8');
    assert(stateContent.includes('sink: merge'), 'workflow-state.md must not be modified when archive guard fires');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
```

### Task 2 — test-gitlab-sinks.js Block 5 (insert after line 410)
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
  assert(result.status === 3, `exit-3-archived test: expected exit 3, got ${result.status}. stderr: ${result.stderr}`);
  assert(!fs.existsSync(liveDir), 'exit-3-archived test: live dir must not be recreated');
  assert(!fs.existsSync(path.join(liveDir, '.cache', 'sink-fallback.json')), 'exit-3-archived test: receipt must not be at live path');
  assert(!fs.existsSync(path.join(archiveDir, '.cache', 'sink-fallback.json')), 'exit-3-archived test: receipt must not be at archive path');
  assert((result.stderr || '').includes('project archived'), 'exit-3-archived test: stderr must mention project archived');
  console.log('exit-3-archived subprocess test passed');
}
```

### Task 3 — kaola-gitlab-workflow-sink-merge.js Part A guard
Replace lines 191–201 in `postMergeCleanup`:
```javascript
    try {
      execFileSync('git', ['-C', mainRoot, 'reset', '--hard', 'origin/main'], { encoding: 'utf8' });
    } catch (_) {}
    const liveProjectDir = path.join(mainRoot, 'kaola-workflow', args.project);
    const archiveProjectDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
    if (!fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir)) {
      process.stderr.write('sink-merge: project archived (' + args.project + '), skipping receipt write\n');
      return { exitCode: 3 };
    }
    const receiptPath = path.join(liveProjectDir, '.cache', 'sink-fallback.json');
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, JSON.stringify({
      project: args.project,
      branch: args.branch,
      issue_number: args.issue != null ? args.issue : null,
      reason: token,
      timestamp: new Date().toISOString()
    }, null, 2) + '\n');
    return { exitCode: 3 };
```

### Task 4 — kaola-gitlab-workflow-claim.js Part B guard
Replace lines 576–579 in `cmdSinkFallback`:
```javascript
  const archivePath = path.join(root, 'kaola-workflow', 'archive', args.project);
  if (!fs.existsSync(projectDir(root, args.project)) || fs.existsSync(archivePath)) {
    output({ updated: false, project: args.project, reason: 'project archived' });
    return;
  }
```

### Task 5 — simulate-gitlab-workflow-walkthrough.js Step 0
Insert after line 44 (end of snapshot loop), before Step 1 comment at line 46:
```javascript
    // Step 0: sink-merge on archived project — must exit 3, no live dir recreated
    const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
    const smResult = spawnSync(process.execPath,
      [sinkScript, '--branch', 'workflow/fb-project', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(smResult.status, 3, 'sink-merge on archived project must exit 3');
    assert(!fs.existsSync(liveDir), 'sink-merge must not recreate live dir for archived project');
    assert((smResult.stderr || '').includes('project archived'), 'sink-merge stderr must mention project archived');
```

## Build Sequence
1. Task 1 + Task 2 (write failing tests — independent)
2. Task 3 (Part A fix) — makes Block 5 pass
3. Task 4 (Part B fix) — makes Block 2b pass
4. Task 5 (walkthrough integration) — depends on Task 3
5. Run full validation suite

## Validation Commands
```bash
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
npm run test:kaola-workflow:gitlab
node scripts/simulate-workflow-walkthrough.js
```

## Worktree Path Note
ALL code edits in Tasks 1–5 use WORKTREE path:
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-108/`

NOT the main worktree at `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/`
