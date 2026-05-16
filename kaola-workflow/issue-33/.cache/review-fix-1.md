# Review Fix 1 — M2: pre-chdir silent failure
Generated: 2026-05-16

## Finding
M2 (MEDIUM): `try { process.chdir(mainRootFromCoord(coordRoot)); } catch (_) {}` silently swallowed chdir failures. If pre-chdir fails, CWD stays inside worktree, removeWorktree defers, worktree not removed — exact bug this PR targets, with no diagnostic.

## Fix Applied
File: `scripts/kaola-workflow-sink-merge.js` line 176-178

Before:
```javascript
    try { process.chdir(mainRootFromCoord(coordRoot)); } catch (_) {}
```

After:
```javascript
    try { process.chdir(mainRootFromCoord(coordRoot)); } catch (e) {
      process.stderr.write('sink-merge: could not chdir to main root before worktree removal: ' + e.message + '\n');
    }
```

Note: `process.on('exit')` handler's silent catch left intentionally (best-effort at teardown).

## Validation
```
node scripts/simulate-workflow-walkthrough.js 2>&1 | tail -5
# Workflow walkthrough simulation passed (exit 0)
```
