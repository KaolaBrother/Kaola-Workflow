# docs node evidence — issue #264

**Date:** 2026-06-07

## Files edited

### README.md
- ~902-905 (multi-terminal note): replaced sibling path + adaptive-exempt sentence with repo-local `.kw/worktrees/<project>/` path and "all paths" phrasing.
- ~917-921 (Per-issue Git worktrees intro): "on every full/fast-path claim" → "on every claim (full, fast, and adaptive paths)"; removed adaptive-exempt sentence.
- ~928-933 (Where.): updated path to `<repo-root>/.kw/worktrees/<project>/`, updated example to `~/Workspace/Kaola-Workflow/.kw/worktrees/issue-42/`, added note that `.kw/` is git-ignored.
- ~943-946 (Listing and removal.): added `legacy-worktree-cleanup` note — dry-run default, `--execute` to perform, dirty worktrees skipped unless `--archive`/`--export`/`--force`, branch refs preserved.
- ~568 (adaptive path description in Adaptive path section): replaced "does NOT provision a worktree ... pending #264" with statement that planner authors plan at repo-root and executor operates in the provisioned worktree.
- ~604 (Operational scripts table, claim.js row): added `legacy-worktree-cleanup` to subcommand list; updated "full/fast paths only" to "all workflow paths (full, fast, adaptive)"; updated path to `<repo-root>/.kw/worktrees/<project>/`.

### docs/api.md
- ~106 KAOLA_WORKTREE_NATIVE: updated path from sibling `<repo-parent>/<repo-name>.kw/<project>/` to repo-local `<repo-root>/.kw/worktrees/<project>/`; removed adaptive-path exemption clause.
- ~108 When provisioning is attempted: removed "or the claim is on the adaptive path (`--workflow-path adaptive`)" condition.
- ~110 On provisioning failure / Discriminator: removed "adaptive" from the intentional-repo-root-run cases.
- ~58-70 Pre-merge guards (Sink API): added third bullet `assertBranchHasNonWorkflowChanges` (AC7 / #264) — refuses merge when entire diff vs `origin/main` is `kaola-workflow/**`; skips when origin/main unresolvable.
- ~501 adaptive Claim step: replaced "runs at repo-root, does NOT provision a worktree" with statement that claim provisions worktree at `.kw/worktrees/<project>/` and executor operates in it.
- ~518 structured return JSON `worktree_path`: replaced "always '' on the adaptive path — a repo-root run, no worktree, pending #264" with accurate description.
- After stale-worktree-cleanup section: added new `### Script: kaola-workflow-claim.js legacy-worktree-cleanup` section documenting subcommand, flags, behavior, and JSON output shapes.

### commands/workflow-init.md
- Line 135: `<repo>.kw/<project>/` → `<repo-root>/.kw/worktrees/<project>/`; added "all paths: full, fast, adaptive".

### plugins/kaola-workflow-gitlab/commands/workflow-init.md
- Line 135: same change as commands/workflow-init.md.

### plugins/kaola-workflow-gitea/commands/workflow-init.md
- Line 135: same change as commands/workflow-init.md.

## Source verification (claim.js)

- `worktreePathFor` (line 140-143): confirmed returns `path.join(mainRoot, '.kw', 'worktrees', project)`.
- `legacySiblingWorktreePathFor` (line 145-148): confirmed legacy path is `<parent>/<repo>.kw/<project>`.
- `cmdLegacyWorktreeCleanup` (line 1189-1311): confirmed flags `--execute`, `--archive`, `--export`, `--force`; dry-run default; dirty worktrees skipped without strategy flag; `removeWorktree` (line 216-228) uses `git worktree remove --force` only (no `git branch -d`) — branch refs are preserved; empty legacy container deleted after worktrees removed.
- Claim path (line 467-472): confirmed comment "All workflow paths (full, fast, adaptive) provision a repo-local hidden worktree" — adaptive no longer exempt.

## Source verification (sink-merge.js)

- `assertBranchHasNonWorkflowChanges` (line 98-123): confirmed AC7 guard refuses when all changed files start with `kaola-workflow/`; skips when `origin/main` unresolvable.

## Source verification (.gitignore)

- `.kw/` confirmed at line 10 of `.gitignore`.

## Walkthrough result

`node scripts/simulate-workflow-walkthrough.js` — exit 0, "Workflow walkthrough simulation passed".
