# Implementation Plan: NATIVE=0 in-place feature-branch creation (issue #260, Option A)

## Provenance
AC, the refusal-status token (`dirty_tree_refused`), the new field name (`base_branch`), and the test issue number (505) are taken from the locked Option A design (orchestrator-settled, do not re-litigate), cross-checked against the frozen `kaola-workflow/issue-260/workflow-plan.md` node write-sets. Impl nodes with shell access should reconcile string/field choices against the live issue (`gh issue view 260`) but must not change the approach.

## Overview
When `KAOLA_WORKTREE_NATIVE=0` (the explicit worktree opt-out; worktree is default-ON after #264), `cmdStartup`/`claimProject` currently does a repo-root run and creates **no** branch — leaving work uncommitted on `main`. This change makes the NATIVE=0 path create+checkout the feature branch in-place, symmetric with `provisionWorktree`, records the pre-checkout branch as `base_branch` in the `## Sink` block, and teaches `cmdRelease` (discard) to restore the base branch + delete the created feature branch. Forge-neutral; lands byte-identically in all four `claim.js` editions.

## Pre-verified safety (DO NOT re-check in impl)
- Adding `base_branch:` to the `## Sink` block is safe: `field()` in `kaola-workflow-active-folders.js` is tolerant regex-by-name (L20-24), and `repair-state.js preservedStateBlocks` copies the whole `## Sink` block verbatim.
- No NATIVE=0 test asserts `HEAD === main` downstream.
- `FILE_CEILING = 6` per node — all node write-sets below are within ceiling (impl-core 3, impl-forge 4, impl-docs 2).
- **`scripts/kaola-workflow-active-folders.js` is NOT in any node's write-set.** Do NOT edit it. `cmdRelease` must read `base_branch` directly from the state file via `field(...)`, NOT via `folder.base_branch` (undefined — `readActiveFolders` does not parse it, and adding it there is out of scope + risks the shared file).

---

## Trigger condition (exact — used in two places)
In `claimProject`, after `const branch = buildBranchName(...)` is hoisted:
```
wouldInPlace = !OFFLINE && hasGitHistory(root) && !WORKTREE_NATIVE
```
The actual in-place checkout additionally requires HEAD not detached:
```
inPlaceFires = wouldInPlace && headBranch !== 'HEAD'   // headBranch = git rev-parse --abbrev-ref HEAD
```
- This is a **standalone `if` block**, NOT the `else` of the existing worktree guard. An `else` would fire on OFFLINE / no-history too, which is wrong.
- The existing worktree block (`if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root)) { provisionWorktree... }` ~L471-473) stays **unchanged**.
- The two blocks are mutually exclusive by `WORKTREE_NATIVE` vs `!WORKTREE_NATIVE`.

### Out of scope (flag for PR)
The worktree-provision **failure** fallback (online + NATIVE=1 but `git worktree add` throws → `worktree_error`, no branch) stays **unchanged**. Do NOT create an in-place branch on worktree-provision failure. That no-branch gap remains; PR body must flag it as a known follow-up.

---

## Ordering constraint inside `claimProject` (CRITICAL)
New order:
1. resolve issue/project, `assert isSafeName` (unchanged)
2. `existing` early-return → `owned` (re-claim) — dirty-refusal MUST be AFTER this
3. adaptive toggle guard (unchanged)
4. issue probe closed/unavailable (unchanged)
5. **HOIST** `const branch = buildBranchName(issueNumber, project, args.branch);` to here (above mkdir). Pure → safe.
6. **NEW dirty-tree refusal gate** (before mkdir, so a refusal leaves no orphan folder):
   ```
   const headBranch = inPlaceHead(root);          // 'HEAD' if detached, '' on error/no-history
   const wouldInPlace = !OFFLINE && hasGitHistory(root) && !WORKTREE_NATIVE;
   if (wouldInPlace && headBranch !== 'HEAD' && treeDirty(root)) {
     return { status: 'dirty_tree_refused', claim: 'none', issue: issueNumber, project,
       reasoning: 'working tree has uncommitted changes; refusing to create in-place feature branch (KAOLA_WORKTREE_NATIVE=0). Commit or stash, or use a worktree.' };
   }
   ```
   Creates NO folder, NO branch. Detached HEAD does NOT refuse here (falls to record-only below).
7. `mkdir(dir)` (unchanged)
8. worktree block (unchanged) — fires only when `WORKTREE_NATIVE`
9. **NEW in-place checkout block** (parallel to worktree block, after mkdir, before `writeState`):
   ```
   let baseBranch = '';
   let inPlaceNote = '';
   if (wouldInPlace) {
     if (headBranch === 'HEAD') {
       inPlaceNote = 'detached HEAD: skipped in-place branch creation (record-only)';
     } else {
       try {
         if (branchExists(root, branch)) {
           execFileSync('git', ['-C', root, 'checkout', branch], {stdio:['ignore','ignore','ignore']});
         } else {
           execFileSync('git', ['-C', root, 'checkout', '-b', branch], {stdio:['ignore','ignore','ignore']});
         }
         baseBranch = (headBranch && headBranch !== 'HEAD' && headBranch !== branch) ? headBranch : '';
       } catch (e) {
         inPlaceNote = 'in-place branch checkout failed: ' + ((e && e.message) || String(e));
       }
     }
   }
   ```
   - **`base_branch` trap guard:** `baseBranch = (cur && cur !== 'HEAD' && cur !== branch) ? cur : ''`. Prevents recording the feature branch as its own base in the reachable case (folder absent/stateless + user on feature branch + re-claim → `branchExists` checkout path). Empty `base_branch` falls through to the discard missing-base fallback.
   - **Never crash, never refuse** on detached HEAD / no history / checkout error: surface a note and still `acquire`.
10. `writeState({... base_branch: baseBranch ...})`
11. `postAdvisoryClaim`, return `acquired` (include `base_branch` and, if present, `inPlaceNote` in the returned object).

### Helpers to add (internal, NOT exported)
```
function inPlaceHead(root) {
  try { return execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], {encoding:'utf8', stdio:['ignore','pipe','ignore']}).trim(); }
  catch (_) { return ''; }
}
function treeDirty(root) {
  try { return execFileSync('git', ['-C', root, 'status', '--porcelain'], {encoding:'utf8', stdio:['ignore','pipe','ignore']}).trim().length > 0; }
  catch (_) { return false; }
}
```
Place near `hasGitHistory`/`branchExists` (~L230-246). Reference only `root`/`branch`/helpers — no `issueNumber`/`issueIid` naming leaks into the inserted block, so it is byte-identical across all four editions.

### writeState change (~L337, next to the worktree-field pushes)
```
if (data.base_branch) lines.push('base_branch: ' + data.base_branch);
```
Keep `## Sink` block order: `branch`, `issue_number`, `sink`, then `worktree_path`/`worktree_error`/`base_branch`/`pr_*`.

---

## discard/release algorithm (`cmdRelease` only — ~L816-826)
Insert alongside the existing `try { removeWorktree(...) } catch {}` at L823.
```
const featureBranch = folder.branch;                       // recorded feature branch
let baseBranch = '';
try { baseBranch = field(fs.readFileSync(folder.state_file, 'utf8'), 'base_branch'); } catch (_) {}
if (featureBranch && branchExists(root, featureBranch)) {
  try {
    const cur = inPlaceHead(root);
    const dirty = treeDirty(root);
    const target = baseBranch || defaultBranch(root);      // fallback when base_branch absent (old state)
    if (cur === featureBranch) {
      if (dirty) {
        restoreNote = 'tree dirty while on feature branch; skipped base restore + branch delete';
      } else if (target) {
        execFileSync('git', ['-C', root, 'checkout', target], {stdio:['ignore','ignore','ignore']});
        removeBranch(root, featureBranch);                  // existing helper ~L195
      } else {
        restoreNote = 'no base_branch and no resolvable default; skipped branch delete';
      }
    } else {
      removeBranch(root, featureBranch);                    // not on feature branch — safe direct delete
    }
  } catch (_) { /* defensive: discard must not throw */ }
}
```
Rules (all defensive try/catch, like `removeWorktree`):
- **Only delete the branch THIS project created** (`folder.branch`). Never an unrelated branch.
- **Currently-on-feature-branch:** checkout base/default BEFORE `branch -D` (git refuses deleting current branch).
- **Missing `base_branch` (old state):** fall back to repo default branch (`git symbolic-ref --short refs/remotes/origin/HEAD` → strip `origin/`, else `main`); if unresolvable, skip with note.
- **Dirty tree:** skip checkout, note it; do not force.
- Read `base_branch` via `field(fs.readFileSync(folder.state_file,'utf8'), 'base_branch')` — `field` already imported (L9). Confirm `folder.state_file` is the property name in `readActiveFolders` output (else use `path.join(folder.project_dir,'workflow-state.md')`).
- Add internal helper `defaultBranch(root)`. `cmdRelease` includes any `restoreNote` in its output JSON.

### Scope note (flag follow-up)
Base-restore added to `cmdRelease` (discard) only. `cmdFinalize` keeps the branch (`branch_removed:'kept'`) for the sink merge. `watch-pr` CLOSED/abandoned paths (L1126, L1147) also `removeWorktree` but are NOT in this node's write-set — flag in PR as symmetric-cleanup follow-up.

---

## Per-node file-by-file edit plan

### Node `impl-core` (tdd-guide, RED→GREEN) — 3 files
1. **`scripts/kaola-workflow-claim.js`** — add `inPlaceHead`/`treeDirty`/`defaultBranch` helpers (~L230-246); claimProject hoist+dirty-gate+in-place block; writeState base_branch push (~L337); cmdRelease base-restore. `module.exports` unchanged.
2. **`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`** (codex mirror) — **byte-identical** edits (validate-script-sync COMMON_SCRIPTS).
3. **`scripts/simulate-workflow-walkthrough.js`** — tests (matrix below). Register NEW functions in the run block (the `testWorktreeNativeDefaultOff()` call site is near L7873; the function def is ~L2711 — add siblings near the def and register calls in the run block).

### Node `impl-forge` (implementer) — 4 files
4. **`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`** — same logic; claimProject ~L378, worktree guard ~L435, cmdRelease ~L813, removeBranch ~L203, field imported. Prefix `workflow/gitlab-issue-*` from the port's own buildBranchName — git block identical.
5. **`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`** — same; prefix `workflow/gitea-issue-*`.
6. **`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`** — extend `#149: Test 1` NATIVE=0 block ~L1983-2010 (issue 601): also assert in-place branch created+checked-out (`workflow/gitlab-issue-601`) + tree clean.
7. **`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`** — extend `#149 Test 1` NATIVE=0 block ~L1712-1730 (issue 8): assert `workflow/gitea-issue-8` created+checked-out + tree clean.

### Node `impl-docs` (implementer) — 2 files
8. **`docs/api.md`** — § Worktree Provisioning, `KAOLA_WORKTREE_NATIVE` entry ~L110-119: NATIVE=0 now creates+checks-out the feature branch in-place (online + git history + not detached), records `base_branch`; dirty tree → typed `dirty_tree_refused` (no folder/branch); detached/no-history → record-only, claim still acquires, no `base_branch`; discard restores `base_branch` + deletes feature branch. Add worktree-provision-failure no-branch gap as known limitation.
9. **`docs/architecture.md`** — lifecycle line ~L43: minor parity touch noting NATIVE=0 in-place branch + base_branch restore on discard.

### Node `finalize` — `CHANGELOG.md`
[Unreleased] entry: NATIVE=0 opt-out creates+checks-out feature branch in-place, records `base_branch`, dirty-tree typed refusal, discard restores base + deletes feature branch. Note worktree-provision-failure no-branch gap as known follow-up.

---

## Test matrix (impl-core, in `simulate-workflow-walkthrough.js`)
All cases use `initGitRepo(tmp)` (creates `main` + one commit) + the online claim helper. Pass `{ KAOLA_WORKTREE_NATIVE: '0' }` in extraEnv (overrides the helper's hardcoded `'1'` via spread order). Register every NEW function in the run block.

| Case | Setup | Assertions |
|------|-------|-----------|
| **A. EXTEND `testWorktreeNativeDefaultOff` (issue 505)** | NATIVE=0 | keep `worktree_path===''` + `worktree_error===undefined`; ADD: `git rev-parse --abbrev-ref HEAD` === `'workflow/issue-505'`; tree clean; state `## Sink` has `base_branch: main` |
| **B. Idempotent re-claim** | claim 505 → branch created; DISCARD keeping branch (folder gone, branch present, HEAD on workflow/issue-505); second `startup --target-issue 505` | second exits 0, `claim==='acquired'`; checkout path (no `-b` error); HEAD still `workflow/issue-505`; base_branch `''`. Setup MUST be folder-absent-but-branch-present (plain second startup returns `owned`, vacuous). |
| **C. Dirty-tree typed refusal** | NATIVE=0, on `main`, uncommitted file before claim | `status==='dirty_tree_refused'`, `claim==='none'`; NO folder; NO branch; HEAD unchanged (`main`) |
| **D. Detached-HEAD record-only** | NATIVE=0; `git checkout --detach HEAD` before claim | `claim==='acquired'`; no branch; base_branch absent/empty; note present; no throw |
| **E. No-git-history record-only (optional)** | NATIVE=0, no commits | `claim==='acquired'`; no branch; base_branch empty. Keep only if it adds signal. |
| **F. Discard restores base + deletes feature branch** | claim 505 (base main); `release --project issue-505` from cwd OUTSIDE folder | after release: HEAD === `main`; `workflow/issue-505` GONE; folder archived. Guard cmdRelease cwd-inside check (L821): run release from tmp root. |

Discipline: NEW functions must be **registered** in the run block. Case A extension auto-covered; B/C/D/F not.

## Test matrix (impl-forge)
- gitlab `#149: Test 1` (~L1983, issue 601): assert `workflow/gitlab-issue-601` created+checked-out + tree clean (plus existing `worktree_path===''`).
- gitea `#149 Test 1` (~L1712, issue 8): assert `workflow/gitea-issue-8` created+checked-out + tree clean.

---

## Verification (impl nodes — REQUIRED)
- Run **full `npm test`**, not just the walkthrough. Walkthrough alone misses: `validate-script-sync` byte-identity (scripts/ vs plugins/kaola-workflow/scripts/ claim.js) and the gitlab/gitea `test-*-workflow-scripts.js` forge assertions.
- impl-core: walkthrough to confirm RED→GREEN, then `npm test` before close.
- impl-forge: `npm test` (forge tests + sync) before close.

## Risks & mitigations
- `else`-instead-of-`if` regression → standalone `if (wouldInPlace ...)`; existing worktree guard untouched. Covered by Case A + unchanged NATIVE=1/OFFLINE tests.
- Dirty refusal breaking NATIVE=1 worktree mode → refusal gated by `!WORKTREE_NATIVE`; dirty main under NATIVE=1 unaffected.
- `base_branch === feature` corruption → `(cur !== branch)` guard; Case B.
- Discard deleting current branch → checkout base/default before `branch -D`; Case F.
- Touching `active-folders.js` → forbidden; cmdRelease reads via `field()`.
- Mirror drift → edit both GitHub-edition files identically; `npm test`.

## Success criteria
- [ ] NATIVE=0 + online + git history + not detached → branch created+checked-out, tree clean, base_branch recorded.
- [ ] Idempotent re-claim (folder-absent, branch-present) reuses branch, no error, base_branch empty.
- [ ] Dirty tree → `dirty_tree_refused`, no folder, no branch.
- [ ] Detached HEAD / no history → claim acquires, no branch, surfaced note.
- [ ] Discard restores base_branch (or default) + deletes created feature branch; never an unrelated branch; defensive on dirty/missing-base.
- [ ] Worktree-provision-failure no-branch path unchanged (out of scope, flagged in PR).
- [ ] All four claim.js editions byte-consistent where required; forge prefixes correct.
- [ ] `npm test` green (walkthrough + sync + forge tests).
