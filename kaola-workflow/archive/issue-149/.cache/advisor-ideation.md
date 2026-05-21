# Advisor: Issue #149 Ideation Gate

## Verdict
Approach A is correct. Approved with refinements.

## Additional Fact
Phase 4 command file already gates on `${KAOLA_WORKTREE_NATIVE:-0}` = default OFF. The claim scripts are the sole outlier — this is a one-place bug fix, not a system-wide design change.

## Risk Refinement
**Behavior change for users relying on buggy always-on provisioning.** Docs always said default-OFF but implementation delivered default-ON since inception. Users without the env var will stop getting worktrees.

**Action:** CHANGELOG must include explicit migration note: "Set `KAOLA_WORKTREE_NATIVE=1` in your environment to preserve sibling-worktree behavior from prior releases." Mark visibly as Breaking / Upgrade notes.

## Gotchas for Phase 3 Architect

1. **Add OFFLINE=1 + NATIVE=1 test for GitHub too** (not just GitLab/Gitea). Verifies `!OFFLINE` still short-circuits when NATIVE is on. Ensures symmetry and prevents silent future regression.

2. **`runClaimOnline` helper injection affects ALL callers.** Grep each caller in each test file to confirm none currently assert `worktree_path === ''` before adding `KAOLA_WORKTREE_NATIVE: '1'` to the helper.

3. **Raw spawnSync bypass sites** — make an explicit Phase 3 architect task to grep `claimScript.*spawnSync` (or equivalent) in each test file to confirm GitLab 919-920 and Gitea 916 are the only bypasses.

4. **Drift guard fix idiom is `cp`, not parallel edits.** Edit `scripts/kaola-workflow-claim.js` first, then `cp` to `plugins/kaola-workflow/scripts/`. Parallel hand-edits risk byte-difference drift-guard failures.

## Additional Out-of-Scope
- Do NOT auto-set `KAOLA_WORKTREE_NATIVE=1` in any install script/hook/default env
- Do NOT add a deprecation warning when env var is unset
- Do NOT retroactively set `worktree_path: ''` on existing active folders
