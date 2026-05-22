# doc-updater output — issue-157

## Files Modified

### CHANGELOG.md
Added "### Added" section under [Unreleased] with stale-worktree-cleanup entry documenting the new subcommand across all three forge editions, five flags, and test coverage.

### docs/api.md
Added comprehensive section "Script: `kaola-workflow-claim.js stale-worktree-cleanup`" after the stale-worktree-check section:
- Invocation examples for GitHub, GitLab, Gitea editions
- Flags: --execute, --archive, --export, --force, --keep-branch
- Behavior: dry-run default, clean/dirty/missing worktree handling, branch cleanup
- Exit codes: 0 success, 1 error
- JSON output schema
- Typical cleanup workflow example
- Offline mode behavior

## Files Skipped

- README.md: already updated by Task 7 implementation
- docs/architecture.md: not needed; cleanup is operational utility, not Phase 6 sink architecture
- .env.example: KAOLA_*_MOCK_SCRIPT are test infrastructure only, not user config
