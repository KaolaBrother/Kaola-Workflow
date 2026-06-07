# Node impl-forge (implementer) — evidence

non_tdd_reason: cross-edition forge ports of an already-tested change (regression-green verification)
verification: regression-green — full `npm test` passes all four suites (claude, codex, gitlab, gitea)

## Files changed (4 declared)
1. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — ported helpers `inPlaceHead`/`treeDirty`/`defaultBranch`; `claimProject` hoist+dirty-gate(`dirty_tree_refused`)+in-place checkout block(base_branch trap guard); `writeState` base_branch push in ## Sink; `cmdRelease` base-restore + feature-branch-delete (reads savedBaseBranch from folder.state_file before archive, restore_note in output). Prefix `workflow/gitlab-issue-*` from the port's own buildBranchName.
2. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — identical port; prefix `workflow/gitea-issue-*`.
3. `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — extended #149 Test 1 (issue 601): `.gitignore` commit + assert HEAD === `workflow/gitlab-issue-601` + tree clean (in addition to worktree_path==='').
4. `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — extended #149 Test 1 (issue 8): assert HEAD === `workflow/gitea-issue-8` + tree clean.

## Verification
- `node --check` OK on all 4 files.
- Full `npm test`: all four suites pass. Forge walkthroughs run test-gitlab/gitea-workflow-scripts.js via their run() chain, exercising the extended NATIVE=0 blocks.

## Notes
- Inserted git block is forge-neutral (branch/root only) — matches canonical text. Forge prefixes come from each port's buildBranchName, not hardcoded.
- GitHub/codex editions + docs untouched (owned by impl-core / impl-docs).
