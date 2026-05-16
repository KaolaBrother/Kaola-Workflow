# Phase 3 - Plan: issue-33

## Blueprint

### Files to Create
None. All changes are modifications to existing files.

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-sink-merge.js` | Add `mainRootFromCoord` helper; hoist `coordRoot` to function scope; add pre-chdir before `removeWorktree`; register `process.on('exit')` handler for post-exit chdir + CWD probe | Node-side: removes both failure modes (removal deferred, git calls from deleted path) |
| `commands/kaola-workflow-phase6.md` | Capture `_MAIN_ROOT` via `--git-common-dir` before `case` dispatch; add `cd "$_MAIN_ROOT"` after `esac` | Shell-side: restores user session CWD after sink-merge removes worktree |
| `scripts/simulate-workflow-walkthrough.js` | Add `16G-CWD` sub-case after test 16G: spawn sink-merge with `cwd: worktree_path`, assert exit 0, worktree gone, CWD probe equals main repo root | Proves both removal and CWD restoration work end-to-end |

### Build Sequence

1. T1: `mainRootFromCoord` helper in sink-merge.js (no dependencies)
2. T2: `coordRoot` hoist + pre-chdir in sink-merge.js (depends on T1)
3. T3: `process.on('exit')` handler (chdir + probe) in sink-merge.js (depends on T1, T2)
4. T4: Shell fix in `commands/kaola-workflow-phase6.md` (independent of T1-T3)
5. T5: Test `16G-CWD` sub-case in simulate-workflow-walkthrough.js (depends on T1-T3)

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A (sequential) | T1 → T2 → T3 | All in sink-merge.js; must be sequential within group |
| B | T4 | phase6.md only; disjoint from A |
| C (after A) | T5 | Test depends on T3 probe handler being present |

Groups A and B run concurrently. C starts after A completes.

### External Dependencies
All already present: `fs`, `path`, `os`, `spawnSync` — no new imports, no new packages.

---

## Task List

### Task 1 (T1): Add `mainRootFromCoord` helper
- File: `scripts/kaola-workflow-sink-merge.js`
- Write Set: `scripts/kaola-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A (first)
- Action: MODIFY
- Implement: Insert after `getRoot()` function (~line 33):
  ```javascript
  function mainRootFromCoord(coordRoot) {
    return path.basename(coordRoot) === '.git' ? path.dirname(coordRoot) : coordRoot;
  }
  ```
  Handles both normal case (`coordRoot` ends in `.git`) and `KAOLA_COORD_ROOT` env-var override (plain dir).
- Mirror: Pattern from `getCoordRoot()` at lines 34-38 (env-var override awareness)
- Validate: `node -e "const f=require('./scripts/kaola-workflow-sink-merge.js'); console.log('ok')" 2>&1 | head -3`

### Task 2 (T2): Hoist `coordRoot` + pre-chdir before `removeWorktree`
- File: `scripts/kaola-workflow-sink-merge.js`
- Write Set: `scripts/kaola-workflow-sink-merge.js`
- Depends On: Task 1
- Parallel Group: A (second)
- Action: MODIFY
- Implement: In Step 0 (lines 158-165), hoist `const coordRoot` from inside the block to function scope, and add pre-chdir as first statement inside the block:

  **DEVIATION FROM PHASE 2**: Phase 2 specified "chdir after removeWorktree returns removed/abandoned." This is wrong. `removeWorktree()` at claim.js:638 returns `{deferred}` immediately if `process.cwd()` is inside the worktree — removal never happens. The chdir must happen BEFORE removeWorktree so the CWD-protection guard allows actual removal.

  ```javascript
  const coordRoot = getCoordRoot();
  {
    // Pre-chdir BEFORE removeWorktree: removeWorktree defers if process.cwd() is
    // inside the worktree (claim.js:638). Escape first so removal can proceed (issue #33).
    try { process.chdir(mainRootFromCoord(coordRoot)); } catch (_) {}

    const lockFilePath = path.join(coordRoot, 'kaola-workflow', '.locks', args.project + '.lock');
    let lock = null;
    try { lock = JSON.parse(fs.readFileSync(lockFilePath, 'utf8')); } catch (_) {}
    if (lock) { try { removeWorktree(coordRoot, args.project, lock); } catch (_) {} }
  }
  ```
- Mirror: `try { ... } catch (_) {}` silent-failure pattern used throughout sink-merge.js
- Validate: `node scripts/kaola-workflow-sink-merge.js --help 2>&1 | head -5`

### Task 3 (T3): Register `process.on('exit')` for post-exit chdir + CWD probe
- File: `scripts/kaola-workflow-sink-merge.js`
- Write Set: `scripts/kaola-workflow-sink-merge.js`
- Depends On: Task 1, Task 2
- Parallel Group: A (third)
- Action: MODIFY
- Implement: In `main()`, immediately after `coordRoot` is declared at function scope (after T2), register a single `process.on('exit')` handler. This replaces the duplicated probe blocks at FF-race path and normal exit path from the architect blueprint.

  ```javascript
  process.on('exit', () => {
    try { process.chdir(mainRootFromCoord(coordRoot)); } catch (_) {}
    if (process.env.KAOLA_WORKFLOW_DEBUG_CWD) {
      try {
        const _p = process.env.KAOLA_WORKFLOW_DEBUG_CWD;
        if (fs.existsSync(path.dirname(_p))) fs.writeFileSync(_p, process.cwd());
      } catch (_) {}
    }
  });
  ```
  
  The `process.on('exit')` fires at all exit paths (FF-race `return`, normal end-of-function, `process.exit()`) without duplicating code at each one. The handler is registered after `coordRoot` is in scope so the closure captures the correct value.
- Mirror: `process.on('exit')` is a Node.js built-in; no project-specific mirror needed
- Validate: `KAOLA_WORKFLOW_DEBUG_CWD=/tmp/cwd-probe-test.txt node scripts/kaola-workflow-sink-merge.js --branch nonexistent --project nonexistent --issue 0 2>/dev/null; cat /tmp/cwd-probe-test.txt 2>/dev/null || echo "(probe not written)"`

### Task 4 (T4): Shell-side CWD restoration in phase6.md
- File: `commands/kaola-workflow-phase6.md`
- Write Set: `commands/kaola-workflow-phase6.md`
- Depends On: none
- Parallel Group: B
- Action: MODIFY
- Implement: In Step 9 shell block, BEFORE the `SINK_BRANCH` assignment (line ~584), add:
  ```bash
  # Capture main repo root before sink dispatch.
  # --git-common-dir always resolves to the shared .git dir (mirrors lines 305-306, 533-534, 565-566).
  # --show-toplevel returns the worktree root sink-merge is about to delete (issue #33).
  _COORD_ROOT_RAW_SINK="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
  if [[ "$_COORD_ROOT_RAW_SINK" != /* ]]; then _COORD_ROOT_RAW_SINK="$(pwd)/$_COORD_ROOT_RAW_SINK"; fi
  _MAIN_ROOT="$(dirname "$_COORD_ROOT_RAW_SINK")"
  ```
  
  After the `esac` (line ~621), add:
  ```bash
  # Restore CWD: sink-merge may have removed the worktree this shell was in (issue #33).
  cd "$_MAIN_ROOT" 2>/dev/null || true
  ```
  
  **Why `--git-common-dir` not `--show-toplevel`**: `--show-toplevel` returns the current worktree root — the directory sink-merge is about to delete. `--git-common-dir` always resolves to the shared `.git` directory regardless of which worktree is active. Its parent is always the main repo root. This pattern matches existing usage at lines 305-306, 533-534, and 565-566.
- Mirror: Lines 305-306 in kaola-workflow-phase6.md: `git rev-parse --git-common-dir` pattern
- Validate: Manual review of kaola-workflow-phase6.md Step 9 block after edit

### Task 5 (T5): Add test 16G-CWD sub-case
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Task 1, Task 2, Task 3
- Parallel Group: C (after Group A)
- Action: MODIFY
- Implement: After line 3763 (end of test 16G block), insert `// 16G-CWD` sub-case block:
  ```javascript
  // 16G-CWD (AC13-ext): sink-merge from inside worktree exits 0 and restores CWD
  {
    execFileSync(process.execPath, [
      path.join(root, 'scripts/kaola-workflow-claim.js'),
      'claim', '--session', 'sess-16g-cwd', '--project', 'issue-606', '--issue', '606', '--runtime', 'claude'
    ], { cwd: epic16Tmp, encoding: 'utf8', env: env16 });
    const lock606 = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic16Tmp), 'issue-606.lock'), 'utf8'));
    assert(lock606.worktree_path && fs.existsSync(lock606.worktree_path),
      '16G-CWD setup: worktree for issue-606 must exist');

    const cwdProbeFile = path.join(os.tmpdir(), 'kaola-workflow-16g-cwd-probe-' + Date.now() + '.txt');

    const r16gCwd = spawnSync(process.execPath, [
      path.join(root, 'scripts/kaola-workflow-sink-merge.js'),
      '--branch', lock606.branch, '--project', 'issue-606', '--issue', '606'
    ], {
      cwd: lock606.worktree_path,
      encoding: 'utf8',
      env: { ...env16Off, KAOLA_WORKFLOW_DEBUG_CWD: cwdProbeFile }
    });

    assert(r16gCwd.status === 0,
      '16G-CWD (AC13-ext): sink-merge from inside worktree must exit 0, got ' + r16gCwd.status +
      '\nstderr: ' + r16gCwd.stderr);
    assert(!fs.existsSync(lock606.worktree_path),
      '16G-CWD (AC13-ext): worktree for issue-606 must be gone after sink-merge');

    let probedCwd = '';
    try { probedCwd = fs.readFileSync(cwdProbeFile, 'utf8').trim(); } catch (_) {}
    try { fs.unlinkSync(cwdProbeFile); } catch (_) {}
    let expectedRoot = epic16Tmp;
    try { expectedRoot = fs.realpathSync(epic16Tmp); } catch (_) {}
    assert(probedCwd === expectedRoot,
      '16G-CWD (AC13-ext): CWD probe must equal main repo root; got "' +
      probedCwd + '", expected "' + expectedRoot + '"');
  }
  ```
  Note: `env16` (online) for claim subprocess; `env16Off` (OFFLINE) for sink-merge subprocess. `locksDirFor(epic16Tmp)` is the existing helper. `os` is already imported. `spawnSync` is already imported.
- Mirror: Existing `spawnSync` pattern at lines 1405-1415; `execFileSync` + `spawnSync` pairing at test 8F (lines ~1399-1440)
- Validate: `node scripts/simulate-workflow-walkthrough.js 2>&1 | tail -5`

---

## Advisor Notes

From `.cache/advisor-plan.md`:

1. **Phase 2 → Phase 3 deviation is load-bearing**: pre-chdir must happen BEFORE removeWorktree (claim.js:638 defers if CWD is inside worktree). Phase 2 spec was wrong; blueprint corrects it. Flagged explicitly above in T2.
2. **Post-pipeline defensive chdir is load-bearing**: the pre-chdir (T2) sets CWD to mainRoot for removeWorktree to proceed, but pipeline operations may inadvertently reset CWD. The exit handler ensures final CWD is mainRoot at both exit paths and makes the probe accurate.
3. **`process.on('exit')` adopted**: replaces duplicate probe+chdir blocks at FF-race and normal exit paths. Eliminates future third-exit-path risk.
4. **env16 vs env16Off verified**: claim uses `env16` (line 3607, online), sink-merge uses `env16Off` (line 3608, OFFLINE). Correct.
5. **`coordRoot` hoist required even with `process.on('exit')`**: the exit handler closes over `coordRoot`; function-scope declaration is still needed.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor found no blueprint gaps requiring re-architecture; one T3 refinement (process.on('exit')) incorporated directly into plan |
