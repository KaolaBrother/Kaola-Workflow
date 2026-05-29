# Advisor Gate — Phase 3 Plan: issue-177

## Verdict: APPROVED with one important revision required

### IMPORTANT: Worktree compatibility blind spot

The architect's direct filesystem read approach (`exists('.git/refs/tags/...')` + `.git/packed-refs` grep) only works when `.git` is a **directory**. In a git worktree, `.git` is a **file** containing `gitdir: /path/to/main/.git/worktrees/<n>`, and refs live in the main repo's `.git/refs/tags/`.

The `exists('.git')` check still works (file OR directory), but reading `.git/refs/tags/...` and `.git/packed-refs` directly would look for paths relative to the worktree `.gitdir` file, not the main repo's `.git/`.

**Fix (Option A — recommended):** Shell out to git rev-parse instead of direct file reads:
```js
try {
  const { execFileSync } = require('child_process');
  execFileSync('git', ['rev-parse', '--verify', '--quiet', 'refs/tags/' + tagName],
    { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
  tagPresent = true;
} catch (_) {
  tagPresent = false;
}
```
Git handles worktree gitdir resolution natively. The `cwd: root` (already defined as `path.resolve(__dirname, '..')`) ensures it runs against the repo root.

Keep the two-tier skip as-is:
- `KAOLA_WORKFLOW_OFFLINE !== '1'` outer guard
- `exists('.git')` inner guard — correctly skips non-git environments; works for both file and directory `.git` entries

The `require('child_process')` must be added either at the top of the file or inline within the block. Inline `require()` is simpler and matches Node's single-execution path for this code.

### NICE-TO-HAVE: Test coverage for new branches (non-blocking)
The walkthrough transitively runs the script but doesn't exercise:
1. `KAOLA_WORKFLOW_OFFLINE=1` skip branch
2. Missing-tag failure branch

Two assertions in `simulate-workflow-walkthrough.js` would provide coverage. Can be added as a task in Phase 4 without a blueprint revision.

### Confirmed Sound
- Insertion point at line 324 (between CHANGELOG check and assertIncludes)
- `assert()` idiom matching lines 320–323
- rootVersion-only scoping
- Build sequence: SHA verification → local tags → validator edit → mirror → npm test → push
- Byte-identical mirror via cp after source edit
- One-tag-by-name push (no --tags)
- SHA verification (git log subject match + merge-base ancestry) — intact from Phase 2 adjustment 2
- Out-of-scope list

### Routing Instruction
Route revision back to code-architect to update the validator code block to use git rev-parse (Option A). Test additions can be handled in Phase 4 task list directly without needing another architect revision.
