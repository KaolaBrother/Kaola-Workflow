# Node impl-docs (implementer) — evidence

non_tdd_reason: documentation
verification: build-green — `node scripts/validate-workflow-contracts.js` AND `node scripts/validate-kaola-workflow-contracts.js` both exit 0 (no doc token-pin broken).

## Files changed (2 declared)
1. `docs/api.md` — § Worktree Provisioning, KAOLA_WORKTREE_NATIVE entry: documents NATIVE=0 in-place branch creation (online + git history + non-detached → create/checkout `workflow/[gitlab-|gitea-]issue-N`, record `base_branch` in ## Sink, discard restores base + deletes feature branch); edge cases (dirty → `dirty_tree_refused` no folder/branch; detached/no-history → record-only acquire + inPlaceNote; offline → no branch; re-claim folder-absent-branch-present → base_branch ''); KNOWN LIMITATION note (worktree-provision-failure path still records no branch, unchanged, follow-up); updated discriminator to a three-way table with base_branch-present as the NATIVE=0-in-place signal.
2. `docs/architecture.md` (~L43-45) — appended one #260 note: NATIVE=0 now creates/checks-out the feature branch in-place, records base_branch, restores on discard.

## Verification grounded in code
Doc wording was written after `git diff HEAD -- scripts/kaola-workflow-claim.js` to match the actual implemented behavior (`dirty_tree_refused` status, `base_branch` field, cmdRelease restore), not invented.
