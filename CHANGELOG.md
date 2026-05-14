# Changelog

## Unreleased

### Added

- Multi-session substrate for concurrent Kaola-Workflow sessions. Session leases
  are managed by `kaola-workflow-claim.js` (claim, release, heartbeat, sweep,
  status subcommands). A pre-commit hook (`kaola-workflow-pre-commit.sh`) blocks
  cross-session git commits to prevent merge conflicts when multiple sessions
  target different workflow projects simultaneously. Session initialization is
  available in `workflow-init` and `workflow-next`, with heartbeat renewal at
  each phase entry to keep the lease fresh. Support files are installed to
  `~/.claude/kaola-workflow/` by `install.sh`.
- `scripts/kaola-workflow-sink-merge.js`: branch-per-issue auto-merge sink — 10-step rebase-then-ff-merge sequence with merge-base skip-check, FF retry loop (MAX_AUTOMERGE_RETRIES=3), exit codes 0/1/2, and OFFLINE support via `KAOLA_WORKFLOW_OFFLINE=1`.
- `scripts/kaola-workflow-roadmap.js`: per-issue ROADMAP.md regenerator with `generate`, `migrate`, `validate`, and `init-issue` subcommands. `kaola-workflow/.roadmap/issue-{N}.md` files replace direct ROADMAP.md writes; ROADMAP.md is regenerated only at Phase 6 Step 7 and detected-stale by workflow-next validate. Eliminates ROADMAP.md merge conflicts when multiple sessions work simultaneously.
- `cmdPatchBranch` subcommand in `kaola-workflow-claim.js`: backfills branch name in lock file, Sink block, and GitHub claim comment for Stage 1 migration.
- Phase 1 Step 6: Cut Feature Branch — worktree-clean check, idempotent `git checkout -b`, and Stage 1 migration support.
- `Branch:` line in `workflow-next.md` Required Output Before Routing block for explicit branch tracking.
- `scripts/kaola-workflow-classifier.js`: parallel-work classifier invoked in Startup Step 0 of `workflow-next.md` before claim. Classifies open GitHub issues as `green`, `yellow`, `red`, or `blocked` based on lock-file claimed sets, coarse file-area overlap, shared-infra detection (`scripts/`, `hooks/`), and `depends-on:#N` label resolution via `gh issue view`. Config at `~/.config/kaola-workflow/config.json` (`parallel_mode: auto`). OFFLINE conservative mode: `blocked` when `depends-on` detected; issues already in lock files are filtered before classification (exit code 2).

### Changed

- `kaola-workflow-claim.js`: `updateSinkLease` now writes real branch name at claim time (was always `TBD`).
- `kaola-workflow-phase6.md`: Step 8 is now Sink Merge (invokes `kaola-workflow-sink-merge.js`) instead of manual `git commit` and `git push`.
- `install.sh`: `kaola-workflow-sink-merge.js` added to script copy loop.
- `simulate-workflow-walkthrough.js`: Epic Cases 2 (OFFLINE fast-path), 3 (rebase path), and 4 (FF race exhaustion) added for sink-merge integration testing.
- `validate-workflow-contracts.js`: stale assertions replaced; 10 new `assertIncludes` checks added for sink-merge contract validation.

## Codex plugin 1.1.1 - 2026-05-14

### Changed

- Raised the Codex `planner` role to `xhigh` reasoning effort to match the
  Claude Code Opus-backed planner role.
- Documented that Codex role profiles do not pin model names and added contract
  validation for the managed reasoning-effort map.

## 3.1.0 - 2026-05-13

### Changed

- Made routine Kaola-Workflow bookkeeping autonomous, including generated
  workflow project names, collision suffixes, and internal advisor-backed
  strategy/plan decisions.
- Added Claude `/goal` or Stop-hook guidance and equivalent Codex skill goal
  contracts so workflow phases continue until their objectives are complete.

## 3.0.0 - 2026-05-13

### Changed

- Renamed the project, GitHub repository, Claude Code plugin, Codex plugin,
  commands, skills, managed agent profiles, and artifact directory to
  `Kaola-Workflow` / `kaola-workflow`.
- Updated install docs for the `KaolaBrother/Kaola-Workflow` repository and
  `kaolabrother-kaola-workflow` marketplaces.
- Kept state repair and compact-resume compatibility for pre-rename active
  workflow artifact directories.

## 2.1.1 - 2026-05-11

### Fixed

- Made `kaola-workflow-next` locate the Codex repair-state script from the
  installed Codex plugin cache when the workflow pack is not checked out inside
  the target project.

## 2.1.0 - 2026-05-11

### Added

- Added Codex-native agent profile installation for the Kaola-Workflow pack.
- Added Codex install, update, verification, and release-versioning guidance to
  the README.

### Changed

- Bumped the root workflow package and Claude plugin manifest to `2.1.0`.
- Bumped the Kaola-Workflow plugin manifest to `0.2.0` for the new Codex agent
  profile install surface.
