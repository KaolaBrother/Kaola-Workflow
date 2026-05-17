# Advisor Gate Output — issue-38 Plan (Second Review)

## Verdict

Plan is ready with one required fix (C3-F signature) and two advisory items. All other tasks are correctly specified.

## Required Fix

### C3-F: `commitWorktreeArtifacts` fallback regression

The function signature in `.cache/architect.md` C3-F is:
```js
function commitWorktreeArtifacts(worktreePath, project) {
  const mainWorktree = findMainWorktree() || worktreePath;  // ← wrong fallback
```

The original `cmdWorktreeFinalize` uses `|| root` (not `|| worktreePath`), where `root` is the result of `getRoot()` (the main worktree location from git config, not the current working directory). Using `worktreePath` as fallback would produce wrong behavior: if `findMainWorktree()` fails, phase artifacts would be copied from/to the issue worktree itself rather than the main worktree.

**Required change:**
```js
// Signature:
function commitWorktreeArtifacts(worktreePath, project, root) {
  const mainWorktree = findMainWorktree() || root;  // ← matches original

// Call site in cmdWorktreeFinalize (root is already in scope via const root = getRoot();):
commitWorktreeArtifacts(worktreePath, args.project, root);
```

Fix this in `architect.md` before writing `phase3-plan.md`.

## Advisory Items (no plan change required)

### scanPhaseArtifacts next-command for phase 4

The `scanPhaseArtifacts` helper uses `found.next` directly for the phase 4 case, which is `/kaola-workflow-phase4 {project}`. The existing `cmdResume` logic currently does NOT distinguish between "phase 4 incomplete" and "all tasks complete → phase 5". Both map to the same next command in the phase artifact scan. This is acceptable because `cmdResume` is a hint, not an authoritative router. Document this limitation but do not add disambiguation logic.

### Node.js `fs.cpSync` version

`fs.cpSync` was added in Node.js 16.7. Confirmed: current project environment is Node.js v25.5.0. No compatibility shim needed.

## What Stays the Same

- 4-commit slice structure is correct
- All task assignments (C1-A/B/C, C2-A/B, C3-A through C3-K, C4-A/B) are correct
- macOS realpath comparison in 17K is correctly specified (`fs.realpathSync(epic17Tmp)`)
- 17G–17J failure path implementations are correct
- Plugin mirror via `fs.cpSync` after C3 is correct
- Validator parity-check approach (inline, using `read()` and `assert()`) is correct
- LOW-2 PHASE_ARTIFACTS lookup table is correctly placed inside `scanPhaseArtifacts`
- LOW-3 fix (`path.dirname(pick17a.worktree_path)`) is correct

## Risk Assessment

Low. The C3-F fix is a one-word change (`worktreePath` → `root`) plus adding one parameter. All other tasks follow proven patterns from the existing codebase.
