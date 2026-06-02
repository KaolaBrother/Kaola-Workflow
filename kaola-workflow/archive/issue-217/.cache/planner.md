# Planner Output: issue-217

## Approach
Exactly ONE sensible approach: port the try/catch guard from cmdWorktreeFinalize (lines 962-967) into the broken cmdFinalize --keep-worktree block (lines 653-658) across all four editions.

## Write Set (5 files)
1. `scripts/kaola-workflow-claim.js` (lines 653-658)
2. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (lines 653-658) — byte-identical to #1, enforced by validate-script-sync.js
3. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (lines 664-669)
4. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (lines 650-655)
5. `scripts/simulate-workflow-walkthrough.js` (add double-finalize idempotency assertion)

## Exact Delta (files #1-#4)

Broken block (file #1 lines 653-658):
```js
    if (mainRoot2 && mainRoot2 !== linkedRoot2) {
      execFileSync('git', ['-C', root, 'add', '-A', 'kaola-workflow/'],
        { encoding: 'utf8', stdio: 'inherit' });
      execFileSync('git', ['-C', root, 'commit', '-m', 'chore: archive ' + args.project],
        { encoding: 'utf8', stdio: 'inherit' });
    }
```

Fixed block:
```js
    if (mainRoot2 && mainRoot2 !== linkedRoot2) {
      try {
        execFileSync('git', ['-C', root, 'add', '-A', 'kaola-workflow/'],
          { encoding: 'utf8', stdio: 'inherit' });
        execFileSync('git', ['-C', root, 'diff', '--cached', '--quiet'],
          { stdio: 'ignore' });
      } catch (_) {
        execFileSync('git', ['-C', root, 'commit', '-m', 'chore: archive ' + args.project],
          { encoding: 'utf8', stdio: 'inherit' });
      }
    }
```

Key notes:
- git diff --cached --quiet exits 0 on clean index → no throw → commit SKIPPED (idempotent)
- exits nonzero when staged → throws → commit runs in catch
- Keep `-C', root` (NOT folder.worktree_path)
- Files #1 and #2 must be byte-identical
- Files #3 and #4 have same structure but use their own surrounding indentation

## Walkthrough Test (file #5)
Insert after existing finalize assertions (around line 2145), before featureHead capture:
```js
    // issue #217: a second finalize --keep-worktree on a clean index must be a no-op (not crash)
    const headBefore2nd = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: wt850, encoding: 'utf8' }).stdout.trim();
    const finResult2 = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-850', '--keep-worktree'
    ], { cwd: wt850, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult2.status === 0, 'second finalize --keep-worktree must exit 0 (idempotent)\nstderr: ' + finResult2.stderr);
    const headAfter2nd = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: wt850, encoding: 'utf8' }).stdout.trim();
    assert(headAfter2nd === headBefore2nd, 'second finalize --keep-worktree must not create a commit, HEAD changed: ' + headBefore2nd + ' -> ' + headAfter2nd);
```

## Acceptance Command
```bash
cd /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow && npm test
```

## Out of Scope
- cmdWorktreeFinalize (correct reference, leave unchanged)
- sink-pr / sink-mr metadata-commit blocks (already guarded)
- mainRoot2/linkedRoot2 gate condition
- Commit message and add -A semantics
- Null-folder handling
- docs/investigations/2026-06-01-full-audit.md
- Edition walkthrough/test files for gitlab/gitea (already cover finalize --keep-worktree)
