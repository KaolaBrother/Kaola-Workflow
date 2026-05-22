# Code Architect — issue-157

## Architecture: stale-worktree-cleanup subcommand

A `stale-worktree-cleanup` subcommand, dry-run by default, added to all three forge-edition claim scripts. It reuses the exact candidate-detection logic of `stale-worktree-check` (refactored into a shared `collectStale` helper), then (with `--execute`) removes stale worktrees and deletes their branches under safety guards, with `--archive` / `--export` / `--force` / `--keep-branch` controlling how dirty worktrees and branches are handled.

## Phase-1 Input Corrections (load-bearing)

1. **GitLab/Gitea test location**: Phase-1 table points cleanup tests at `simulate-gitlab-workflow-walkthrough.js` / `simulate-gitea-workflow-walkthrough.js`. Those are 90-line wrappers that only call `run('test-gitlab-workflow-scripts.js')`. The actual `testStaleWorktreeCheck` lives in `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:1116` (Gitea: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`). Add `testStaleWorktreeCleanup` directly beside the existing test there and invoke it next to `testStaleWorktreeCheck();` near the bottom of those files. Do NOT touch the simulate wrappers.

2. **GitLab/Gitea validators**: Only GitHub (`scripts/validate-workflow-contracts.js:237-241`) is a true *extension*. For GitLab/Gitea, *add a new* `assertConcept` block.

## Design Decisions

- Refactor a shared `collectStale(root)` helper out of `cmdStaleWorktreeCheck`. Both subcommands call it, guaranteeing cleanup operates on exactly the same candidate set the check reports. Structural guarantee vs. coincidental drift.
- Dry-run default; `--execute` required to mutate. Zero disk mutations (no mkdir for exports, no stash) without `--execute`.
- Branch deletion is double-guarded: re-scan `listWorkflowWorktrees` after removal AND `branchExists` check before `git branch -D`.
- `cwdInside` refuses the whole run (not just one candidate) — abort with typed error if user is inside a target worktree.
- GitHub canonical → `cp` to Codex mirror (no manual edit; `validate-script-sync.js:43` enforces byte-identity).
- Tests go in `test-{gitlab,gitea}-workflow-scripts.js`, NOT the simulate wrappers.

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `scripts/kaola-workflow-claim.js` | Refactor `collectStale(root)` out of `cmdStaleWorktreeCheck`; add `removeBranch`, `stashWorktree`, `exportWorktreeDiff`, `cmdStaleWorktreeCleanup`; extend `parseArgs` with `--execute`, `--archive`, `--export`, `--keep-branch`; add dispatch + usage entry; export `cmdStaleWorktreeCleanup`, `collectStale` | 1 (canonical) |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | NO manual edit — `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | 2 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Parallel implementation; branch pattern `workflow/gitlab-issue-N` | 3a |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Parallel implementation; branch pattern `workflow/gitea-issue-N` | 3b |
| `scripts/simulate-workflow-walkthrough.js` | Add `testStaleWorktreeCleanup()`; call after line 1992 (`testStaleWorktreeCheck`) | 4 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add `testStaleWorktreeCleanup()` after line 1259; invoke after `testStaleWorktreeCheck()` call (line 1426) | 5a |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Same as GitLab | 5b |
| `scripts/validate-workflow-contracts.js` | Extend block at lines 237-241: add `'testStaleWorktreeCleanup'` and `'dry_run'` | 6 |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | Add NEW `assertConcept` block targeting `test-gitlab-workflow-scripts.js` | 6 |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | Add NEW `assertConcept` block targeting `test-gitea-workflow-scripts.js` | 6 |
| `README.md` | Add `stale-worktree-cleanup` row to subcommand table after line 533; update capability sentence at line 489 | 7 |

Files to create: **none.**

## Required Helper Functions

```js
// Refactored out of cmdStaleWorktreeCheck — returns the candidate set.
function collectStale(root) {
  // returns { stale_worktrees, stale_branches, active_worktrees }
  // identical body to current cmdStaleWorktreeCheck minus the output() call
}

// cmdStaleWorktreeCheck becomes a thin wrapper:
function cmdStaleWorktreeCheck() {
  const root = getRoot();
  const r = collectStale(root);
  output({ ...r, count: r.stale_worktrees.length + r.stale_branches.length });
}

// git -C <wtPath> stash push -u -m "kaola-cleanup-issue-N"; returns true on success.
function stashWorktree(wtPath, issueNumber) { /* execFileSync, try/catch -> bool */ }

// Creates kaola-workflow/archive/exports/ if missing; writes git diff HEAD patch.
// Returns the patch path on success, null on failure.
// ts = new Date().toISOString().replace(/[:.]/g, '-')
function exportWorktreeDiff(root, wtPath, issueNumber) { /* mkdirSync + writeFileSync */ }

// git branch -D <branch> under guard. Caller must have already verified no registered worktree.
// Returns true on success.
function removeBranch(root, branch) { /* execFileSync + try/catch -> bool */ }

// The subcommand.
function cmdStaleWorktreeCleanup() { /* see decision matrix below */ }
```

## cmdStaleWorktreeCleanup Decision Matrix

```
root = getRoot()
args = parseArgs(process.argv.slice(3))   // execute, archive, export, force, keepBranch (camelCased)
{ stale_worktrees, stale_branches } = collectStale(root)

// Refuse entire run if cwd is inside any candidate worktree:
for wt of stale_worktrees:
  if cwdInside(wt.path) -> output({cleanup:false, reason:'refusing to operate from inside a target worktree: '+wt.path}, 1); return

dryRun = !args.execute
buckets = { removed:[], deleted_branch:[], skipped_dirty:[], stashed:[], exported:[] }
dryBuckets = { would_remove:[], would_delete_branch:[], skipped_dirty:[] }
removedBranches = new Set()

for wt of stale_worktrees:
  branch = wt.branch.replace(/^refs\/heads\//,'')
  state = wt.state   // 'clean'|'dirty'|'missing'

  if state === 'dirty' && !(args.archive || args.export || args.force):
    (dryRun ? dryBuckets : buckets).skipped_dirty.push(wt.path)
    continue

  if dryRun:
    dryBuckets.would_remove.push(wt.path)
    if !args.keepBranch: dryBuckets.would_delete_branch.push(branch)
    continue

  // EXECUTE path:
  if state === 'dirty':
    if args.archive: if stashWorktree(wt.path, wt.issue_number): buckets.stashed.push(wt.path)
    else if args.export: p = exportWorktreeDiff(root, wt.path, wt.issue_number); if p: buckets.exported.push(p)
    // --force: no pre-step needed

  removeWorktree(root, 'issue-'+wt.issue_number, { worktree_path: wt.path })
  buckets.removed.push(wt.path)
  removedBranches.add(branch)

// Branch deletion:
candidateBranches = dedup([...removedBranches, ...stale_branches.map(b=>b.branch)])
for branch of candidateBranches:
  if args.keepBranch: continue
  if dryRun: add to dryBuckets.would_delete_branch if not already; continue
  // GUARD: re-scan; refuse if worktree still references branch
  stillRegistered = listWorkflowWorktrees(root).some(w => w.branch.replace(/^refs\/heads\//,'') === branch)
  if stillRegistered: continue
  if !branchExists(root, branch): continue
  if removeBranch(root, branch): buckets.deleted_branch.push(branch)

if dryRun: output({ dry_run:true, ...dryBuckets })
else:       output({ dry_run:false, ...buckets })
```

## parseArgs Extension

```js
if (key === '--execute') { args.execute = true; continue; }
if (key === '--archive') { args.archive = true; continue; }
if (key === '--export')  { args.export = true; continue; }
if (key === '--keep-branch') { args.keepBranch = true; continue; }
```

(`--force` is already parsed; place these in the same loop. Apply identically in all three editions.)

## Dispatch + Usage

- GitHub `main()` (line ~718): `if (sub === 'stale-worktree-cleanup') return cmdStaleWorktreeCleanup();` + append `|stale-worktree-cleanup` to usage string (line ~707)
- GitLab: same (dispatch ~739, usage ~726)
- Gitea: same (dispatch ~724, usage ~711)

## Test Function Structure — testStaleWorktreeCleanup

Seven sub-cases per edition (use closed issue e.g. 200):

1. **dry-run**: closed clean worktree, no `--execute`. Assert `out.dry_run === true`, `out.would_remove` has wtPath, `out.would_delete_branch` has branch, worktree still exists.
2. **execute-clean**: `--execute`. Assert `out.dry_run === false`, `out.removed` has wtPath, `out.deleted_branch` has branch, `!fs.existsSync(wtPath)`, branch deleted.
3. **execute-dirty-no-flag**: dirty + `--execute` only. Assert `out.skipped_dirty` has wtPath, worktree still exists.
4. **execute-dirty-archive**: dirty + `--execute --archive`. Assert `out.stashed` has wtPath, `out.removed` has wtPath, worktree gone, `git stash list` contains `kaola-cleanup-issue-200`.
5. **execute-dirty-export**: dirty + `--execute --export`. Assert `out.exported` matches `kaola-workflow/archive/exports/issue-200-*.patch`, file exists and non-empty, worktree gone.
6. **execute-dirty-force**: dirty + `--execute --force`. Assert `out.removed` has wtPath, no stash created, worktree gone.
7. **keep-branch**: clean + `--execute --keep-branch`. Assert `out.removed` has wtPath, `out.deleted_branch` empty, branch still exists.

## Validator Changes

GitHub (`scripts/validate-workflow-contracts.js:237-241`):
```js
assertConcept('scripts/simulate-workflow-walkthrough.js', 'stale worktree validation', [
  'testStaleWorktreeCheck',
  'testStaleWorktreeCleanup',   // ADD
  'stale_worktrees',
  'stale_branches',
  'dry_run'                     // ADD
]);
```

GitLab — add NEW block:
```js
assertConcept(`${pluginRoot}/scripts/test-gitlab-workflow-scripts.js`, 'GitLab stale worktree validation', [
  'testStaleWorktreeCheck',
  'testStaleWorktreeCleanup',
  'stale_worktrees',
  'stale_branches',
  'dry_run'
]);
```

Gitea — identical block targeting `test-gitea-workflow-scripts.js`.

## Build Sequence

1. **T1**: GitHub canonical (`scripts/kaola-workflow-claim.js`) — `collectStale` refactor + all new helpers + dispatch
2. **T2**: Codex sync — `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
3. **T3a/T3b (parallel)**: GitLab + Gitea claim scripts
4. **T4/T5a/T5b (parallel per dependency)**: GitHub + GitLab + Gitea test files
5. **T6 (parallel)**: All 3 validators
6. **T7**: README
7. **Final gate**: `npm test`

## Task Write Sets and Validation Commands

| Task | Write Set | Validation |
|------|-----------|------------|
| T1 GitHub claim | `scripts/kaola-workflow-claim.js` | `node scripts/simulate-workflow-walkthrough.js` |
| T2 Codex sync | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `node scripts/validate-script-sync.js` |
| T3a GitLab claim | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` |
| T3b Gitea claim | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` |
| T4 GitHub test | `scripts/simulate-workflow-walkthrough.js` | `node scripts/simulate-workflow-walkthrough.js` |
| T5a GitLab test | `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` |
| T5b Gitea test | `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` |
| T6 Validators | All 3 validator files | `npm test` |
| T7 README | `README.md` | `npm test` |

## Parallelization Groups

- **Group A (serial)**: T1 → T2
- **Group B (parallel after T1)**: T3a ∥ T3b
- **Group C (parallel after respective claim)**: T4 (after T1) ∥ T5a (after T3a) ∥ T5b (after T3b)
- **Group D (after C)**: T6 ∥ T7
- **Final gate**: `npm test`

## Out of Scope

- No new top-level command file or skill
- No interactive prompts/confirmations (output is JSON)
- No remote branch deletion (`git push --delete`)
- No change to `cmdStaleWorktreeCheck` output shape (only refactored to call `collectStale`)
- No cleanup test in `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (Codex)
- No CHANGELOG entry required by validators
