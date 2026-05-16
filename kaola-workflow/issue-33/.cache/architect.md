# Code Architect Cache — issue-33
Generated: 2026-05-16

## Blueprint: Fix Phase 6 CWD Restoration After Worktree Removal

### Key Design Decisions

**Decision 1 — Pre-chdir BEFORE `removeWorktree`, not after.**
`removeWorktree` (claim.js:638) has a CWD-protection guard: if `process.cwd()` is inside the worktree, it writes a `.pending-removal` entry and returns `{ deferred: true }` immediately — removal does NOT occur. If we wait to chdir after `removeWorktree`, the function always defers and the worktree is never removed. Fix: chdir to `mainRootFromCoord(coordRoot)` BEFORE calling `removeWorktree`, so the guard sees a CWD outside the worktree and allows actual removal.

**Decision 2 — `mainRootFromCoord` must handle env-var override case.**
`getCoordRoot()` returns `process.env.KAOLA_COORD_ROOT` verbatim when set. In tests that pass `KAOLA_COORD_ROOT=<tmpdir>`, the value is a plain directory (not `.git`-suffixed). `mainRootFromCoord` checks `path.basename(coordRoot) === '.git'` and calls `path.dirname` only in that case; otherwise returns `coordRoot` as-is.

**Decision 3 — Shell fix uses `--git-common-dir`, not `--show-toplevel`.**
`--show-toplevel` returns the current worktree's root (the directory sink-merge is about to delete). `--git-common-dir` always resolves to the shared `.git` directory whose parent is the main repo root. Phase 6 already uses this pattern (lines 305-306, 533-534, 565-566).

**Decision 4 — Test extension uses `spawnSync` (not `execFileSync`).**
Matches existing pattern for exit-code assertions (see test 8F, 8G). Allows capturing `status`, `stdout`, `stderr` without throwing.

**Decision 5 — `KAOLA_WORKFLOW_DEBUG_CWD` probe uses `fs.writeFileSync` only.**
No new module. Probe temp file created in `os.tmpdir()` by the test caller, deleted after assertion. Probe written at BOTH exit points in `main()` (FF-race path + normal exit path).

---

### Files to Create
None. All changes are modifications to existing files.

### Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `scripts/kaola-workflow-sink-merge.js` | Add `mainRootFromCoord` helper; hoist `coordRoot` to function scope; add pre-chdir before `removeWorktree`; add defensive post-pipeline chdir; add `KAOLA_WORKFLOW_DEBUG_CWD` probe at both exit points | 1 |
| `commands/kaola-workflow-phase6.md` | In Step 9 shell block: capture `_MAIN_ROOT` using `--git-common-dir` pattern before `case` dispatch; restore CWD after `esac` | 2 |
| `scripts/simulate-workflow-walkthrough.js` | Extend test 16G: add sub-case spawning sink-merge with `cwd: lock606.worktree_path` using `spawnSync`; assert exit 0, worktree gone, CWD probe equals main repo root | 3 |

---

### Detailed Changes

#### `scripts/kaola-workflow-sink-merge.js`

**T1 — Add `mainRootFromCoord` helper after `getRoot()` function (~line 33):**
```javascript
function mainRootFromCoord(coordRoot) {
  return path.basename(coordRoot) === '.git' ? path.dirname(coordRoot) : coordRoot;
}
```

**T2 — Hoist `coordRoot` and add pre-chdir in Step 0 (lines 158-165):**

Current:
```javascript
{
  const coordRoot = getCoordRoot();
  const lockFilePath = path.join(coordRoot, 'kaola-workflow', '.locks', args.project + '.lock');
  let lock = null;
  try { lock = JSON.parse(fs.readFileSync(lockFilePath, 'utf8')); } catch (_) {}
  if (lock) { try { removeWorktree(coordRoot, args.project, lock); } catch (_) {} }
}
```

Replacement:
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

**T3 — Add post-pipeline chdir + probe at both exit points in `main()`:**

At FF-race exhaustion path (near line 194), replace:
```javascript
  process.exitCode = 2;
  return;
```
With:
```javascript
  process.exitCode = 2;
  try { process.chdir(mainRootFromCoord(coordRoot)); } catch (_) {}
  if (process.env.KAOLA_WORKFLOW_DEBUG_CWD) {
    try {
      const _p = process.env.KAOLA_WORKFLOW_DEBUG_CWD;
      if (fs.existsSync(path.dirname(_p))) fs.writeFileSync(_p, process.cwd());
    } catch (_) {}
  }
  return;
```

At normal exit path, after `postMergeCleanup(args)`, append:
```javascript
  try { process.chdir(mainRootFromCoord(coordRoot)); } catch (_) {}
  if (process.env.KAOLA_WORKFLOW_DEBUG_CWD) {
    try {
      const _p = process.env.KAOLA_WORKFLOW_DEBUG_CWD;
      if (fs.existsSync(path.dirname(_p))) fs.writeFileSync(_p, process.cwd());
    } catch (_) {}
  }
```

#### `commands/kaola-workflow-phase6.md`

In Step 9 shell block, before `SINK_BRANCH` assignment:
```bash
# Capture main repo root before sink dispatch.
# Use --git-common-dir (mirrors existing pattern at lines 305-306, 533-534, 565-566).
# --show-toplevel returns the worktree root sink-merge is about to delete.
# Restore CWD: sink-merge may have removed the worktree this shell was in (issue #33).
_COORD_ROOT_RAW_SINK="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
if [[ "$_COORD_ROOT_RAW_SINK" != /* ]]; then _COORD_ROOT_RAW_SINK="$(pwd)/$_COORD_ROOT_RAW_SINK"; fi
_MAIN_ROOT="$(dirname "$_COORD_ROOT_RAW_SINK")"
```

After `esac`:
```bash
# Restore CWD: sink-merge may have removed the worktree this shell was in (issue #33).
cd "$_MAIN_ROOT" 2>/dev/null || true
```

#### `scripts/simulate-workflow-walkthrough.js`

After line 3763, insert `// 16G-CWD` sub-case:
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

---

### Build Sequence (ordered by dependency)

1. T1: `mainRootFromCoord` helper in sink-merge.js (no dependencies)
2. T2: `coordRoot` hoist + pre-chdir in sink-merge.js (depends on T1)
3. T3: Post-pipeline chdir + `KAOLA_WORKFLOW_DEBUG_CWD` probe in sink-merge.js (depends on T1, T2)
4. T4: Shell fix in `kaola-workflow-phase6.md` (independent of T1-T3)
5. T5: Test 16G extension in simulate-workflow-walkthrough.js (depends on T1-T3)

### Parallelization Plan

| Group | Tasks | Why Safe |
|-------|-------|----------|
| A | T1, T2, T3 (sequential within group) | All in sink-merge.js |
| B | T4 | phase6.md only; disjoint |
| C | T5 (after Group A) | Test depends on probe handler |

Two parallel tracks: `{A then C}` and `{B}`.

### External Dependencies
All already present: `fs`, `path`, `os`, `spawnSync` — no new imports, no new packages.

### Explicit Out of Scope
- `drainPendingRemovals()` chdir
- `cmdWatchPr` removeWorktree calls (claim.js:1971, 1977)
- Generic `restoreCwd()` helper
- `sink-pr.js` JS changes
- `removeWorktree()` return-shape refactor
- Plugin mirror sync

### Key File Locations
- `scripts/kaola-workflow-sink-merge.js`: `main()` at line 145; Step 0 at lines 158-165; `getRoot()` at lines 23-32; `postMergeCleanup` call at ~line 197; `process.exitCode = 2` path at ~line 194
- `commands/kaola-workflow-phase6.md`: Step 9 sink dispatch starts at line 584; `case "$SINK_KIND"` at line 604; `esac` at line 621
- `scripts/simulate-workflow-walkthrough.js`: test 16G at lines 3750-3763; `spawnSync` patterns at lines 1405-1415; `coordRootFor`/`realpathSync` pattern at lines 10-18
- `scripts/kaola-workflow-claim.js`: `removeWorktree` at lines 622-678; CWD-protection guard at line 638
