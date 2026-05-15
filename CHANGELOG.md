# Changelog

## 3.1.5 - 2026-05-15 (Claude Code) / Codex 1.1.5 - 2026-05-15

### Fixed

- **Direct duplicate issue claim guard**: `kaola-workflow-claim.js claim` now rejects an already-claimed GitHub issue even when a second session supplies a different workflow project name. The guard checks both live lock files and active `workflow-state.md` Sink metadata, closing the direct-claim bypass around classifier/bootstrap issue skipping.
- **Exact-path parallel classifier conflicts**: `kaola-workflow-classifier.js` now extracts exact repository paths from issue bodies, offline roadmap metadata, and claimed phase artifacts. Exact overlap returns `red`, including shared-infrastructure and packaged plugin paths, while different files under the same shared-infrastructure directory can still return `yellow`.
- **Simultaneous bootstrap coordination**: `/workflow-next` bootstrap now retries the open issue list when a session loses the local claim race after classification, allowing two concurrently started sessions to split across available issues automatically.

### Tests

- Added a cross-session phase matrix to the Claude walkthrough simulation: for phases 1-6, a second session must fail direct duplicate claims, classifier must skip the occupied issue, bootstrap must choose the next free issue, state-only active leases must block duplicates, and completed states must not block fresh claims.
- Added the same phase-matrix coverage to the Codex plugin walkthrough simulation.
- Added root and Codex plugin regression coverage for exact shared-infrastructure path overlap, plugin path overlap, area-label-only yellow fallback, conservative unknown-scope red, and offline `touches:` metadata.
- Added deterministic claim-race retry and true two-process parallel bootstrap simulations for both root and packaged Codex workflows.

## 3.1.3 - 2026-05-15 (Claude Code) / Codex 1.1.3 - 2026-05-15

### Fixed

- **Durable session lease recovery**: added `kaola-workflow-claim.js session` so phase commands and Codex skills can rehydrate `KAOLA_SESSION_ID` from the live lock or active `workflow-state.md` lease before starting the heartbeat ticker. This closes the residual gap where later sessions/phases could lose the bootstrap environment variable and stop refreshing the in-progress claim.
- **Phase heartbeat bootstraps**: all six Claude phase commands and all six Codex phase skills now recover the session before checking ticker liveness.

### Tests

- Added walkthrough regression coverage for lock-backed and workflow-state-backed session lookup in both runtime surfaces.
- Extended the phase-shim corpus check to require session rehydration alongside ticker liveness checks.

## 3.1.2 - 2026-05-15 (Claude Code) / Codex 1.1.2 - 2026-05-15

### Added — prompt-level Cross-Session Staging Guard (both runtimes)

- **`commands/kaola-workflow-phase6.md`**: new "Cross-Session Staging Guard" section ahead of Step 8. Before any `git add` under `kaola-workflow/{project}/`, the prompt instructs the agent to read the project lock (or `workflow-state.md` `session_id`) and refuse to stage when `KAOLA_SESSION_ID` does not match the owner. Also enforces a single-project-per-commit rule that scans `git diff --cached` and aborts on multi-project staging. Prompt-level regulation is the primary mechanism; the Claude Code `PreToolUse:Bash` hook fixed in 3.1.1 remains as defense-in-depth.
- **`plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`**: mirror of the same guard inside Step 8. Codex has no hook system, so the prompt-level guard is the only regulator on the Codex runtime — Codex sessions and Claude Code sessions can now safely interleave commits on the same repo, locally or across machines, with the shared lock substrate and matching prompt-level checks on both sides.
- **Epic Case 11** in `scripts/simulate-workflow-walkthrough.js`: corpus-grep assertion that both prompt files contain the `Cross-Session Staging Guard`, `BLOCKED: cross-session staging`, and `BLOCKED: split your commit` markers. Guards future renames or drops.

### Note on parallel-workflow parity

Issues #4–#10 already delivered the parallel-workflow substrate (shared `kaola-workflow-claim.js`, classifier, sinks, tiebreaker, ticker, remote sweeper, `--runtime claude|codex` lock field) to both runtimes through shared scripts. This release closes the last visible gap: Codex now has prompt-level enforcement equivalent to the Claude Code `PreToolUse` hook fixed in 3.1.1.

## 3.1.1 - 2026-05-15

### Fixed

- **Pre-commit hook silently no-op** (`hooks/kaola-workflow-pre-commit.sh`): the hook stored the inbound Bash tool command in a variable named `BASH_COMMAND`, which is a reserved bash special variable that bash overwrites with the currently-executing command. The `case "$BASH_COMMAND" in *"git commit"*)` match therefore never fired and the hook silently exited 0 on every invocation, allowing cross-session commits the guard was meant to block. Renamed the local variable to `INVOKED_CMD` and added a comment explaining the gotcha.

### Tests

- **Epic Case 10 (pre-commit hook regression)**: new walkthrough block exercises the hook end-to-end against a real git repo with a lock file. Sub-tests 10A–10E cover wrong-session block (exit 2 + `BLOCKED` stderr), owning-session pass-through, non-commit short-circuit, missing `KAOLA_SESSION_ID` short-circuit, and multi-project split-commit guard.

## Unreleased

### Documentation

- **Minimal ECC configuration guidance**: Added a "Minimal Kaola-Workflow ECC configuration" block to the `## Dependency — Everything Claude Code (ECC)` section of README.md. Recommends `ECC_HOOK_PROFILE=minimal`, installing only the 9 required ECC subagents, skipping ECC language rules for Kaola-Workflow setup, and leaving common rules to user preference.
- **ECC Hook Policy reframing**: Updated the `## ECC Hook Policy` lead-in to state that the minimal profile is the recommended default for all Kaola-Workflow usage, not only for heavy Phase 4 bursts.

### Fixed (cross-machine-hardening)

- **Regex global-flag fix in `kaola-workflow-claim.js`**: `updateLeaseInPlace()` now uses `/g` flag on regex replacements to properly update multiple `expires:` and `last_heartbeat:` fields in workflow-state.md. Previously the non-global flag would only replace the first occurrence, leaving stale heartbeat values.
- **Git push argument safety**: `handleTiebreakerYield()` now uses `git push origin -- branch` to properly separate git options from branch name, preventing branch names starting with `--` from being interpreted as options.
- **Signal handler hardening**: `cmdTicker()` now handles both SIGTERM and SIGINT signals with a shared `gracefulShutdown()` function that cleanly removes the PID file before exit. Ensures ticker process cleanup on all shutdown paths.
- **Liveness check in phase shims**: All 12 phase command shims and Codex skills now include a PID liveness check (`kill -0`) before spawning the ticker. If the PID file exists but the process is dead, the ticker is respawned. Prevents stale ticker processes from blocking subsequent workflow phases.
- **PID acquisition return value**: `acquirePidFile()` now correctly returns `true` after successful lock-file creation (was returning file descriptor, which is non-null and truthy but semantically wrong).
- **Number.isFinite guard in ticker**: First-tick tiebreaker check now guards `issue_number` with `Number.isFinite()` instead of truthiness check, preventing ticker from crashing if issue_number is NaN or non-numeric.
- **Error logging in adoption push**: `handleTiebreakerYield()` now logs adoption push failures to stderr (was silently catching all errors). Helps diagnose network or permissions issues during cross-session adoption.
- **Redundant condition removal**: `runTick()` now removes the redundant `match.session_id !== tickCtx.session` check (the `find()` already guarantees equality). Improves clarity of lock-match logic.
- **Test improvements**: `simulate-workflow-walkthrough.js` now uses async/await patterns with `sleep()` and `waitExit()` helpers to properly test ticker liveness, SIGTERM cleanup, and SIGINT handling. Added NEW test cases: MEDIUM-2 9B2 (async liveness test), LOW-3 (corpus-grep for all shims), and LOW-2 SIGINT handler test.

### Added (codex-parity)

- **`bootstrap` subcommand** (`kaola-workflow-claim.js bootstrap`): single call that runs sweep → watch-pr → classify → claim in sequence. Replaces the 30-line sweep/classify/claim chain that was previously inlined in `workflow-next.md` Startup Step 0. Accepts `--session`, `--runtime`, and `--sink`; outputs `{ project, issue, verdict }` JSON. If no actionable issue is found, exits non-zero.
- **`--runtime claude|codex` flag**: accepted by both `claim` and `bootstrap` subcommands. Written to the lock file as the `runtime` field. Validated against the `claude|codex` allowlist.
- **`runtime` field in lock schema** (`buildLockData`): records which runtime claimed the session; defaults to `claude` when omitted.
- **`kaola-workflow-next-pr` skill**: new Codex skill (9th entry) for PR-sink startup. Sets `KAOLA_SINK=pr` and calls `bootstrap --runtime codex --sink pr`, then delegates to `kaola-workflow-next`. Mirrors the Claude Code `/workflow-next-pr` command.
- **Session heartbeat in phase skills**: all six phase skills (`kaola-workflow-research`, `kaola-workflow-ideation`, `kaola-workflow-plan`, `kaola-workflow-execute`, `kaola-workflow-review`, `kaola-workflow-finalize`) now include a Session Heartbeat section that starts the background ticker when `KAOLA_SESSION_ID` is set and no PID file exists.
- **`kaola-workflow-next-pr` validator entry**: `validate-kaola-workflow-contracts.js` now includes the 9th skill with bootstrap and heartbeat assertions.

### Added

- **Cross-machine claim tiebreaker**: After posting a GitHub claim comment, `cmdClaim` fetches all sentinel claim comments for the issue, sorts by comment ID (lowest wins), and yields cleanly if another session prevails. Loser posts `:yielded →` comment and exits non-zero.
- **Background heartbeat ticker** (`ticker` subcommand): `node scripts/kaola-workflow-claim.js ticker --session <id> [--interval <ms>]` starts an idempotent background process. Writes PID to `kaola-workflow/.tickers/{session}.pid`, ticks every 15 min (default), bumps lock `last_heartbeat` and `expires` (+2h), and updates GitHub claim comment every 4th tick. Runs late tiebreaker check on first tick.
- **Remote sweeper `updated_at` guard**: `sweep` subcommand now checks GitHub comment `updated_at` — if < 24h old, session is considered active (skip). If ≥ 24h old AND lock `expires` ≥ 24h ago, posts `:released-stale` comment and removes label AND assignee.
- **`--remove-assignee @me` in release/sweep**: Both `releaseSession` and `cmdSweep` now call `gh issue edit ... --remove-assignee @me` alongside `--remove-label workflow:in-progress`.
- **Regex fix in `postGitHubClaim`**: Comment ID extraction now uses `/issuecomment-(\d+)/` (was `/comments\/(\d+)/`) to correctly parse `gh issue comment` output.

### Security

- Lock files (`kaola-workflow/.locks/*.lock`) and session files (`kaola-workflow/.sessions/*.json`) are now created with restrictive mode `0o600` (owner read/write only) instead of the default umask.
- `kaola-workflow-claim.js` now validates `claim_comment_id` as a digit-only integer before writing to the `## Lease` block in `workflow-state.md`. Non-digit values render as `N/A`, preventing markdown corruption.
- `cmdPatchBranch` now rejects `--branch` arguments containing `\n` or `\r` characters, preventing markdown section injection into `workflow-state.md`.
- `cmdStatus` now skips (or drift-flags) lock entries whose `session_id` fails `isSafeName()` validation, preventing path traversal when reading session files.
- `updateSinkLease` now uses function-form `.replace()` callbacks instead of string-form, preventing `$&`/`$1` metacharacter expansion if workflow field values contain `$` characters.

### Changed

- `updateLeaseInPlace()` now emits a stderr warning when the `## Lease` section is missing in `workflow-state.md`, instead of silently no-oping. Message: `updateLeaseInPlace: ## Lease section missing in <path>`
- `simulate-workflow-walkthrough.js`: Epic Case 8 (tests 8A–8F) added for claim-hardening validation. Tests verify lock/session file permissions, claim_comment_id validation, unsafe session_id drift detection, branch-name injection prevention, and heartbeat warnings.

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
- `scripts/kaola-workflow-sink-pr.js`: PR-based sink — pushes branch, opens GitHub PR via `gh pr create`, records PR URL and PR number in lock file, `## Sink` block of `workflow-state.md`, and `phase6-summary.md`. Supports `pr_auto_merge: true` config for `gh pr merge --auto --squash --delete-branch`. OFFLINE mode writes `OFFLINE_PLACEHOLDER` and exits 0.
- `commands/workflow-next-pr.md`: thin wrapper (≤40 lines) that sets `KAOLA_SINK=pr` and delegates to `/workflow-next`. Use when Phase 6 should open a PR instead of a local FF merge.
- `kaola-workflow-claim.js` `watch-pr` subcommand: scans all `.lock` files with `sink: pr` and a `pr_url`; calls `gh pr view --json state,mergedAt,url,number,closedAt` for each; releases MERGED/CLOSED leases automatically; refreshes heartbeat on OPEN PRs. Invoked at `/workflow-next` Startup Step 0 between sweep and classify.
- `kaola-workflow-claim.js`: extracted `releaseSession(root, sessionId, reason)` helper from `cmdRelease` body (DRY — used by both `cmdRelease` and `cmdWatchPr`).

### Changed

- `kaola-workflow-claim.js`: `updateSinkLease` now writes real branch name at claim time (was always `TBD`).
- `kaola-workflow-phase6.md`: Step 8 renamed to `## Step 8 - Sink`; conditional `case "$SINK_KIND"` dispatch reads `sink:` field from `## Sink` block; defaults to `merge` for backward compatibility with pre-feature claims.
- `install.sh`: `kaola-workflow-sink-merge.js` and `kaola-workflow-sink-pr.js` added to script copy loop.
- `kaola-workflow-claim.js`: `claim --sink {merge|pr}` flag; `sink:` field written to lock file and `## Sink` block; `pr_url:`/`pr_number:` fields added to lock schema; `updateSinkLease` now rebuilds the full `## Sink` block via `buildSinkBlock` helper.
- `commands/workflow-next.md`: `watch-pr` invocation added to Startup Step 0 (order: sweep → watch-pr → classify → claim); `KAOLA_SINK_FLAG` propagated to `claim` call from `KAOLA_SINK` env var.
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
