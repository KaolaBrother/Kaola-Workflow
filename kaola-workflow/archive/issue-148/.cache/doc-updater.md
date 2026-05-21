# Doc Updater — issue-148

## Changes Made
- **CHANGELOG.md**: Added [Unreleased] entry for `stale-worktree-check` parity (GL + GT editions, forge-specific prefixes, 6 test sub-cases per forge).

## No Change Needed
- **README.md**: Line 505 already has `stale-worktree-check` in edition-agnostic subcommands table. Complete.
- **docs/api.md**: Section "Stale Worktree Detection" (lines 198-291) already has GitHub + GitLab + Gitea invocation examples with JSON schema, offline mode, exit codes. Added in Phase 4.
- **Architecture docs**: No impact — claim-layer addition, not sink-layer.
- **.env.example**: No new env vars. `KAOLA_WORKFLOW_OFFLINE` already documented.
- **Inline comments**: Function names and usage strings already updated in both claim scripts.

## Verdict: COMPLETE
All checklist items accounted for. CHANGELOG updated; all other docs already correct.
