# Architect Blueprint — Issue #108

## Key Design Decision

**Part B is already implemented**: `cmdSinkFallback` in `kaola-gitlab-workflow-claim.js` lines 576–579 already guards with `!fs.existsSync(projectDir(...))` and returns `{updated:false, reason:'project archived'}` (landed in issue #83). No code change needed here.

**Part A is the real fix**: `postMergeCleanup` in `kaola-gitlab-workflow-sink-merge.js` lines 192–201 calls `fs.mkdirSync({recursive:true})` unconditionally inside merge-impossible branch. Fix: guard using `!live && archive` check before the mkdirSync.

**Guard logic**: `!fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir)` — more conservative than `!live` alone:
- Neither exists (`!live && !archive`): guard does NOT fire, receipt written normally (project never archived)
- Both exist (`live && archive`): guard does NOT fire (corrupted double-state, write conservatively)
- Archive-with-timestamp-suffix (`.discarded-...`): guard doesn't match exact path, receipt written normally (fine)

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | Add Block 5 after line 410: archived-project exit-3 test | 1 — write failing test first |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Add archive guard in `postMergeCleanup` before `mkdirSync` at line 192 | 2 — implement fix |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | Insert sink-merge dispatch step in `testFallbackGuardsAfterArchive` | 3 — extend integration |

No new files. No changes to `kaola-gitlab-workflow-claim.js`.

## Exact Changes

### Task A — test-gitlab-sinks.js (after line 410, before final console.log)
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

### Task B — kaola-gitlab-workflow-sink-merge.js (replace lines 189–201 range)
Replace the block from `try { git reset }` through `return { exitCode: 3 }` in `postMergeCleanup`:

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

### Task C — simulate-gitlab-workflow-walkthrough.js (insert in testFallbackGuardsAfterArchive)
Insert after snapshot loop (line ~45), before Step 1 block (line ~47):

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
1. Task A: Write failing test (test-gitlab-sinks.js Block 5)
2. Task B: Implement Part A guard (sink-merge.js)
3. Task C: Extend walkthrough integration (simulate-gitlab-workflow-walkthrough.js)

Tasks B and C can be committed together — walkthrough Step 0 requires the Part A fix.

## Validation Commands
```bash
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
npm run test:kaola-workflow:gitlab
node scripts/simulate-workflow-walkthrough.js
```

## Edge Cases
1. Neither live nor archive: guard doesn't fire, receipt written normally ✓
2. Both live and archive: guard doesn't fire, conservative behavior ✓
3. Archive with `.discarded-` suffix: exact path check misses it, receipt written normally ✓
4. Git reset fails before guard: guard still runs (unconditional) ✓
5. `isSafeName` check at line 224 prevents path traversal ✓
