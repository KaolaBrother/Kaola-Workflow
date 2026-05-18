# Changelog

## [Unreleased]

## [3.6.0] — 2026-05-18

### Added — Single-Issue Completion Contract (issue #46)

- **Completion Contract prose**: `commands/workflow-next.md` — removed "issue selection when there is one unambiguous open issue" auto-pick clause from Goal-Driven Autonomy; added `/goal` template warning against "next issue in line" phrasing; revised Startup Step 3 to require explicit ask instead of autonomous selection; appended `## Completion Contract` section enforcing stop-and-await after Phase 6 closes one issue.
- **Phase 6 stop contract**: `commands/kaola-workflow-phase6.md` — appended `## Completion Contract` section.
- **Init contract warning**: `commands/workflow-init.md` — added bullet warning that `/goal` templates must not use cross-issue continuation phrasing.
- **README stop contract**: `README.md` — added completion contract block to Autonomy And Goal Contract section.
- **Codex skill mirrors**: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` and `kaola-workflow-finalize/SKILL.md` — appended `## Completion Contract` sections.
- **Validators**: `scripts/validate-workflow-contracts.js` and `scripts/validate-kaola-workflow-contracts.js` — added 16 `assertIncludes` checks for completion contract prose surfaces.

### Added — Bootstrap Explicit-Target Enforcement (issue #47)

- `bootstrap` subcommand now requires explicit `--target-issue N`, matching the issue-44 contract for `startup` and `pick-next`. The `runBootstrapClaimFirstAvailable` auto-picker is removed. Agents must select the issue before invoking bootstrap.

### Fixed — Stale-State Flaws and Lifecycle Gaps (issue #45)

- **P1-A: `cmdStatus` closed-issue drift**: `state` field now fetched in `--json` fields; adds `'issue closed'` drift entry when remote issue is `CLOSED`.
- **P1-B: `cmdWorktreeStatus` closed annotation**: Entries now include `closed: issue_data?.state === 'CLOSED'` so callers can identify closed-issue worktrees.
- **P1-C: `kaola-workflow-finalize` SKILL.md sink capture order**: `SINK_KIND` and `SINK_BRANCH` extraction moved before `cmdFinalize` call to prevent reading stale values after merge.
- **P1-D: `removeWorktree` parent cleanup**: After git worktree remove, attempts `rmdirSync` on the `.kw/` parent dir; swallowed silently if not empty or missing.
- **P2-A: `scanPhaseArtifacts` conditional advance**: When `phase4-progress.md` is detected, reads it and routes to `phase4` if any row contains `pending` or `in_progress` status, instead of unconditionally advancing.
- **P2-B: `cmdSweep` abandoned GC third pass**: Third pass scans the `*.kw/` parent directory for `.abandoned-<ISO>` dirs older than `GC_CUTOFF_MS` and removes them.
- **P2-C: `cmdWorktreeStatus` unregistered dirs**: Second pass scans the `*.kw/` parent for dirs not in the registered worktree list, deduplicates via `realpathSync`, and adds `{ registered: false }` entries.
- **P3-A: `cmdStartup` worktree_path in receipt**: Startup receipt now includes `worktree_path` read from the lock file for `owned` and `acquired` branches; `target_mismatch` branch explicitly excludes it per issue-44 NO-WRITE invariant.
- **P3-B: `KAOLA_WORKTREE_PATH` in `kaola-workflow-next` SKILL.md**: `KAOLA_WORKTREE_PATH` extracted from startup/pick-next JSON output in both the worktree-native and fallback startup branches.

### Added — Agent-Directed Issue Picking (issue #44)

- **Explicit target-issue selection**: `cmdStartup` and `cmdPickNext` now require explicit `--target-issue N` flag instead of auto-picking. Agents must inspect local roadmap + GitHub issues and pass the chosen issue number. Scripts refuse auto-pick with typed refusals: `target_occupied`, `target_mismatch`, `user_target_blocked`, `user_target_red`, `target_unavailable`, `no_target`.
- **New `claimExplicitTarget()` helper**: Centralized explicit-target claim logic in `kaola-workflow-claim.js` validates target issue is available, unclaimed, and green/yellow (not blocked or red), then performs the claim transaction.
- **Startup Step 0 agent selection**: `commands/workflow-next.md` and `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` now document mandatory "Startup Step 0 - Agent Issue Selection" where agents inspect roadmap and pass `KAOLA_TARGET_ISSUE` before calling startup. Router passes `--target-issue` to both `pick-next` and `startup`.
- **Skill parity**: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` mirrors agent selection step for Codex.
- **Contract validators**: `scripts/validate-kaola-workflow-contracts.js` and `scripts/validate-workflow-contracts.js` updated to assert explicit-target behavior in command files and scripts.
- **Integration tests (Epic Cases 14A–14E, 8M, 14a, 14b, 15A, 17A)**: Updated existing test suite to exercise explicit-target claiming; removed dead `runStartupClaimFirstAvailable` code; new tests verify refusal on auto-pick attempts.

## [3.5.0] — 2026-05-18

### Added — Fast-Path Workflow + Phantom Advisor Hook (issue #41)

- **`kaola-workflow-fast.md` command**: NEW single-pass workflow for small, well-scoped issues. Executes Plan+Execute+Review in one phase, writing `fast-summary.md` instead of full 6-phase artifacts. Requires ≤2 closely related files; escalates to full workflow automatically on scope growth (multi-file groups, security concerns, dependencies, new packages). Enable with `KAOLA_PATH=fast /workflow-next`.
- **`analyzeIssue()` helper** in `kaola-workflow-claim.js`: Classifies GitHub issues by top-tier labels (priority:critical, priority:highest, priority:p0, urgent, sev-0, sev-1). Used by startup receipt to populate issue-level metadata.
- **`computeRecovery()` helper** in `kaola-workflow-claim.js`: Three-tier recovery suggestion logic — returns `advance_project` if skipped issues exist and none are blocked; `consult_advisor` if any are blocked; `prompt_user` otherwise. Guides user on no-unclaimed-work case.
- **Startup receipt new fields**: `workflow_path: fast|full` (mirrors `KAOLA_PATH` env var or reads from owned project state); `recovery` field guides user when `claim: "none"` (no actionable work).
- **`kaola-workflow-phantom-advisor.sh` hook** — NEW PostToolUse hook blocking advisor citations in kaola-workflow project artifacts without backing `.cache/advisor-*.md` files. Prevents phantom advisor claims in phase artifacts. Registered in `hooks/hooks.json`.
- **`isSafeName()` guard**: `kaola-workflow-claim.js` validates project names in `ownedActiveProject()` to prevent path traversal on session state lookups.
- **Contract validators**: Updated `scripts/validate-workflow-contracts.js` and `scripts/validate-kaola-workflow-contracts.js` to assert fast-path command structure, phantom-advisor hook registration, and startup receipt field presence.

## [3.4.0] — 2026-05-17

### Fixed — Worktree-Native Router Follow-ups: STARTUP_OUT Guard + cmdPickNext Hardening (issue #40)

- **CRITICAL**: Router `STARTUP_OUT` overwrite guard — `commands/workflow-next.md` and `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` now wrap the `startup` call in `[ -z "${STARTUP_OUT:-}" ]` guard. When `KAOLA_WORKTREE_NATIVE=1` and `pick-next` succeeds, the router no longer discards the result by running a second claim cycle.
- **HIGH - cmdPickNext session enforcement**: Added `enforcePlatformSessionOrExit` call in `cmdPickNext` (guarded by `KAOLA_KERNEL_SESSION_SKIP`), matching the pattern used in `cmdStartup` and `cmdClaim`. Ensures kernel-derived session identity is validated before picking the next issue.
- **HIGH - cmdPickNext runtime validation**: Added `assert(!args.runtime || ['claude', 'codex'].includes(args.runtime))` to reject invalid `--runtime` values instead of silently accepting them.
- **HIGH - cmdWorktreeFinalize archive safety**: Wrapped `archiveProjectDir` rename call in try/catch. Rename failures (cross-device, permission error) now surface as `{skipped: 'archive-failed'}` JSON output instead of throwing unhandled exception and leaving partially-finalized state.
- **HIGH - cmdWorktreeFinalize session ownership check**: Added optional ownership validation — when `--session <id>` is provided, rejects finalization if the project lock is owned by a different session. Backward compatible when `--session` is omitted.
- **Helper extraction**: `selectFirstClaimable` helper extracted to reduce classifier integration code duplication in `cmdPickNext` startup and bootstrap startup paths.
- **Helper refactoring**: `scanPhaseArtifacts` state-file scanning consolidated into a lookup-table-based pattern for improved readability when determining current phase from artifacts.
- **Plugin mirror**: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` updated to byte-identical copy of root `scripts/kaola-workflow-claim.js`.
- **Integration tests (Cases 17L–17N)**:
  - **17L**: `verify-startup` authorization check after `pick-next` succeeds with owned project
  - **17M**: `pick-next` with explicit `--session` argument; ownership verified on subsequent finalize
  - **17N**: `sweep` garbage-collects expired `pick-next` worktree lock (24h+ stale)
- **Contract validators**: `scripts/validate-workflow-contracts.js` and `scripts/validate-kaola-workflow-contracts.js` updated with new assertions for STARTUP_OUT guard and cmdPickNext patterns.

### Fixed — Classifier and Ticker Bugs: Host-Project Paths and Orphaned Ticker (issue #39)

- **Bug 1 (host-project path classification)**: `kaola-workflow-classifier.js` replaced hardcoded `FILE_PATH_REGEX`, `AREA_PATH_REGEX`, and the `COARSE_AREAS` allowlist with generalized patterns that extract any path with `/` separators. Host projects can now have paths like `src/foo.ts` classified and overlap-checked correctly. Previously the classifier would not extract these paths and would incorrectly return conservative-red for host projects with no explicit metadata.
- **Bug 2 (archived project crash guard)**: Added `fs.existsSync()` check in `scanClaimedOverlap()` lock loop so lock files referencing archived or deleted project directories are safely skipped. Previously, missing `kaola-workflow/{project}/` directories would cause phase-artifact reads to silently fail and trigger false conservative-red classifications.
- **Bug 3 (orphaned ticker self-termination)**: Added orphan-exit guard in `cmdTicker()` — if `walkToClaudePid()` returns null at startup (ticker spawned via nohup/disown without Claude ancestor), the process logs `"ticker: no Claude ancestor at startup; orphaned, exiting"` to stderr, removes its PID file, and exits cleanly. The phase wrapper auto-respawns the ticker on next invocation if needed.
- **Test coverage (Cases 6H–6J)**:
  - **6H**: Host project with exact file-path overlap correctly yields `red` verdict
  - **6I**: Ghost lock with missing `projectDir` on disk is safely skipped; candidate with no path info yields `green`
  - **6J**: Orphaned ticker exits within 1500ms, removes PID file, and logs orphan-exit message to stderr
- **Plugin mirrors**: `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` and `kaola-workflow-claim.js` updated to byte-identical copies of root scripts.

### Fixed — Worktree-Native Follow-Ups: COORD_ROOT fix + quality polish (issue #38)

- **Phase4 COORD_ROOT fix**: `commands/kaola-workflow-phase4.md` line 63 replaced `git rev-parse --show-toplevel` with `git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}'` to correctly resolve the main repository root when Phase 4 is executed from inside a linked worktree. Previously COORD_ROOT would resolve to the linked worktree instead of the actual repo root, breaking coordination state discovery.
- **Behavior test (Case 17K)**: `scripts/simulate-workflow-walkthrough.js` added Case 17K that executes the one-liner from inside the issue worktree and asserts COORD_ROOT equals the main repo root.
- **Failure-path tests (Cases 17G-17J)**: Added test coverage for resume no-context (17G), finalize on nonexistent worktree (17H), finalize with staged dirty files (17I), and finalize advances HEAD (17J). Fixed finally-block `kwDir` derivation from `epic17Tmp + '.kw'` to `path.dirname(pick17a.worktree_path)`.
- **Contract validator hardening**: `scripts/validate-workflow-contracts.js` added `assertIncludes('commands/kaola-workflow-phase4.md', "git worktree list --porcelain")` to catch regressions; replaced bare string dispatch checks with exact `if (sub === 'pick-next')` pattern matchers; added plugin mirror parity block validating all 4 `cmd*` function names and 3 dispatcher strings exist in both `scripts/` and `plugins/` files.
- **`resume` subcommand field type**: `kaola-workflow-claim.js` `cmdResume` now emits `issue` as a number instead of a string, matching the lock file schema where issue is stored as an integer.
- **Code quality refactoring** (`MEDIUM-1/2/3`, `LOW-1/2/4`):
  - Extracted 6 helpers in `kaola-workflow-claim.js` to bring 3 oversized `cmd*` functions under 50 lines (MEDIUM-1)
  - Added stderr logging on `provisionWorktree` failure to improve failure diagnostics (MEDIUM-2)
  - Anchored `refs/heads/` regex in `worktree-status` subcommand to prevent partial branch name matches (LOW-1)
  - Replaced 7-arm if/else chain in phase-artifact scanning with a lookup table for clarity (LOW-2)
  - Reformatted `module.exports` block and exported `findMainWorktree` helper (LOW-4)
- **Plugin mirror**: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` updated to byte-identical copy of root `scripts/kaola-workflow-claim.js`.

### Added — Worktree-Native Subcommands (issue #37)

- Added four new subcommands to `scripts/kaola-workflow-claim.js` behind the `KAOLA_WORKTREE_NATIVE=1` environment flag. No existing subcommands or function bodies were modified.
- **`pick-next`**: Scans local branches and (online) `git ls-remote` to find unclaimed issues. Calls `provisionWorktree()` for the first unclaimed candidate; retries on race loss. Sets `workflow:in-progress` label on the claimed issue (online only). Emits `{verdict:'acquired', issue, project, branch, worktree_path, session, runtime, sink}` or `{verdict:'none', reason:'no-unclaimed-issues'}`.
- **`resume`**: Reads `git worktree list --porcelain` to locate the main worktree, then scans phase artifacts to determine the current phase and emit the next slash command. Emits `{resumed:true, issue, project, branch, main_worktree, current_phase, next_command}` or `{resumed:false}`.
- **`worktree-status`**: Parses `git worktree list --porcelain`, filters to `workflow/issue-*` branches, and hydrates each entry with GitHub issue metadata (online). Emits a JSON array of `{worktree_path, branch, head, issue, issue_data}`.
- **`worktree-finalize`**: Derives the issue worktree path via `worktreePathFor(root, project)` (no lock file needed). Dirty-checks only `kaola-workflow/{project}/` in the issue worktree. Copies phase artifacts from main worktree to issue worktree and commits. Emits `{verdict:'finalized', project, worktree_path, branch, session}`.
- `commands/workflow-next.md`: Added `KAOLA_WORKTREE_NATIVE` guard in Startup Step 0 — when set to `1`, routes to `pick-next` and exits before the legacy `startup` path runs.
- `commands/kaola-workflow-phase4.md`: Added "Worktree Discovery" block that resolves `ACTIVE_WORKTREE_PATH` to the issue worktree path when `KAOLA_WORKTREE_NATIVE=1`, falling back to `$(pwd)` for legacy sessions.
- Contract validator updated with 10 new `assertIncludes` checks covering all new subcommand names and the two new command-file strings.
- Integration test suite updated with Epic Case 17 (sub-cases 17A–17F) covering the full worktree-native flow end-to-end.
- Plugin walkthrough updated with Case 5l covering `pick-next` + `worktree-status` round-trip.

### Fixed — Script Resolver Simplification + Drift Guard (issue #36)

- Removed the fragile `find ~/.claude/plugins/cache ~/.claude/plugins/marketplaces -path "*/scripts/<n>" | sort | tail -n 1` fallback from `kaola_script()` in every `commands/*.md` file (16 occurrences across 8 files). ASCII-lexicographic sort was not version-aware and could pick the wrong cached plugin version with no diagnostics.
- `kaola_script()` resolver is now a clean 3-step chain: `${CLAUDE_PLUGIN_ROOT}/scripts/<n>` (marketplace) → `$HOME/.claude/kaola-workflow/scripts/<n>` (manual `install.sh`) → `./scripts/<n>` (dev checkout). Marketplace installs hit step 1 every time; `install.sh` users hit step 2; the cache-walking fallback is gone.
- New `scripts/validate-script-sync.js` enforces byte-identity between `scripts/` and `plugins/kaola-workflow/scripts/` for the 7 common scripts (claim, classifier, repair-state, roadmap, sink-merge, sink-pr, validate-workflow-contracts). Tree-specific files (compact-context, session-env, simulate-*, install-codex-agent-profiles) are excluded from the allowlist by design. Drift now fails CI immediately instead of after runtime breakage.
- Wired the sync validator into both `npm run test:kaola-workflow:claude` and `npm run test:kaola-workflow:codex` legs.
- `install.sh` header and README "Automation Scripts" / "Manual command install" sections clarify that marketplace users don't need to run `install.sh` — the plugin runtime handles script resolution via `${CLAUDE_PLUGIN_ROOT}`. The installer remains supported for air-gapped, source-checkout, and manual-command-dir users.

### Fixed — Test Suite Restoration (follow-up to #36)

- `scripts/validate-workflow-contracts.js`: updated 4 stale assertions. The phase 6 commit gate moved to `git -C "$ACTIVE_WORKTREE_PATH" commit -m ...` in issue #32, and issue #36 removed the `$HOME/.claude/plugins/cache` fragile fallback — both changes landed without corresponding validator updates. Validator now asserts the new 3-step resolver chain explicitly and bans the old fragile fallback to prevent regression.
- `scripts/validate-kaola-workflow-contracts.js`: same `git -C` substring loosening for `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`.
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`: commit 308f747 inadvertently clobbered the 1134-line Codex-specific simulate (focused on claim runtime tagging, parallel bootstrap, and roadmap sync) with the 4719-line Claude variant (which depends on the Claude-only `compact-context.js` hook). Restored the Codex-specific file and updated 23 coord-state path references (`.locks/.sessions/.tickers/.runtime` moved into `.git/` under issue #30's worktree-per-session isolation; `.roadmap` stayed at root). Both `npm run test:kaola-workflow:claude` and `npm run test:kaola-workflow:codex` now go green end-to-end.
- `scripts/validate-script-sync.js`: expanded allowlist-exclusion comment to spell out *why* `simulate-*` files must never be synced — the two test different surfaces, and a future "sync everything" pass must not clobber the Codex variant again.

### Added — Startup Priority Label Ranking (issue #35)

- `startup` now ranks open issues by P0/P1/P2/P3 GitHub labels before claiming (P0 highest, tier 0). Issues without priority labels are treated as tier 4 (lowest). Startup receipt includes a `ranking` array listing `{ issue, tier, priority_label, override_label }` for every candidate issue.
- Two-layer priority config: global `~/.config/kaola-workflow/config.json` and project-local `<repo>/kaola-workflow/config.json` may both supply `priority_top_tier_labels` arrays; the union of both arrays forces any matching label to tier 0, overriding P-label ranking. `priority_label` is `null` when an override label wins.
- Sort key order: `workflow:queued` label always wins first; then priority tier (0=P0 through 3=P3, 4=unlabeled); then issue number ascending.

### Fixed — Phase 6 Archive Automation And Orphaned Project GC (issue #34)

Three archive-related bugs fixed with new `cmdFinalize` subcommand and improved sweep second pass:
- **Bug 1 (non-atomic archive)**: Phase 6 archive is now performed by `cmdFinalize` subcommand (`node kaola-workflow-claim.js finalize --project X --session Y`) which atomically writes `status: closed` + `step: complete` to `workflow-state.md` before renaming the project directory to `kaola-workflow/archive/{project}/` via `fs.renameSync()`. The rename is then detected by `git add` during the Phase 6 commit gate. Previously archive was prose-only with no automation.
- **Bug 2 (missing status:closed)**: `cmdFinalize` ensures archived directories are clearly marked with `status: closed` before the rename. Previously no code wrote `status: closed` — only `status: released` (from `releaseSession`) existed, leaving archived dirs without a termination marker.
- **Bug 3 (no GC for crashed claims)**: `cmdSweep` second pass now garbage-collects orphaned active directories with: `status: active` + no lock file + expired >30 minutes + no phase artifacts. Orphaned dirs are archived with `status: abandoned`. Prevents stale project directories from accumulating when a session crashes.
- **Phase 6 Step 8b new command**: Added `## Step 8b - Finalize (Archive + Status Close)` between Step 8a (artifact mirror) and Step 8 (commit gate). Must run in the linked worktree context so the rename is detected by git.

### Tests (issue #34)

- **Test 34-A**: `cmdFinalize` archives project, writes `status: closed` + `step: complete`, idempotent re-invocation returns `{already: true}`, wrong-session call rejects with exit code 3
- **Test 34-B**: `cmdSweep` second pass GCs orphaned active dir (expired >30min + no artifacts) as `status: abandoned`, preserves live leases (unexpired), preserves in-flight work (has phase artifacts)
- **Test 34-C**: Structural validation — both `commands/kaola-workflow-phase6.md` and `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` contain `finalize` invocation, `## Step 8b` marker, and correct ordering before commit gate

### Fixed — Phase 6 CWD Restoration After Worktree Removal (issue #33)

Phase 6 sink scripts now guarantee that the parent shell CWD is restored to the main repository root after worktree removal, preventing dangling directory references when a session is invoked from within a git worktree:
- **`sink-merge.js` pre-chdir**: Added `mainRootFromCoord(coordRoot)` helper and `process.chdir(mainRootFromCoord(coordRoot))` call BEFORE `removeWorktree()` in Step 0 to prevent deferred-removal bugs when the sink script is invoked from inside the worktree being removed
- **`sink-merge.js` exit handler**: Registered `process.on('exit', ...)` handler to guarantee `process.cwd()` equals the main repo root at all exit points (0, 1, 2)
- **Phase 6 Step 9 shell restoration**: Captures `_MAIN_ROOT` via `--git-common-dir` before sink dispatch and restores parent shell CWD with `cd "$_MAIN_ROOT" 2>/dev/null || true` after `esac`
- **Test coverage**: Test 16G-CWD sub-case asserts sink-merge from inside worktree exits 0, removes worktree, and final CWD equals main repo root

### Fixed — Isolation Tree Orchestration-Layer Gaps (issue #32)

Three worktree-per-session isolation gaps have been addressed:
- **Gap 1**: `doc-updater` agent writes to main worktree instead of linked worktree → fixed by injecting `ACTIVE_WORKTREE_PATH` in Phase 6 Step 3, with pre-delegation comment providing the working directory context
- **Gap 2**: Phase 6 commits artifacts from main worktree instead of linked worktree → fixed by adding artifact mirror block (Step 8a) that copies project artifacts back from main worktree to linked worktree before commit, plus using `git -C "$ACTIVE_WORKTREE_PATH"` in the commit gate (Step 8)
- **Gap 3-A**: `spawnSync()` without `cwd:tmp` leaves stray directories in repo root → fixed by adding `cwd: os.tmpdir()` to all sync spawns to isolate temp I/O
- **Gap 3-B**: `cmdSweep` does not sweep synthetic test session locks → fixed by adding `isSyntheticTestSession()` predicate that unconditionally sweeps locks with `session_id` prefix `synthetic-` (test-only sessions never produced by `crypto.randomUUID()`)

### Tests (issue #32)

- **Gap3-B test**: synthetic-session sweep validation ensures test locks are cleaned while real UUID4 sessions with fresh timestamps survive
- **Gap1+2 structural assertions**: both `commands/kaola-workflow-phase6.md` and `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` validated to contain `ACTIVE_WORKTREE_PATH=`, artifact mirror block comment, and `git -C "$ACTIVE_WORKTREE_PATH"` dispatch patterns

### Added — Session Identity Binding (issue #31)

- **Kernel-derived session identity**: Replaces self-asserted `KAOLA_SESSION_ID` with kernel-derived identity using process-tree walking to find Claude ancestor PID
- **O_EXCL identity files**: Session start (`SessionStart` hook) writes identity file at `<coordRoot>/kaola-workflow/.runtime/<claude_pid>.identity` containing session ID, Claude PID, and start time
- **`derive-session` subcommand**: New subcommand on `kaola-workflow-claim.js` walks process tree, reads identity file, validates ancestor is alive with matching start time, and returns derived session ID. Exits code 4 if no Claude ancestor found. Supports `--json` output format.
- **Enforcement mode**: New `KAOLA_ENFORCE_PLATFORM_SESSION=1` environment variable enables enforcement; mutating commands (claim, release, heartbeat, ticker, sweep, bootstrap, can-handoff, handoff, verify-startup, patch-branch, watch-pr) exit code 3 on session mismatch
- **Environment variables**: 
  - `KAOLA_ENFORCE_PLATFORM_SESSION` — Enable enforcement mode
  - `KAOLA_KERNEL_SESSION_SKIP` — Skip kernel derivation and use `KAOLA_SESSION_ID` directly (backward compatibility)
  - `KAOLA_KERNEL_SESSION_FAKE_PID` — TEST ONLY; override walkToClaudePid() return value
  - `KAOLA_COORD_ROOT` — Override coordination root path
- **Pre-commit hook enhancement**: Hook now calls `derive-session` instead of comparing env vars. Under `KAOLA_ENFORCE_PLATFORM_SESSION=1`, blocks commits when `derive-session` returns empty (no Claude ancestor)

### Tests

- **Epic Case 8N**: Session identity binding test suite covering:
  - AC1: Identity file creation and validation via `SessionStart` hook
  - AC2: `derive-session` exits 4 without Claude ancestor
  - AC3: Enforcement exits 3 on SID mismatch
  - AC4-AC15: Process tree walking, start-time validation, file cleanup, audit logging, and command enforcement

## 3.2.0 - 2026-05-16 (Claude Code) / Codex 1.2.0 - 2026-05-16

### Added — Multi-session Worktree-Per-Session Isolation

- **Shared coordination state (coordRoot)**: Lock files, session files, and ticker state are now stored in `<repo>/.git/kaola-workflow/` (discovered via `git rev-parse --git-common-dir`) instead of the worktree-local `<worktree>/kaola-workflow/`. All linked worktrees of the same repository now share the same coordination state, ensuring a session is uniquely bound to an issue across all worktrees on the same machine or across machines accessing the same repository.
- **Backwards-compatible migration**: Added `migrateLegacyCoordState()` helper that runs on every startup. Idempotently moves lock, session, and ticker files from the legacy `<worktree>/kaola-workflow/` location to coordRoot. No manual migration needed.
- **Per-session git worktrees**: At claim time, `cmdClaim()` now auto-provisions a git worktree at `<repo-parent>/<repo-name>.kw/<project>/` via `provisionWorktree()`. The worktree path is stored in the lock file as `worktree_path`.
- **New environment variable**: `KAOLA_WORKTREE_PATH` — set by the claim transaction after worktree provisioning. All workflow phases that run in a worktree should check and use this env var (the 6 SKILL.md files include a Session Heartbeat block that changes directory: `cd "$KAOLA_WORKTREE_PATH" 2>/dev/null || true`).
- **Worktree lifecycle management**: 
  - `removeWorktree()` removes worktree on PR MERGED, sink-merge success, or explicit release
  - Dirty worktrees are renamed to `.abandoned-<ISO-timestamp>` for manual cleanup
  - Removal of own current working directory is deferred to `.pending-removal/<project>.json`
  - `drainPendingRemovals()` processes deferred removals during startup/sweep
  - `cmdWatchPr()` calls `removeWorktree()` on MERGED and CLOSED
  - `sink-merge.js` calls `removeWorktree()` before branch deletion
  - `cmdSweep()` runs `drainPendingRemovals()` + `git worktree prune`
- **Pre-commit hook update**: Hook now resolves lock files from coordRoot via `COORD_ROOT=$(git rev-parse --git-common-dir)`.

### Documentation

- **Multi-Session Support expansion**: README.md now includes subsections for Shared Coordination State, Per-Session Git Worktrees, and backwards-compatible migration guidance.

### Tests

- **Epic Case 15**: Worktree provisioning on claim; path stored in lock file; `KAOLA_WORKTREE_PATH` exported correctly.
- **Epic Case 16**: Worktree removal on PR MERGED and sink-merge success; dirty worktree renamed to `.abandoned-<ISO>`; deferred removal processing in sweep.

## 3.1.10 - 2026-05-16 (Claude Code) / Codex 1.1.10 - 2026-05-16

### Fixed

- **Branch name duplication eliminated**: `projectNameForIssue` no longer falls back silently when reading project-name files; ENOENT errors are caught and handled explicitly, while other errors emit a stderr warning. Sink branch names now use `buildSinkBranchName` helper to prevent `workflow/issue-N-issue-N` duplication, guaranteeing exactly one issue number in the constructed branch name.
- **`field()` regex prevents cross-line bleed**: updated regex from `\s*` to `[ \t]*` to prevent field values containing blank lines from bleeding into subsequent sections when parsing `.roadmap/issue-{N}.md` metadata.
- **`projectNameForIssue` error transparency**: errors other than ENOENT now emit a diagnostic message to stderr, improving debuggability when file-read failures occur during startup.

### Added

- **`project-name` subcommand** (`kaola-workflow-roadmap.js`): new subcommand reads `.roadmap/issue-{N}.md` and prints the project-name field to stdout for Phase 6 branch-name construction. Accepts `--issue <N>` flag.
- **`buildSinkBranchName` helper** (`kaola-workflow-claim.js`): centralized branch-name construction function prevents duplication logic scattered across claim/Phase 6 code paths. Takes issue number and project slug; returns safely formatted `workflow/issue-N` or `workflow/issue-N-<slug>` branch name.
- **`pickFirstActionableIssue` DRY collapse**: removed redundant subprocess pattern; inlined the classi­fier and claim logic to reduce code surface area and improve maintainability during multi-session bootstrap.

### Tests

- **Epic Case 5G**: `project-name` subcommand correctly reads and outputs project name from `.roadmap/issue-{N}.md` (4 sub-assertions: file exists, field parsed, no duplication, slug fallback).
- **Epic Case 5H**: `buildSinkBranchName` utility produces well-formed branch names without duplication (4 sub-assertions: simple issue, with slug, XSS prevention, edge-case handling).
- **Regression 7G**: multi-session bootstrap branch-naming consistency after `pickFirstActionableIssue` collapse.
- **Regression 7A**: field-value blank-line handling in roadmap metadata parsing does not corrupt subsequent sections.

## 3.1.9 - 2026-05-16 (Claude Code) / Codex 1.1.9 - 2026-05-16

### Fixed

- **Closed `claim:"none"` silent-takeover escape**: `handoff` and `can-handoff` no longer exempt `claim:"none"` startup receipts from the receipt-level blocker, so a session that never acquired or owned the project must use `--force-live-takeover` for any recovery, even when the previous owner looks dead (matches issue #25 spec). Previously a fresh `claim:"none"` session could quietly take over a project whose lock had expired and whose owner had no liveness evidence.
- **Liveness check now matches Claude Code's real project-dir encoding**: `claudeProjectDirForRoot` replaces `.` in addition to `/` and `\\`, so the JSONL lookup finds owners whose repo path contains a `.` segment (e.g. `.claude-worktrees/...`, `.git-worktrees/...`). Previously the lookup pointed at a non-existent directory for dotted paths, and the JSONL liveness evidence was always empty.

### Tests

- Added root regression 8L: `claim:"none"` + dead-looking owner → default `can-handoff`/`handoff` rejected with `startup-receipt` blocker; `--force-live-takeover` still succeeds and updates the lease.
- Added root regression 8M: live owner JSONL placed under the real Claude-encoded dotted-path directory must be detected, with `can-handoff` reporting `claude-session-jsonl` evidence.
- Mirrored both regressions to packaged Codex simulation as Case 5i and Case 5j.

## 3.1.8 - 2026-05-16 (Claude Code) / Codex 1.1.8 - 2026-05-16

### Fixed

- **Guarded handoff recovery**: `kaola-workflow-claim.js handoff` now rejects normal takeover when the requested session already has a startup receipt for another project, the previous owner has a live local Claude session JSONL, the lock is unexpired, the heartbeat is recent, or the ticker PID is alive. Successful handoff writes a new owned startup receipt for the recovering session.
- **Startup receipt enforcement**: added `verify-startup` and wired all phase commands and Codex phase skills to fail before phase work when a session has `claim: "none"` or a receipt for a different project.
- **Router no-work stop**: `/workflow-next` and Codex `kaola-workflow-next` now stop on `claim: "none"` instead of inferring recovery from skipped already-claimed work.

### Tests

- Added root and packaged Codex simulations for guarded `can-handoff`, blocked default handoff, explicit forced takeover, receipt-project mismatch rejection, and `claim:none` verifier rejection.

## 3.1.7 - 2026-05-15 (Claude Code) / Codex 1.1.7 - 2026-05-15

### Fixed

- **Mandatory startup transaction**: added `kaola-workflow-claim.js startup` so workflow startup is a single script-level transaction that syncs issues, refreshes the roadmap mirror, sweeps stale leases, watches PR leases, detects owned work, classifies candidates, claims the first actionable issue, writes a startup receipt, and emits structured JSON.
- **Skipped-bootstrap hardening**: `/workflow-next`, Codex `kaola-workflow-next`, and all phase commands/skills now require a startup receipt guard for issue-backed work.
- **Issue-to-roadmap sync before selection**: online startup now imports open GitHub issues into `.roadmap` and regenerates `ROADMAP.md` before candidate selection while preserving conservative offline behavior.

### Tests

- Added root and packaged Codex walkthrough coverage for startup receipt writing, issue-ahead-of-roadmap sync, claimed-issue skipping, dependency-blocked candidate skipping, and next actionable issue selection.

## 3.1.6 - 2026-05-15 (Claude Code) / Codex 1.1.6 - 2026-05-15

### Fixed

- **Claude Code marketplace script resolution**: command snippets now resolve support scripts from `CLAUDE_PLUGIN_ROOT`, the manual support directory, the repo checkout, Claude plugin cache, or the marketplace checkout. This prevents marketplace installs from falling back only to `~/.claude/kaola-workflow/scripts/`.
- **Manual install verification**: `install.sh` now verifies copied slash commands, support scripts, and hooks after installation and fails with a concrete missing-file message when any required file is absent.

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
