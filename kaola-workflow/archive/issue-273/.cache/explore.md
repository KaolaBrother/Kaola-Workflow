# Explore Evidence — issue-273

Node: explore (code-explorer)  
Date: 2026-06-07

---

## Fix 1 — Branch Mismatch Analysis

### The Bug Mechanism

`cmdLegacyWorktreeCleanup` in all four editions has a **dry-run/execute divergence**:

1. **Dry-run path** — correctly builds `dryBuckets.would_delete_branch` for any worktree with a branch and no `--keep-branch`. The dry-run JSON output advertises this bucket.

2. **Execute path** — the `buckets` object does NOT include a `deleted_branch` key, and the body has no `removeBranch()` call. After `removeWorktree()` succeeds, execution falls through to container cleanup and outputs `buckets`. Branch refs are silently preserved regardless of `--keep-branch`.

**Contrast with `cmdStaleWorktreeCleanup`** (fully implemented, same structural pattern):
- Root ~L957: `buckets` includes `deleted_branch: []`; a `removedBranches` Set is maintained; branch-deletion post-loop runs after the main loop with `branchExists()` guard.

The legacy cleanup was authored after stale cleanup but the branch-deletion step was never completed. The `--keep-branch` flag is parsed and fed to `dryBuckets.would_delete_branch` but has no execute-side effect.

### Per-File Line Numbers

| File | Function line | Dry-run `would_delete_branch` push | Execute `buckets` declaration |
|------|--------------|-------------------------------------|-------------------------------|
| `scripts/kaola-workflow-claim.js` | ~L1194 | ~L1253 | ~L1238 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | ~L1194 | ~L1253 | ~L1238 (byte-identical to root) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | ~L1191 | ~L1250 | ~L1235 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | ~L1178 | ~L1237 | ~L1222 |

### Two Valid Fix Options

**Option A — Add execute-side branch deletion (parity with `stale-worktree-cleanup`)**

Per file:
1. Add `deleted_branch: []` to the `buckets` object declaration.
2. Track removed branches in a local `Set`.
3. After the main loop and container cleanup, add a branch-deletion post-loop (analogous to stale-cleanup ~L1013–1027):
   ```js
   for (const branch of removedBranches) {
     if (args.keepBranch) continue;
     if (!branchExists(root, branch)) continue;
     const stillRegistered = listWorkflowWorktrees(root).some(
       w => w.branch.replace(/^refs\/heads\//, '') === branch
     );
     if (stillRegistered) continue;
     if (removeBranch(root, branch)) buckets.deleted_branch.push(branch);
   }
   ```
4. Update `docs/api.md` L877 advisory note (delete it — mismatch resolved) and add `deleted_branch` to the execute JSON block (~L879–L888).
5. New tests: `--execute` without `--keep-branch` → `deleted_branch` contains branch; `--execute --keep-branch` → `deleted_branch` is empty.

**Option B — Drop the vestigial `would_delete_branch` from dry-run (align docs with safe behavior)**

Per file:
1. Remove `would_delete_branch: []` from `dryBuckets` declaration.
2. Remove the `if (branch && !args.keepBranch) dryBuckets.would_delete_branch.push(branch);` line.
3. Update `docs/api.md` L869–L874 dry-run JSON block to remove `"would_delete_branch": []`.
4. Update L877 advisory note to be normative ("Branch refs are always preserved").
5. Update L864 prose to be unconditional.

**Evidence balance:**
- CHANGELOG L25 says execute-path preservation "is the safe direction" and was intentional at #264 ship time.
- `docs/api.md` L877 explicitly documents the mismatch as an advisory note.
- The `stale-worktree-cleanup` DOES delete branches (Option A gives full parity); legacy cleanup targets one-time migration (Option B keeps the safer default).
- workflow-plan.md explicitly enumerates both options.

**The code-architect must decide.** Option A expands destructive surface; Option B is purely subtractive.

---

## Fix 2 — Worktree Note Parity Analysis

### The 6 Target Files

| File | Template START line | Worktree-note line | Template END line |
|------|--------------------|--------------------|-------------------|
| `commands/workflow-init.md` | ~L84 | ~L135 | ~L164 |
| `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` | ~L31 | ~L82 | ~L111 |
| `plugins/kaola-workflow-gitlab/commands/workflow-init.md` | ~L84 | ~L135 | ~L164 |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md` | ~L31 | ~L82 | ~L111 |
| `plugins/kaola-workflow-gitea/commands/workflow-init.md` | ~L84 | ~L135 | ~L164 |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md` | ~L31 | ~L82 | ~L111 |

All 6 files currently have the identical old string:
```
- Active issue work runs in a sibling worktree at `<repo>.kw/<project>/` by default; set `KAOLA_WORKTREE_NATIVE=0` to disable. See README for the full contract.
```

### Required Replacement

Canonical new path from `worktreePathFor()` in `scripts/kaola-workflow-claim.js` (~L142):
```js
return path.join(mainRoot, '.kw', 'worktrees', project);
```

Replacement string (architect to confirm exact wording):
```
- Active issue work runs in a repo-local worktree at `<repo-root>/.kw/worktrees/<project>/` by default; set `KAOLA_WORKTREE_NATIVE=0` to disable. See README for the full contract.
```

"sibling worktree" → "repo-local worktree" to match #264 canonical terminology (README and `docs/api.md` ~L840 use "repo-local hidden worktree at `<repo-root>/.kw/worktrees/<project>/`").

### Byte-Identity Contract

`extractClaudeTemplate()` in `scripts/validate-kaola-workflow-contracts.js` (~L387–396) extracts the content between `<!-- KW-CLAUDE-TEMPLATE-START -->` and `<!-- KW-CLAUDE-TEMPLATE-END -->` and strips whitespace. Three validators assert within-pair equality:
- GitHub: `commands/workflow-init.md` ↔ `plugins/kaola-workflow/skills/.../SKILL.md`
- GitLab: `plugins/.../commands/workflow-init.md` ↔ `plugins/.../skills/.../SKILL.md`
- Gitea: same pattern

**Cross-forge equality (GitHub ↔ GitLab ↔ Gitea) is NOT validator-enforced** — only within-pair (cmd ↔ SKILL). However all 6 currently have identical content, so a single replacement applied to all 6 maintains both within-pair and cross-forge consistency.

A half-edit will fail the within-pair assertion at `npm test`. All 6 must be updated atomically. The template CONTENT between the markers is the unit of equality; the markers sit at different absolute line numbers across file types (irrelevant to the assertion).

---

## Test Surface

### Fix 1 — Existing Tests

**`scripts/simulate-workflow-walkthrough.js`**
- `testLegacyWorktreeCleanupDryRun()` (~L7558–7591): asserts `out.dry_run === true`, `out.would_remove` contains the legacy path, filesystem dir not removed. Does NOT assert `would_delete_branch`.
- `testLegacyWorktreeCleanupDirtySkip()` (~L7597–7634): tests execute path with `--execute` (asserts `skipped_dirty`) and `--execute --force` (asserts `removed`). Does NOT assert `deleted_branch` or `would_delete_branch`.

**`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`**
- `testGitlabLegacyWorktreeCleanupDryRun()` (~L3146–3198): asserts `dry_run === true`, `would_remove` contains legacy path, filesystem not removed. No `would_delete_branch` assertion.

**`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`**
- `testGiteaLegacyWorktreeCleanupDryRun()` (~L3112–3165): same structure as GitLab. No `would_delete_branch` assertion.

**Summary:** No existing test asserts `would_delete_branch` in dry-run or `deleted_branch` in execute. Zero branch-deletion test coverage. Both options start from zero — nothing to break, only new coverage to add.

### Fix 2 — Test Surface

No behavioral tests cover template content. The `extractClaudeTemplate` within-pair assertion in `validate-kaola-workflow-contracts.js` (~L416–428) is the gate — runs via `npm test`. A half-edit fails this assertion.

---

## docs/api.md Surface

Lines needing update for Fix 1 (regardless of option chosen):
- **~L864** (prose): "Branch refs are preserved (only the worktree registration and filesystem directory are removed)." — Option A: qualify or remove. Option B: keep as normative.
- **~L869–L874** (dry-run JSON block): contains `"would_delete_branch": []`. Option A: keep + add matching `deleted_branch` to execute block. Option B: remove.
- **~L877** (advisory note): "Note: `would_delete_branch` is populated in dry-run output... but the execute path removes only the worktree... Branch refs are always preserved." Option A: delete entirely. Option B: keep last sentence, remove the mismatch clause.
- **~L879–L888** (execute JSON block): currently `{ "dry_run": false, "removed": [], "skipped_dirty": [], "stashed": [], "exported": [], "failed_preserve": [] }`. Option A: add `"deleted_branch": []`. Option B: no change.

---

## Risks and Gotchas

### Fix 1 — Edition Byte-Identity

- Root (`scripts/`) and Codex mirror (`plugins/kaola-workflow/scripts/`) must be **byte-identical** per `validate-script-sync.js` / `COMMON_SCRIPTS`. Any change to root `claim.js` must be applied identically to the Codex copy. `impl-legacy-root` has both in its write set.
- GitLab and Gitea editions are logic-identical (same control flow, same bucket structure) but NOT byte-identical — different file names in assert strings, different function comment prefixes, different `extractIssueNumber()` branch-prefix patterns (`workflow/gitlab-issue-N` vs `workflow/gitea-issue-N`). Apply the same structural change to both editions.

### Fix 1 — Branch Deletion Safety (Option A only)

The `stale-worktree-cleanup` guards against deleting a branch still referenced by a live worktree (`listWorkflowWorktrees` re-scan + `stillRegistered` check). Legacy cleanup should include the same guard. Branch deletion uses `wt.branch.replace(/^refs\/heads\//, '')` → raw branch name — forge-prefixed names work correctly.

### Fix 2 — All 6 Files Atomically

Within-pair byte-identity fires immediately at `npm test` if only one file of a pair is updated. All 6 must be updated in the same commit. Cross-forge content is forge-agnostic (filesystem path, not a command name).

### docs/api.md Timing

Per the plan, `docs/api.md` is updated in the `docs` node (after `review`). Implementer nodes do NOT touch it.

### CHANGELOG.md L25

Current text: "(2) legacy-worktree-cleanup's dry-run reports a `would_delete_branch` bucket, but the execute path intentionally preserves branch refs (the safe direction); the `docs/api.md` note flags this advisory mismatch." After fix, the `finalize` node adds an [Unreleased] entry and the "Known minor follow-ups" note can be struck or superseded.

---

## Key Files Summary

| File | Fix | Role |
|------|-----|------|
| `scripts/kaola-workflow-claim.js` | 1 | Root claim: `cmdLegacyWorktreeCleanup`, `removeBranch`, `branchExists`, `cmdStaleWorktreeCleanup` (reference) |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | 1 | Codex mirror: byte-identical to root |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 1 | GitLab edition |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 1 | Gitea edition |
| `scripts/simulate-workflow-walkthrough.js` | 1 | Main test: `testLegacyWorktreeCleanupDryRun` ~L7558, `testLegacyWorktreeCleanupDirtySkip` ~L7597 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | 1 | GitLab test: `testGitlabLegacyWorktreeCleanupDryRun` ~L3146 |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | 1 | Gitea test: `testGiteaLegacyWorktreeCleanupDryRun` ~L3112 |
| `commands/workflow-init.md` | 2 | GitHub command: worktree-note ~L135 |
| `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` | 2 | Codex SKILL: worktree-note ~L82 |
| `plugins/kaola-workflow-gitlab/commands/workflow-init.md` | 2 | GitLab command: worktree-note ~L135 |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md` | 2 | GitLab SKILL: worktree-note ~L82 |
| `plugins/kaola-workflow-gitea/commands/workflow-init.md` | 2 | Gitea command: worktree-note ~L135 |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md` | 2 | Gitea SKILL: worktree-note ~L82 |
| `docs/api.md` | 1+2 | API docs: legacy-worktree-cleanup section ~L838–888 |
| `scripts/validate-kaola-workflow-contracts.js` | 2 | Contract validator: `extractClaudeTemplate` ~L387, within-pair assertions ~L416–428 |
| `CHANGELOG.md` | 1 | ~L25: existing "known follow-up" note from #264 |
