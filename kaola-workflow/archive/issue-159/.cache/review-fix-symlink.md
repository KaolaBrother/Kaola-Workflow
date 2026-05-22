# Review Fix: Symlink Guard — issue-159

## Finding
Security reviewer MEDIUM: `fs.copyFileSync` dereferences untracked symlinks, allowing arbitrary user-readable file contents to be copied into the tracked `kaola-workflow/archive/exports/` directory.

## Fix Applied (all 4 claim files)
Added `lstatSync` guard before `copyFileSync` in `exportWorktreeDiff()` copy loop:
```js
if (fs.lstatSync(src).isSymbolicLink()) continue;
```

Files modified:
- `scripts/kaola-workflow-claim.js` — line 162
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — line 162
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — line 171
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — line 166

## Validation
All 3 walkthroughs passed after fix:
- `node scripts/simulate-workflow-walkthrough.js` — PASS (13 tests including sc9, sc10)
- `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` — PASS
- `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` — PASS
