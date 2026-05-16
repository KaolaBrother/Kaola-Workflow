# TDD Task 1 — T1/T2/T3 sink-merge.js changes
Generated: 2026-05-16

## Files Modified
- `scripts/kaola-workflow-sink-merge.js`

## Changes

**T1 — `mainRootFromCoord` helper (lines 34-36):**
```javascript
function mainRootFromCoord(coordRoot) {
  return path.basename(coordRoot) === '.git' ? path.dirname(coordRoot) : coordRoot;
}
```

**T2 + T3 — `coordRoot` hoist + `process.on('exit')` + pre-chdir (lines 163-180):**
```javascript
  const coordRoot = getCoordRoot();
  process.on('exit', () => {
    try { process.chdir(mainRootFromCoord(coordRoot)); } catch (_) {}
    if (process.env.KAOLA_WORKFLOW_DEBUG_CWD) {
      try {
        const _p = process.env.KAOLA_WORKFLOW_DEBUG_CWD;
        if (fs.existsSync(path.dirname(_p))) fs.writeFileSync(_p, process.cwd());
      } catch (_) {}
    }
  });
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

## RED Evidence
RED: N/A — existing test 16G does not cover the CWD-from-worktree case (runs from `epic16Tmp`, not inside worktree). New test 16G-CWD added in Task 3.

## GREEN Evidence
```
node -e "require('./scripts/kaola-workflow-sink-merge.js')"
# Output: --branch is invalid or TBD (exit code 1 — expected args-validation failure, no SyntaxError)
```

Grep confirms all constructs present:
```
34:function mainRootFromCoord(coordRoot) {
164:  process.on('exit', () => {
165:    try { process.chdir(mainRootFromCoord(coordRoot)); } catch (_) {}
166:    if (process.env.KAOLA_WORKFLOW_DEBUG_CWD) {
168:        const _p = process.env.KAOLA_WORKFLOW_DEBUG_CWD;
176:    try { process.chdir(mainRootFromCoord(coordRoot)); } catch (_) {}
```

## Deviations
None. All changes within write set.
