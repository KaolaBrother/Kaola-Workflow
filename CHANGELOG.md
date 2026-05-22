# Changelog

## [Unreleased]

### Added

- **Safe cleanup guidance and command for stale workflow worktrees and branches** (issue #157): New `stale-worktree-cleanup` subcommand in `scripts/kaola-workflow-claim.js` (GitHub), `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (GitLab), and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (Gitea) provides safe, reversible removal of worktrees and branches detected by `stale-worktree-check`. Subcommand runs in dry-run mode by default; `--execute` performs actual removal. For dirty worktrees, offers three strategies: `--archive` (stash changes, recoverable via `git stash list`), `--export` (write patch to `kaola-workflow/archive/exports/`), `--force` (discard). `--keep-branch` removes the worktree while preserving the branch (for open PRs). Includes full test coverage with 8 sub-cases per forge edition (test-gitlab/gitea-workflow-scripts.js). Documentation added to README.md subcommands table and docs/api.md stale-worktree detection section.

### Fixed

- **Publish release tag and validate CHANGELOG presence** (issue #156): Added CHANGELOG drift guard (`assert(read('CHANGELOG.md').includes('## [' + rootVersion + ']')...)`) to `scripts/validate-workflow-contracts.js` and mirrored copy at `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`. The validator now fails at startup if CHANGELOG.md lacks a heading matching the current `package.json` version, preventing accidental releases with missing or stale CHANGELOG sections. Updated README.md release checklist with precise tag format (`kaola-workflow--v<X.Y.Z>` double-dash), single-tag push guidance (`git push origin kaola-workflow--v<X.Y.Z>`), and edition policy (GitHub required, GitLab optional, Gitea none). Published `kaola-workflow--v3.13.0` tag to origin/main.

- **Fail-closed when remote issue validation is unavailable** (issue #155): Startup and classifier now return a typed `target_unavailable` refusal when `gh`/`glab`/`tea` issue fetch fails outside `KAOLA_WORKFLOW_OFFLINE=1`, instead of silently returning `green` and claiming potentially closed or blocked issues. All three forge editions (GitHub, GitLab, Gitea) get the same behavior. A new `probeIssueState` helper in each forge's active-folders module distinguishes "remote unavailable" from "not closed" in the `claimProject` path. Existing `KAOLA_WORKFLOW_OFFLINE=1` behavior is unchanged. Regression tests added for all three forges.

- **Preserve untracked files in `stale-worktree-cleanup --export`** (issue #159): `exportWorktreeDiff()` previously used `git diff HEAD` (tracked changes only), silently losing untracked files when a worktree was dirty solely from untracked files. The function now enumerates untracked files via `git ls-files -z --others --exclude-standard` and copies them to a sibling `issue-N-{timestamp}-untracked/` sidecar directory alongside the patch file. Symlinks are skipped to prevent secret leakage into the tracked exports directory. Return type changed from `string` to `string[]` (array of artifact paths — patch file always first, sidecar directory appended when untracked files exist); callers spread with `push(...p)`. Applied to all four editions: GitHub (`scripts/kaola-workflow-claim.js`), Codex plugin (`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`), GitLab (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`), and Gitea (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`). Regression tests (sc9: untracked-only, sc10: mixed) added to all three forge test suites.

## [3.13.0] — 2026-05-22

### Breaking / Upgrade Notes

- **Worktree provisioning is now opt-in.** All three forge editions (GitHub, GitLab, Gitea) previously provisioned a sibling worktree unconditionally when online with a git history. This matched the buggy implementation but not the documented contract. The claim scripts now respect `KAOLA_WORKTREE_NATIVE` as documented: provisioning is gated on `KAOLA_WORKTREE_NATIVE=1`. **Set `KAOLA_WORKTREE_NATIVE=1` in your environment to preserve prior sibling-worktree behavior.**

### Added

- **Inherit-decouple: make every subagent dispatch render a model badge** (issue #153): The installer now rewrites every installed agent frontmatter `model:` field to `inherit` instead of the concrete `sonnet|opus|haiku` value. Command files continue to render concrete `model="{BUILD_ERROR_RESOLVER_MODEL}"` and `model="{TDD_GUIDE_MODEL}"` literals into dispatched `Agent(...)` calls during install (unchanged). With `inherit` as the baseline frontmatter, every concrete model in a dispatch becomes an override → Claude Code always renders the model badge. Cost profiles (common vs higher) are preserved; each subagent runs on its configured model even though the frontmatter is now abstract. **A reinstall (`./install.sh --forge=github|gitlab|gitea`) + Claude Code restart is required** for the badge to render. A new contract guard (`assertEveryDispatchHasModel`) was added to all three forge validators (GitHub, GitLab, Gitea) to ensure no command template can silently drop a `model=` line; under `inherit`, a dropped `model=` would silently run the agent on the parent/Opus model, a critical regression.

- **Routed-fix model badge dispatch** (issue #152): Phase 4, 5, and 6 command files now include explicit Agent spawn blocks with `model="{BUILD_ERROR_RESOLVER_MODEL}"` and `model="{TDD_GUIDE_MODEL}"` literals for all routed-fix delegations (`build-error-resolver` in Phases 4–6; `tdd-guide` in Phases 5–6). The installer renders frontmatter model placeholders into concrete `model="sonnet"` (or equivalent) values during install, so spawned agents display the built-in model badge in Claude Code. Updated all 9 phase command files (3 forge editions × 3 phases) and added 24 regression assertions in `scripts/validate-workflow-contracts.js` plus 4 render assertions in `scripts/test-install-model-rendering.js`.

- **GitLab and Gitea `stale-worktree-check` parity** (issue #148): Added `stale-worktree-check` subcommand to both `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`. Both versions detect stale worktrees and branches using forge-specific branch prefixes (`workflow/gitlab-issue-*` / `workflow/gitea-issue-*`). Includes 6 test cases per edition in `test-gitlab-workflow-scripts.js` and `test-gitea-workflow-scripts.js` covering clean worktrees, dirty worktrees, missing worktrees, branches without worktrees, active filtering, and offline mode. This brings GitLab and Gitea editions to parity with the GitHub `stale-worktree-check` from issue #138.

### Fixed

- **Installer upgrade path now applies the inherit-rewrite to existing installs** (issue #154): Re-running `install.sh` over a pre-#153 install was a silent no-op — the `cmp -s "$source_file" "$dest"` fast path in `install_agent_files()` matched (a pre-#153 `dest` is a verbatim copy of the still-unchanged concrete source) and short-circuited before the `model: inherit` rewrite, so the #153 badge fix never reached anyone who already had agents installed. The byte-equal-to-source check is now treated as "safe to rewrite" rather than "already in desired state": a pristine or recorded-managed agent is rewritten to `inherit`, while a genuinely user-modified agent is still skipped. Added `scripts/test-install-upgrade-rewrite.js`, which seeds a pre-#153 install (concrete frontmatter + concrete-hash manifest) and asserts the upgrade rewrites to `inherit`, preserves user-modified files, and is idempotent.

- **Forge-neutral documentation: README operational scripts table, active-folder coordination, subcommand table, PR sink section, and roadmap section** (issue #151): Updated README.md to use forge-neutral prose where behavior is shared across GitHub, GitLab, and Gitea editions, and added script triads listing all three forge-specific command equivalents (e.g., `kaola-workflow-claim.js` / `kaola-gitlab-workflow-claim.js` / `kaola-gitea-workflow-claim.js`). Corrected Gitea plugin command wording in `plugins/kaola-workflow-gitea/commands/workflow-next.md` line 154 from "MRs" to "PRs". This makes the documentation more accessible to new users working with any forge edition.

- **Priority label sorting parity for GitLab and Gitea** (issue #150): Ported `readPriorityConfig(root)` and `priorityTier(issue, topTierLabels)` helpers to both `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`. Updated `listOpenIssues()` to accept a `root` parameter and apply priority-tier sorting (highest tier first, then by issue number ascending) before returning. This brings GitLab and Gitea editions to parity with the GitHub implementation of `priority_top_tier_labels` config. Users who configured priority labels now see consistent cross-forge issue ordering. Added unit tests and discriminating priority-sort tests to both `test-gitlab-workflow-scripts.js` and `test-gitea-workflow-scripts.js`.

- **GitLab and Gitea roadmap closure drift (follow-up to issue #136)** (issue #147): Added `regenerateRoadmap(root)` export to both `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js`. Updated `archiveProjectDir()` in both forge claim scripts to delete `.roadmap/issue-N.md` and call `regenerateRoadmap()` whenever a project is archived as `closed` (finalize, watch-pr merged). This brings GitLab and Gitea editions to parity with the GitHub fix from issue #136. Updated tests in `test-gitlab-workflow-scripts.js` and `test-gitea-workflow-scripts.js` to cover roadmap cleanup on archive.

- **Codex pack documentation clarification: AGENTS.md entrypoint redirects to CLAUDE.md** (issue #146): Updated README.md Codex packs section to reframe AGENTS.md and CLAUDE.md relationship. The new text clarifies that `AGENTS.md` is the Codex entrypoint that redirects to `CLAUDE.md` as the single canonical source of repo guidance. Previously the text framed AGENTS.md as an alternative to CLAUDE.md; this wording correction establishes the explicit delegation pattern now standard across all forge editions.

- **README release version table drift guard** (issue #145): Added drift-detection assertions in `scripts/validate-workflow-contracts.js` to verify that README.md "Release versioning" table version strings match `package.json` version for all three editions (GitHub, GitLab, Gitea). The validator now fails fast if version strings fall out of sync. Updated 3 stale version entries from `3.10.0` to `3.12.0` in the release versioning table.

- **Gitea plugin uninstall guidance in Claude install conflict messaging** (issue #144): Updated `install.sh` conflict remediation block and `README.md` Claude Code installation section to include `claude plugin uninstall kaola-workflow-gitea@kaolabrother-kaola-workflow` command alongside existing GitHub and GitLab edition uninstall guidance. Users encountering plugin conflicts now have clear instructions for all three forge editions.

## [3.12.0] — 2026-05-21

### Added

- **`stale-worktree-check` subcommand** (issue #138): `node scripts/kaola-workflow-claim.js stale-worktree-check` reports stale workflow worktrees and local `workflow/issue-*` branches. A worktree or branch is stale when its issue is closed (GitHub API) or its project folder is locally archived, and it is not in the active folder set. Reports per-worktree dirty/clean/missing state. When `KAOLA_WORKFLOW_OFFLINE=1`, GitHub API calls are skipped but archive-detected stale entries are still reported.

- **Unpushed-commits guard for merge sink** (issue #137): `kaola-workflow-sink-merge.js` (GitHub, GitLab, Gitea editions) now blocks the merge sink when the feature branch has unpushed commits ahead of its upstream tracking ref. Reports branch name, upstream ref, ahead count, and up to 5 representative commit titles. Also blocks when no upstream tracking ref is set, with a `git push -u origin <branch>` remediation hint. Skipped when `KAOLA_WORKFLOW_OFFLINE=1`.

- **Claude Code subagent model badge dispatch** (issue #141): slash commands now render each installed Kaola agent's frontmatter model into concrete `model="..."` lines during install, so Claude Code can show the built-in model badge for spawned subagents. The earlier managed `subagentStatusLine` path was removed because it targeted the wrong UI surface; installers clean up legacy managed status-line settings while preserving user-owned ones.

- **`validate-remote` subcommand for roadmap script** (issue #136): `node scripts/kaola-workflow-roadmap.js validate-remote` checks each `.roadmap/issue-N.md` with `status: open` against GitHub and reports any that are already closed. Exits 1 on drift; prints `skipped: offline` when `KAOLA_WORKFLOW_OFFLINE=1`.

### Fixed

- **Reliable inline subagent model badge** (issue #142, follow-up to #141): Phase and fast slash commands now present each subagent dispatch with the installer-rendered `model="..."` literal plus a per-spawn imperative directive (`You MUST pass model="..."; never omit it`). The `## Agent Model Badge Contract` bash-resolution helper (`kaola_agent_model`) and the "if the resolved value is empty, omit `model=`" escape hatch were removed — that escape hatch was the failure mode: the orchestrator would resolve an empty value and drop `model=`, silently losing the badge. Empirically, Claude Code's inline model badge renders only when the `Agent` call passes an explicit `model=` (agent frontmatter alone does not render it, and `subagentStatusLine` is a separate UI surface). Install-time literal rendering from agent frontmatter is unchanged, so a subagent still runs on its correct model even if a badge is ever missed. Contract validators updated to assert the new shape across the GitHub, GitLab, and Gitea editions. Note: if `CLAUDE_CODE_SUBAGENT_MODEL` is set in the environment it takes precedence over the per-call `model=`, so the rendered badge reflects that value instead — this is expected behavior, not a regression.

- **Roadmap closure drift** (issue #136): `archiveProjectDir` now deletes `.roadmap/issue-N.md` and regenerates `ROADMAP.md` whenever a project is archived as `closed` (finalize, watch-pr merged). Released/discarded projects (`abandoned` status) are intentionally excluded — the issue remains open and represents future work.

## [3.11.0] — 2026-05-21

### Added

- **Agent profile system: `--profile=higher` flag for `install.sh`** (issue #140): `install.sh` now accepts `--profile=common|higher` (default `common`). The `higher` profile installs `code-architect`, `code-reviewer`, and `security-reviewer` on Opus instead of Sonnet. Switching profiles in either direction re-installs the correct agent variants.

- **GitLab Claude plugin version contract** (issue #125): `plugins/kaola-workflow-gitlab/.claude-plugin/plugin.json` version bumped from `3.8.1` to `3.10.0` to match root `package.json`. Added `claudePluginJson.version` assertion in `validate-kaola-workflow-gitlab-contracts.js` mirroring the Gitea edition guard; validator now fails fast on version drift.

- **GitLab and Gitea parity tests included in `npm test`** (issue #124): `npm test` now chains all four forge editions (`claude`, `codex`, `gitlab`, `gitea`). The contract guard in `scripts/validate-kaola-workflow-contracts.js` is upgraded from a string-presence check to a structural `parseJson` loop that asserts each edition appears in `pkg.scripts.test`, preventing silent omission in future edits.

- **Gitea forge edition** (`kaola-workflow-gitea`): Full functional parity with the GitHub edition. Install with `./install.sh --forge=gitea`. Requires `tea` CLI ≥ 0.9.2 and Gitea server ≥ 1.17. Forgejo ≥ 1.18 is expected to work via shared API surface but is not explicitly tested. Set `GITEA_SERVER_URL` and `GITEA_TOKEN` environment variables before first use.

- **Gitea sink layer** (`plugins/kaola-workflow-gitea/scripts/`): Completes the Phase 6 sink implementation for the Gitea edition (issue #112). Three new/modified scripts:
  - **`kaola-gitea-workflow-sink-pr.js`**: Creates or finds a Gitea PR for the feature branch, writes `pr_url`, `pr_number`, `full_name`, and `project_html_url` to the workflow state Sink block.
  - **`kaola-gitea-workflow-sink-merge.js`**: Fetches, rebases, FF-merges, pushes, closes the linked issue, and removes the worktree. Reads `full_name` from state with fallback to `discoverProject()`. Exit codes: 0=merged, 2=FF exhausted, 3=merge-impossible (writes `sink-fallback.json`).
  - **`checkRepoSquashEnabled(project, opts)`** added to `kaola-gitea-forge.js`: Verifies `allow_squash_merge !== false` before executing a squash merge. Wired into `mergePullRequest` when `options.squash` is set.
  - **`test-gitea-sinks.js`**: 18-test offline suite covering PR reuse/creation, auto-merge opts, issue close, archive guards, discoverProject fallback, classifyMergeError, and subprocess exit-code contracts.

- **Kaola-Workflow Gitea plugin** (`plugins/kaola-workflow-gitea/`): New fully functional forge-specific plugin for Gitea edition, providing complete Claude Code and Codex integration. Includes:
  - **Forge adapter** (`scripts/kaola-gitea-forge.js`): Gitea-compatible forge operations for issue/PR management, labels, comments, and project discovery via `tea` CLI. Supports `KAOLA_WORKFLOW_OFFLINE=1`. Mirrors the GitLab adapter API surface.
  - **Commands** (`commands/`): 9 markdown command definitions for phases 1–6, fast path, workflow-init, and workflow-next — Gitea-adapted from GitHub/GitLab editions.
  - **Skills** (`skills/`): 9 Codex skill definitions (research, ideation, plan, execute, review, finalize, fast, init, next) with Gitea-specific forge calls.
  - **Agent profiles** (`agents/`): 9 TOML agent configurations (code-explorer, docs-lookup, planner, code-architect, tdd-guide, build-error-resolver, code-reviewer, security-reviewer, doc-updater).
  - **Hooks** (`hooks/`): Pre-commit and phantom-advisor guards plus hook registration manifest, mirroring GitHub/GitLab safeguards.
  - **Config** (`config/agents.toml`): Codex agent registry for managed installation.
  - **Plugin manifests** (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`): Claude Code and Codex registration with version tracking (issue #114).

- **Gitea uninstall support**: `uninstall.sh` now accepts `--forge=gitea` to remove the `~/.claude/kaola-workflow-gitea` directory. Usage string, argument validation, and error messages updated to list `gitea` alongside `github`, `gitlab`, and `all`.

### Fixed

- **`npm test` / walkthrough hang eliminated for GitHub Claude shim path** (issue #135): `runClaimOnline` and `runClaimOnlineLastJson` in `scripts/simulate-workflow-walkthrough.js` now pass `timeout: 60000` to `spawnSync`, converting a potential infinite hang into a clear SIGTERM failure. `classifyIssue` in `scripts/kaola-workflow-claim.js` now passes `timeout: 30000` to its `execFileSync` call so a hung `gh` subprocess cannot block startup indefinitely in production either.

- **GitLab `watch-mr` now short-circuits in offline mode** (issue #134): Added `OFFLINE` constant (`process.env.KAOLA_WORKFLOW_OFFLINE === '1'`) to `kaola-gitlab-workflow-claim.js` and added the same offline short-circuit guard to `cmdWatchMr` present in the GitHub and Gitea baselines. `watch-mr` now returns `{"watched":0,"offline":true}` without calling any forge APIs when offline. Regression test added to `test-gitlab-sinks.js` and contract validator guard added to `validate-kaola-workflow-gitlab-contracts.js`.

- **`install-codex-agent-profiles.js` added to GitLab and Gitea forge plugins; GitLab `plugin_root` bug fixed** (issue #133): Both `plugins/kaola-workflow-gitlab/scripts/` and `plugins/kaola-workflow-gitea/scripts/` now ship a byte-identical copy of `install-codex-agent-profiles.js` with `__dirname`-based plugin root resolution, making each forge self-contained. Fixed the two affected lines in `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md` where `plugin_root` and the `find` path both pointed to `plugins/kaola-workflow` (the GitHub plugin) instead of `plugins/kaola-workflow-gitlab`. Validator guards with negative-lookahead regex added to both forge contract validators. Regression tests added to `test-gitlab-workflow-scripts.js` and `test-gitea-workflow-scripts.js`.

- **GitLab and Gitea `finalize --keep-worktree` now commits archive rename** (issue #132): Both `kaola-gitlab-workflow-claim.js` and `kaola-gitea-workflow-claim.js` `cmdFinalize` now include the `else` block (matching the GitHub baseline) that, when `--keep-worktree` is set and running inside a linked worktree, stages and commits the `kaola-workflow/archive/{project}/` rename so the feature branch HEAD reflects the archived state. Regression tests added to `test-gitlab-sinks.js` and `test-gitea-sinks.js`.

- **`bootstrap` alias added to GitLab and Gitea claim scripts** (issue #130): Both `kaola-gitlab-workflow-claim.js` and `kaola-gitea-workflow-claim.js` now accept `bootstrap` as an alias for `startup`, matching the GitHub baseline. Validator guards added to both forge contract validators to prevent future alias drift.

- **GitLab claim script `watch-mr` listed in usage string** (issue #131): Added `watch-mr` to the usage assertion in `kaola-gitlab-workflow-claim.js` so CLI help/error output matches the implemented subcommands. Added a `assertIncludes` contract validator guard to prevent future drift between implemented subcommands and the usage string.

- **macOS `npm test` hang eliminated** (issue #129): All 7 temporary `gh` shell shims in `scripts/simulate-workflow-walkthrough.js` converted from `#!/bin/sh` scripts to `#!/usr/bin/env node` Node.js scripts. On macOS, direct execution of a shell script via shebang from a Node.js child process could hang indefinitely; Node.js shims are not affected. Also prepends `path.dirname(process.execPath)` to the PATH in 4 `spawnSync` call sites (`runClaimOnline`, `runClaimOnlineLastJson`, and 2 inline calls) so `node` is discoverable by the new shebang on all platforms.

- Add clean-worktree guard before branch checkout in GitLab and Gitea `runDirectMerge` pipelines, matching the GitHub baseline; dirty tracked files now trigger an explicit `'Worktree must be clean before direct merge sink runs'` error instead of an opaque `git checkout` failure (KaolaBrother/Kaola-Workflow#128)

- Remove `workflow:in-progress` label when linked issue is closed via sink-merge (GitHub, GitLab, Gitea) (#127)

- **Gitea parity sweep across README, workflow-state-contract, and api docs** (issue #126): Updated README.md, docs/workflow-state-contract.md, and docs/api.md to include Gitea alongside GitHub and GitLab everywhere. Corrected stale Codex manifest versions for `kaola-workflow` and `kaola-workflow-gitlab` from `1.4.1` to `1.5.0`. Added missing Gitea install path, env var scope notes, hooks re-run flag, and forge-neutral wording in the workflow state contract.

- **Config-driven auto-merge parity for Gitea and GitLab sinks** (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js`): Both sinks now read `~/.config/kaola-workflow/config.json` and activate auto-merge when `pr_auto_merge: true` (Gitea) or `mr_auto_merge: true` (GitLab) is set, matching the documented behavior and the GitHub baseline. The `--merge` CLI flag takes priority over config; both paths are skipped in offline mode. Dispatch (phase6.md, SKILL.md) is unchanged. (issue #122)

- Fix `checkServerVersion` to read `version` field (not `server_version`) from Gitea API `/api/v1/version`; fix `mergePullRequest` to pass SHA as `head_commit_id` (not `merge_message_field`) in merge request body; export `checkServerVersion` for direct testability; add 6 explicit body-assertion tests (issue #121)
- Port `assertNoLiveWorkflowFolder` guard to Gitea and GitLab direct-merge sinks; both sinks now refuse to merge a branch whose HEAD still contains the live workflow-state.md (issue #120)
- **Gitea and GitLab PR/MR sink offline parity** (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js`): Both sinks now honor `KAOLA_WORKFLOW_OFFLINE=1`. In offline mode, each sink writes `OFFLINE_PLACEHOLDER` values to `workflow-state.md` and `phase6-summary.md`, creates a local metadata commit, and skips git push and forge API calls. The `--merge` flag is also a no-op when offline. Matches existing behavior in `kaola-workflow-sink-pr.js` (GitHub) (issue #119).
- GitLab repair-state no longer advances to Phase 6 when `phase5-review.md` exists but `phase4-progress.md` still has open tasks (parity with GitHub behavior, issue #107)
- GitLab sink pipelines (merge and fallback) now guard against project archive recreation: `sink-merge` exits 3 if archive dir exists during `postMergeCleanup` receipt write; `cmdSinkFallback` returns `{updated: false, reason: 'project archived'}` when checking live folder (issue #108)
- GitHub Codex `kaola-workflow-next` SKILL.md freshness-block recovery now correctly extracts `KAOLA_CLAIM` from startup output and guards the release command with `[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ]`; previously `$KAOLA_PROJECT` was unset, causing orphaned active workflow folders when startup claimed an issue but a git freshness block prevented completion (issue #109)

## [3.10.0] — 2026-05-19

### Added — Agent-Judged Path Intent in Startup (issue #104)

- **`commands/workflow-next.md` Step 0a-1**: New "Path Intent" step before startup transaction. Agent judges fast vs. full workflow based on `KAOLA_PATH` env var, prompt prose triggers, or issue rubric. Precedence: explicit env var > prompt keywords > issue eligibility rubric > default full. Documented triggers include "quick fix", "trivial", "one-line", "rename", "typo" for fast path. Bias toward full mode when in doubt.
- **`.env.example` KAOLA_PATH documentation**: Already documented (no changes needed).
- **`commands/workflow-next.md` Required Output block**: Added `Workflow path:` line to status output, reporting `{fast|full — from KAOLA_PATH or Step 0a-1 judgment}`.
- **GitLab edition parity** (`plugins/kaola-workflow-gitlab/commands/workflow-next.md`): Same Path Intent logic and output block, using `glab issue view` instead of `gh issue view`.

### Changed — Fast-Mode Subagent Delegation (issue #104)

- **`commands/kaola-workflow-fast.md` Steps 1-3**: Rewrote to delegate Plan/Execute/Review to Claude Code subagents (`planner`, `tdd-guide`, `code-reviewer`) instead of inline session work. Each step updates `workflow-state.md` with `implementation_owner` field and stores agent output in `.cache/{agent}.md`. Subagents have Read-only tools; orchestrator applies Trivial Inline Edits and runs acceptance checks.
- **Step 1 (Plan — planner)**: Agent produces scope/files/changes/check-command; orchestrator writes to `fast-summary.md` with status `IN_PROGRESS`.
- **Step 2 (Execute — tdd-guide)**: Agent applies changes TDD-style (RED→GREEN→refactor); orchestrator runs acceptance check and escalates on `test_thrash` threshold.
- **Step 3 (Review — code-reviewer)**: Agent checks acceptance, security, and plan match; orchestrator handles CRITICAL/HIGH findings or escalates (with Trivial Inline Edit exemption).
- **`fast-summary.md` template**: Added "Required Agent Compliance" table documenting which agents were invoked and where to find evidence.
- **Workflow state contract**: All fast-mode steps now set `main_session_role: orchestrator`, `inline_emergency_fallback_authorized: no` to enforce clear role boundaries.
- **SKILL.md mirrors** (`plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md`, GitLab `plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md`): Updated to match command.md changes, emphasizing orchestrator responsibility for side effects and agent output storage.

### Fixed — sink-merge live-folder guard (issue #105)

- **`assertNoLiveWorkflowFolder` guard in `sink-merge.js`**: `sink-merge` now exits 1 with a remediation message if `kaola-workflow/{project}/workflow-state.md` is still committed in the branch HEAD at merge time. Uses `git cat-file -e HEAD:{path}` to check the committed tree (not just the filesystem). Two remediation paths are printed: Path A (worktree available — run finalize, recommit) and Path B (worktree gone — `git rm -r`, recommit).
- **`cmdFinalize --keep-worktree` commits archive to feature branch**: When finalize is called from a linked worktree with `--keep-worktree`, it now runs `git add -A kaola-workflow/` and `git commit -m "chore: archive {project}"` on the feature branch after archiving. This ensures the branch HEAD has only the archive folder before `sink-merge` runs.
- **Regression tests**: Added `testSinkMergeRefusesLiveFolder` (negative: guard fires, main SHA unchanged) and `testFastE2EMergeFullChain` (positive E2E: KAOLA_PATH=fast full chain, fast-summary.md preserved in archive). Strengthened `testE2EGitHubMergeFullChain` with post-merge assertions verifying live folder absent and archive present.
- **AC#4 repair commits**: Archived pre-existing live `kaola-workflow/issue-100/` and `kaola-workflow/issue-101/` folders from closed issues into `kaola-workflow/archive/`.

### Fixed — GitLab Startup Offline Classifier Parity

- **`classifyIssue()` offline fallback**: GitLab startup now uses the same local `.roadmap/issue-N.md` evidence as the CLI classifier when `KAOLA_WORKFLOW_OFFLINE=1`, so explicit-target startup refuses blocked local roadmap issues instead of silently acquiring them.
- **Regression test**: Added coverage that `startup --target-issue N` exits with `user_target_blocked` and creates no active folder when the local GitLab roadmap marks the target as blocked by another issue.

### Fixed — GitLab KAOLA_PATH=fast Startup State (issue #101)

- **`writeState()` fast-path support**: Added `workflow_path`/`isFast` logic to the GitLab `writeState` function. When `workflow_path: fast`, the function now writes `phase: fast`, `phase_name: Fast`, `workflow_path: fast`, `/kaola-workflow-fast` as `next_command`/`next_skill`, and `fast-summary` as the pending gate — matching the GitHub implementation.
- **`claimProject()` workflow_path passthrough**: `claimProject` now passes `workflow_path: args.workflowPath || process.env.KAOLA_PATH || 'full'` to `writeState`, so `KAOLA_PATH=fast startup` propagates the fast-path flag correctly.
- **Fast-startup regression test**: Added test that runs `KAOLA_PATH=fast startup --target-issue N` and asserts the written `workflow-state.md` contains all required fast-path fields.

### Fixed — GitLab Worktree Path Nesting (issue #100)

- **`worktreePathFor` uses git common-dir**: Added `getCoordRoot`/`mainRootFromCoord` helpers to derive the main repo root via `git rev-parse --git-common-dir`, matching the GitHub implementation. Worktree sibling paths under `<repo>.kw/` are now computed relative to the main repo root regardless of which worktree the command runs from.
- **`provisionWorktree` runs git operations on main root**: All `git worktree add`, `worktreeRegistered`, and `branchExists` calls now use `mainRoot` so branch and registration state is always looked up against the authoritative git index.
- **stdio suppressed in `provisionWorktree`**: Changed `stdio: 'inherit'` to `['ignore', 'ignore', 'ignore']` for `git worktree add`, preventing git messages from bleeding into startup's JSON stdout.
- **Sibling-worktree regression test**: Added test that runs startup from within a linked worktree and asserts the resulting `worktree_path` is a sibling (not nested) under the main repo's `.kw` directory.

### Fixed — GitLab Startup/Pick-Next Explicit-Target Parity (issue #99)

- **`cmdStartup()` no-target guard**: GitLab startup now always returns `no_target` (exit 1) when called without `--target-issue`, even when exactly one active folder exists. Aligns with GitHub behavior.
- **`cmdPickNext()` no-target guard**: GitLab pick-next now always returns `no_target` when called without `--target-issue`, removing the auto-pick-first-open-issue path.
- **`worktree_path` in owned startup response**: Explicit-target startup now emits top-level `worktree_path` for owned folders, matching the GitHub response shape.
- **Regression tests**: Three tests added covering no-target startup, no-target pick-next, and explicit-owned worktree_path.

### Fixed — Codex Agent Profile Installer Features Table (issue #102)

- **`install-codex-agent-profiles.js`**: Avoids injecting a duplicate `[features]` table when the target `.codex/config.toml` already defines one. Fresh installs still receive the managed `[features]` stanza; existing configs keep their user-owned features table untouched.
- **Regression test**: Codex walkthrough simulation now covers fresh installs, existing `[features]` configs, and reinstall idempotency.

### Fixed — GitLab Term-Replacement Artifacts and Test Import Path (issues #90, #98)

- **GitLab agent profile typo**: Fixed spelling error in `plugins/kaola-workflow-gitlab/agents/code-architect.toml` (`enouglab` → `enough`).
- **Validator forbidden-pattern addition**: Added `/\b[a-z]+glab\b/i` to `assertNoForbidden` in the GitLab contract validator to catch accidental `gh`→`gitlab` replacement artifacts.
- **Test import path correction**: Fixed `require('../scripts/kaola-gitlab-workflow-sink-merge')` → `require('./kaola-gitlab-workflow-sink-merge')` in `test-gitlab-sinks.js`, unblocking `npm run test:kaola-workflow:gitlab`.

### Documentation — GitLab Sink-Merge Parity + Test Hooks (issue #89)

- **`docs/api.md` Sink API expansion**: Documented `classifyMergeError` function exported from both GitHub and GitLab sink-merge modules; clarified exit codes 2 (FF race) and 3 (merge-impossible) apply to both editions; added failure classification contract.
- **Test environment variables documented**: Added `KAOLA_WORKFLOW_FORCE_FF_FAIL=N` and `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=token` to `.env.example` and `docs/api.md` with clear test-only scope.
- **Module exports documentation**: New "Module Exports — Public API Functions" section in `docs/api.md` documenting `classifyMergeError`, `getCoordRoot`, and GitLab-specific functions (`closeLinkedIssue`, `finalValidationPassed`, `runDirectMerge`) exported for test and integration use.
- **README.md environment variable table**: Added `KAOLA_WORKFLOW_FORCE_FF_FAIL` and `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` entries with test-only scope annotation.
- **GitLab edition parity**: Phase 6 exit-code documentation already synchronized in both `commands/kaola-workflow-phase6.md` (GitHub) and `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md` (GitLab).

### Fixed — GitLab Classifier and Repair-State Parity (issue #88)

- **GitLab Classifier**: Added `parallel_mode` config bypass (when mode is not `auto`), OFFLINE roadmap fallback using `touches:` metadata, and remote claim detection via `issueHasWorkflowInProgressLabel` and `issueHasRemoteClaimNotes` helpers. Achieves feature parity with the GitHub edition classifier for offline operation and parallel-work classification.
- **GitLab Repair-State**: Added `stateLooksValid` three-way validation branch (returns `true` for valid+current state, `false` for invalid/stale), integrated into `repair()` decision tree for safer state reconstruction. Added `## Ownership Rules` section in repaired state output documenting main-session role, implementation owner, fix owner, and emergency fallback authorization. Renamed `last_result: reconstructed` field to `last_result: state_repaired_from_artifacts` to align with issue #62 session-aware finalization semantics.
- **Test coverage**: New unit tests in `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` covering classifier config bypass, offline fallback paths, remote claim detection, and repair-state ownership rules generation.

### Added — GitLab Active-Folder Safeguards Parity (issue #86)

- **`cmdRelease` CWD guard** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`): GitLab release now refuses to discard the current working directory, returning `{released: false, reason: 'refusing to discard current working directory'}` with exit code 1. Mirrors the existing GitHub safeguard.
- **`cmdStatus` drift detection** (`kaola-gitlab-workflow-claim.js`): Status now returns `{active, drift, count}` where `drift` contains folders for issues that have since been closed. Uses exported `partitionActiveAndDrift(root)` helper. Mirrors the GitHub drift-aware pattern.
- **Git Freshness Block Recovery** (`plugins/kaola-workflow-gitlab/commands/workflow-next.md`): Added subsection under Startup Step 1 covering `git pull --ff-only` retry and claimed-folder release when a freshness block persists.
- **Co-active Folders Advisory** (`commands/workflow-next.md` + `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`): Added advisory subsections warning against merging, interleaving, or batching commits from different active folders.
- **Regression tests**: CWD guard refusal test and drift detection test added to `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`.

### Tests — E2E Coverage (issue #85)

- test: add E2E regression coverage for GitHub merge/PR closure and parallel-issue independence (issue #85); GitLab E2E remains out of scope pending OFFLINE support in GitLab scripts

### Fixed — sink-merge worktree removal after archive (issue #85)

- **`scripts/kaola-workflow-sink-merge.js`** (and byte-identical plugin copy): always call `removeWorktree` in Step 0 regardless of whether the project folder appears in active folders. Previously, the `if (folder)` guard skipped `removeWorktree` when the folder had already been archived (e.g., after `finalize --keep-worktree`), leaving the linked worktree registered and causing `git checkout <branch>` to fail with "already used by worktree". The `removeWorktree` function has always handled the `folder=undefined` case via its `worktreePathFor` fallback; removing the guard lets it run unconditionally.

### Fixed — Priority Label Config Path and Key (issue #84)

- **`readPriorityConfig` in `scripts/kaola-workflow-claim.js`** (and byte-identical plugin copy): now reads `kaola-workflow/config.json` + `priority_top_tier_labels` instead of `.kaola-workflow.json` + `top_tier_labels`. Aligns implementation with documented contract in SKILL.md and `commands/workflow-init.md`.
- **`readPriorityConfig` exported** from `kaola-workflow-claim.js` for direct unit testing.
- **Regression test** (`testReadPriorityConfig`) in `scripts/simulate-workflow-walkthrough.js`: missing-file default, custom labels, non-array fallback.

### Fixed — GitLab Archive-Aware Sink and Fallback Behavior (issue #83)

- **Private `resolveProjectFile` helper** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`): New fallback resolution that checks the live `kaola-workflow/{project}/` path first, then falls back to `kaola-workflow/archive/{project}/` if the live path is missing. Enables sink scripts to work with both active and archived project metadata.
- **`readProjectInfo` + `finalValidationPassed` archive awareness** (`kaola-gitlab-workflow-sink-merge.js`): Both functions now call `resolveProjectFile` to locate workflow-state.md and phase6-summary.md, allowing direct merge sink to validate and close issues even when the project folder has been archived.
- **`cmdSinkFallback` archive guard** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`): Added `isSafeName` validation and `fs.existsSync(projectDir(...))` check before attempting sink-fallback state updates. When project dir is absent (archived), returns `{updated: false, reason: 'project archived'}` instead of attempting unsafe filesystem operations that could recreate archived folders.
- **`appendSummary` directory existence guard** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js`): Replaced `fs.mkdirSync` with `fs.existsSync(path.dirname(...))` guard; function now returns `boolean` to indicate success/failure when writing to archived/missing project directories.
- **6 new unit tests** (`plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`): Coverage for all three bug scenarios: finalValidationPassed fallback, runDirectMerge after archive, appendSummary with missing parent dir, sink-fallback with archived project, sink-fallback with active project, and unsafe project name rejection.
- **Integration test** (`plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`): New `testFallbackGuardsAfterArchive` test validating end-to-end behavior when project folder is archived.

### Fixed — Sink-PR Metadata Commit + Clean Worktree (issue #82)

- **`scripts/kaola-workflow-sink-pr.js` + GitLab mirror**: PR sink now creates a deliberate metadata follow-up commit (`chore: record PR metadata for {project}`) after PR creation. This writes `pr_url` and `pr_number` to the workflow-state.md `## Sink` block and leaves the worktree clean. The pattern applies to both ONLINE and OFFLINE paths (OFFLINE writes `OFFLINE_PLACEHOLDER` commit instead). No user interaction or branch manipulation required — sink-pr handles the metadata internally.
- **`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js`**: Same metadata commit pattern applied to GitLab MR sink. New `opts.skipMetadataCommit` flag for testing/advanced scenarios. Added branch validation before metadata write to catch missing branches early.
- **Dead try/catch in OFFLINE path**: Fixed exception handling in sink-pr OFFLINE code path where success returns were missing, improving reliability during offline operation.
- **Phase 6 guardrail update** (`commands/kaola-workflow-phase6.md` line 76): Amended "Do not create tracked file edits after the final commit" rule to explicitly permit the sanctioned PR/MR metadata follow-up commit produced automatically by `sink-pr.js` or `sink-mr.js`. No other post-final commits are permitted.
- **Phase 6 Step 8b clarity** (`commands/kaola-workflow-phase6.md`): Documented that `sink-pr` writes PR metadata via automatic metadata follow-up commit, and the worktree remains clean. `watch-pr` archives the folder when the PR merges or closes (on the next `/workflow-next` startup).
- **Exit code descriptions**: Updated phase6.md exit-code documentation to reflect the new metadata commit behavior and timing.
- **Regression test**: Added `testSinkPrLeavesCleanWorktree` to `scripts/simulate-workflow-walkthrough.js` to validate worktree cleanliness after PR sink metadata commit.
- **Applied to GitHub and GitLab editions**: Fix included in `scripts/kaola-workflow-sink-pr.js`, `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` (byte-identical mirror), and `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js` (ported with helpers).

### Fixed — Startup Contract: Remove Sole-Active Auto-Select (issue #81)

- **`scripts/kaola-workflow-claim.js` `cmdStartup`**: removed auto-select branch that returned `verdict: owned` when exactly one active folder existed and no `--target-issue` was supplied. All no-target calls now return `verdict: no_target` (exit 1), forcing agents to read status, derive the issue number, and supply it explicitly.
- **Agents now own startup issue selection**: `commands/workflow-next.md` Step 0 and equivalent command/skill docs expanded with bash one-liner to extract issue number from `node CLAIM_JS status` and set `KAOLA_TARGET_ISSUE` before the startup call. The one-liner uses `jq`-style JSON processing in node to find issue number when exactly one active folder exists.
- **Four regression tests added** (`scripts/simulate-workflow-walkthrough.js`): 
  - No target, zero active folders → exit 1
  - No target, one active folder → exit 1 (was: auto-select, exit 0)
  - No target, multiple active folders → exit 1
  - Sole-active round-trip: agent reads status, derives issue, re-runs startup with target → exit 0, verdict acquired/owned
- **GitHub and GitLab editions**: same changes applied to both `plugins/kaola-workflow-gitlab/` variant; agent-side sole-active resume bash one-liner works in both skill contexts.
- **Why**: Startup is a script-level transaction that must not silently guess; the agent decides which issue to work on. This contract aligns with issue #44 (explicit-target validation) and prevents silent misrouting when multiple active folders exist from prior parallel sessions.

### Fixed — workflow-next orphan on Git freshness block (issue #80)

- **`commands/workflow-next.md`**: the `### Git Freshness Block Recovery` section now extracts `KAOLA_PROJECT` and `KAOLA_CLAIM` from `$STARTUP_OUT` and runs `node "$CLAIM_JS" release --project "$KAOLA_PROJECT" --reason git-freshness-block` when the block cannot be resolved by fast-forward. Guard is `[ "$KAOLA_CLAIM" = "acquired" ]` so prior-session (`owned`) folders are never released.
- **`plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`**: inserted the missing `### Git Freshness Block Recovery` subsection with the same guarded release pattern (using `$PICK_NEXT_PROJECT` and `$claim_script`).
- **`scripts/simulate-workflow-walkthrough.js`**: extended `testFinalizeReleaseCleansWorktree` with an issue-604 regression guard confirming `release --reason git-freshness-block` cleans the worktree.

## [3.8.1] — 2026-05-19

### Fixed — Sink-Merge Cwd-Independence (issue #94)

- **`scripts/kaola-workflow-sink-merge.js` + Codex mirror**: every git call now passes `git -C <mainRoot>` explicitly. `mainRoot` is computed once from `getCoordRoot()` and threaded through `assertCleanWorktree`, `doRebase`, `ffMergeLoop`, and `postMergeCleanup`. Step 0's escape-chdir now targets `os.tmpdir()` instead of `mainRoot`, so the script is provably cwd-independent and Phase 6 invocations from a linked worktree no longer collide with the worktree registry's branch lock.
- **`scripts/simulate-workflow-walkthrough.js`**: new `testSinkMergeFromLinkedWorktree` regression test (sink-merge had zero coverage in the walkthrough). The test fails fast if any `-C mainRoot` is dropped from the new code path.

### Fixed — `kaola_script` Self-Detection (issue #95)

- **Helper one-liner updated across 8 command markdowns (22 occurrences)** in both GitHub and GitLab editions: `commands/{workflow-init,workflow-next,kaola-workflow-phase1,kaola-workflow-phase6}.md` and `plugins/kaola-workflow-gitlab/commands/{same}`. The helper now reads `./package.json` and, when the name is `"kaola-workflow"`, prefers the workspace's local `./scripts/` (or `./plugins/kaola-workflow-gitlab/scripts/` for the GitLab edition) before falling back to `CLAUDE_PLUGIN_ROOT` and `$HOME/.claude/...`. Downstream projects retain the original resolution order.
- **Why this matters**: previously, Phase 6 of a kaola-workflow self-fix branch silently resolved `CLAIM_JS` to the installed plugin and ran stale code, so the fix under test was never exercised by its own closure.

### Fixed — GitLab Roadmap Atomicity And Source Safeguards (issue #87)

- Added GitLab roadmap missing-source protection so `generate` refuses to erase a non-empty generated `ROADMAP.md` when `kaola-workflow/.roadmap/` is absent.
- Switched GitLab generated roadmap writes to atomic temp-file replacement and made explicit `init-issue` creation exclusive by default.
- Added `init-issue --update` for deliberate GitLab roadmap source updates, with accurate `created`, `skip`, and `updated` output.
- Added GitLab regression coverage for missing-source guard behavior, atomic generate cleanup, concurrent `init-issue`, and contract validation of the new hardening helpers.

### Added — Unified CLAUDE.md + AGENTS.md Canonical Convention (issue #79)

- **AGENTS.md creation** — New AGENTS.md file added to repository root with mandatory redirect block. Directs agents to read CLAUDE.md before any action and establishes CLAUDE.md as the single canonical source for non-negotiable rules and project conventions.
- **Dogfood convention in kaola-workflow itself** — The kaola-workflow project now uses its own AGENTS.md convention, demonstrating the pattern for downstream projects using this workflow.
- **CLAUDE.md Non-Negotiable Rules update** — Reduced from 6 bullets to 5 by removing "Preserve user changes" (implicit in "Make surgical changes") and adding "Goal-driven execution" (define success criteria before starting, test-first for bugs/features). Non-negotiable rules remain exact and binding across all sessions.
- **workflow-init automation updates** — Added Step 3 "Create AGENTS.md" in both GitHub and GitLab editions. CLAUDE.md template now KW-marked for idempotent application. All init validators check for AGENTS.md presence and MANDATORY sentinel.
- **Validator contract enforcement** — Three validators updated to assert AGENTS.md exists, contains MANDATORY sentinel, and matches across init paths and skill definitions. Ensures downstream projects follow the unified convention.

### Added — Typed-Acknowledgement Delegation Gate (issue #77)

- **Delegation Contract in workflow-next skills** (`plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` and `kaola-workflow-gitlab` edition): Agents must establish a delegation policy with the user before phase work begins. Policy options are `delegate`, `local-authorized`, or `tool-unavailable`. Policy is written to `workflow-state.md` as `delegation_policy:` after startup.
- **Ungated fallback language removed**: Removed all conditional "when subagents are available; otherwise perform locally" language from 6 phase skills (GitHub + GitLab editions): research, ideation, plan, execute, review, and finalize. Delegation decisions are now explicit rather than implicit fallbacks.
- **Four-token compliance vocabulary**: Updated compliance ledger status values in all phase skills to use typed tokens: `subagent-invoked`, `local-fallback-explicit`, `local-fallback-tool-unavailable`, or `N/A`. Replaces vague fallback language with clear audit trail of delegation decisions.
- **Validator assertions**: `scripts/validate-kaola-workflow-contracts.js` and `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` now assert presence of new vocabulary tokens and absence of ungated fallback language in all delegation-gated phase skills.

### Fixed — Main-Worktree Live Folder Duplication on Phase 6 Archive (issue #62)

- **Main-worktree cleanup is now atomic** (`archiveProjectDir` in `kaola-workflow-claim.js`): When `cmdFinalize`, `cmdRelease`, or `cmdWatchPr` archives a linked-worktree project directory, the function now compares the main repo root with the caller's root (both resolved via `fs.realpathSync`). If they differ, the duplicated `kaola-workflow/{project}/` copy in the main repo is atomically removed. This prevents orphaned live folders in the main checkout when a workflow is finalized from the linked worktree context.
- **Applied to GitHub and GitLab editions**: Fix included in `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical mirror), and `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (ported with helpers).
- **Covered by 3 new regression tests**: `simulate-workflow-walkthrough.js` added Epic Cases for main-repo cleanup, archive path verification, and post-finalize folder state validation.
- **Phase 6 documentation updated**: `commands/kaola-workflow-phase6.md` Section 8b now explains the main-worktree cleanup mechanism and when it applies (merge sink finalization from linked-worktree context).

### Fixed — Finalization Sink Metadata And Worktree Cleanup

- Captured Phase 6 sink metadata before archive in Claude and Codex finalization guidance so merge sinks no longer read `kaola-workflow/{project}/workflow-state.md` after it has moved to `archive/`.
- Added `--keep-worktree` to `kaola-workflow-claim.js finalize` for the final commit gate: archive is still atomic, but the linked worktree remains available until the sink removes it after the branch is committed.
- Brought GitLab lifecycle cleanup to parity by removing linked worktrees on release/finalize/watch-mr, with the same `--keep-worktree` preservation path for final commits.
- Corrected GitLab Codex skill cache fallbacks to search the `kaola-workflow-gitlab` plugin cache instead of the GitHub plugin path.

### Fixed — Lifecycle Cleanup Gaps: Closed-Issue Remnants, PR Backlog, Worktree Leftovers (issue #75)

- **Closed-issue folder drift detection**: `cmdStatus` now returns `{ active, drift, count }` instead of `{ active, count }`. The new `drift` array contains folders whose linked GitHub issue is closed. `count` reflects only active folders (excluding drift). Enables agents to detect and clean stale folders when issues are closed externally.
- **Archived-folder recreation guard**: `cmdSinkFallback` now validates project directory exists before updating sink state. Returns `{ updated: false, reason: 'project archived' }` when project dir doesn't exist, preventing accidental recreation of archived folders.
- **Safe project-name validation**: `cmdSinkFallback` and related cleanup functions now call `isSafeName(args.project)` before filesystem operations, preventing path-traversal attacks on archived folders.
- **Worktree cleanup on lifecycle events**: `cmdFinalize`, `cmdRelease`, and `cmdWatchPr` now call `removeWorktree()` after archiving projects, ensuring linked git worktrees are properly cleaned up when issues are released or closed.
- **Worktree removal path safety**: `removeWorktree()` now uses `--` separator before path in `git worktree remove` call, preventing branch names starting with `--` from being interpreted as git options.
- **Closed-issue PR discovery**: `cmdWatchPr` now includes closed-issue PR-backed folders in its scan (`excludeClosedIssues: false`), ensuring PRs are watched through completion even when GitHub issues are closed externally.

### Added — GitLab Edition Launch Gate (issues #65, #66, #72, #67, #68, #69, #70, #71)

- Documented GitHub vs GitLab edition selection for Claude Code and Codex installs, including GitLab prerequisites, manual `--forge` install/uninstall choices, and both marketplace plugin entries.
- Fixed the manual GitLab installer support-script list so `./install.sh --forge=gitlab` installs the `kaola-gitlab-workflow-*` runtime scripts used by the GitLab command resolvers.
- Added GitLab launch validation coverage for the manual installer script list and final install/uninstall smoke gates.

## [3.8.0] — 2026-05-18

### Added — GitLab Workflow Support + Active-Folders State + Classifier Coverage (issues #55, #60, #64)

- **GitLab workflow plugin** (`plugins/kaola-workflow-gitlab/`): full Claude plugin and Codex plugin manifests, commands, hooks, skills, and scripts for GitLab-based projects using `glab`.
- **GitLab forge primitives** (`kaola-workflow-gitlab-forge.js`): `listIssues`, `getIssue`, `createBranch`, `createMR`, and related helpers for glab-backed projects.
- **GitLab core scripts ported**: claim, roadmap, classifier, repair-state, sink-merge, sink-pr, and active-folders scripts adapted from GitHub edition to the gitlab plugin directory.
- **Active-folders state simplification**: workflow state is now tracked via filesystem-native active folders, reducing stale-state surface area and removing the separate state-file layer.
- **Race-safe roadmap writes**: roadmap generation uses an exclusive write lock to prevent concurrent agents from corrupting roadmap state.
- **Roadmap state contract protection**: contract invariants enforced in `kaola-workflow-roadmap.js` to prevent partial-state corruption on concurrent writes.
- **Codex plugin — kaola-workflow-gitlab**: new Codex plugin (`plugins/kaola-workflow-gitlab/.codex-plugin/`) with GitLab-branded skills, agent profiles, and defaultPrompt entries.

### Tests

- **Issue #64 classifier coverage** (`simulate-workflow-walkthrough.js`): Epic Cases for `status_ambiguous`, `resume_stale`, and `new_session` classifier branches are now exercised.

## [3.7.0] — 2026-05-18

### Added — Core Lifecycle: Closed-Issue Cleanup + Step:Complete Archive + Session Ownership Guards (issue #51)

- **Closed-issue fast-path cleanup** (`cmdSweep` first-pass): when GitHub issue is CLOSED, immediately removes `workflow:in-progress` label, assignee (`@me`), and worktree without waiting for 24-hour staleness cutoff. Uses new `isIssueClosed()` helper.
- **Step:complete archive detection** (`cmdSweep` second-pass): when project has `step: complete` + `phase6-summary.md` present + no active lock file, automatically archives directory with `status: closed`. Enables auto-cleanup of completed workflows that were not finalized via `cmdWorktreeFinalize`.
- **Closed-issue claim guard** (`claimExplicitTarget`): when agent passes `--target-issue N` to `startup` or `pick-next`, helper now checks `isIssueClosed(N)` and returns `{ status: 'user_target_closed' }` with reasoning. Prevents agents from claiming already-closed GitHub issues.
- **Session ownership guard** (`cmdResume`): now validates that calling session owns the current project by comparing `args.session` against lock file `session_id`. When `--session <id>` is provided, rejects finalization if lock is owned by a different session (exit code 2).
- **Worktree finalize label cleanup** (`cmdWorktreeFinalize`): changed `remoteCleanup: false` → `remoteCleanup: true` so `releaseSession` automatically removes GitHub label and assignee when finalizing.
- **Repair-state ownership fix** (`kaola-workflow-repair-state.js`): `ownedByCurrentSession` now correctly returns `false` for empty or missing session IDs (was `true`), closing implicit cross-session repair hole.
- **Ticker Codex-safe gate**: ticker now uses OR-of-three bypass condition: `args.runtime === 'codex'` || `CODEX_THREAD_ID` || `KAOLA_KERNEL_SESSION_SKIP === '1'`. Prevents Codex orphaned-ticker exit on startup when no Claude ancestor is present but session is Codex-native.

### Fixed — Plugin Hook Parity (issue #51)

- **New hook file**: `plugins/kaola-workflow/hooks/kaola-workflow-pre-commit.sh` (byte-identical copy of `hooks/kaola-workflow-pre-commit.sh`). Both copies must be kept in sync manually; future release will add automated hook-sync CI check.
- **Validation note**: `scripts/validate-script-sync.js` now includes HOOK PARITY NOTE documenting the byte-identical-required relationship between the two copies (currently excluded from automatic sync validator; hook-sync check is a follow-up item).

### Security

- **Closed-fast-path defense-in-depth**: `cmdSweep` now validates `isSafeName(lock.project)` and `isSafeName(lock.session_id)` before any destructive operation on closed-issue paths, mirroring existing pattern in `cmdWatchPr`.
- **Closed-issue check fail-closed**: `isIssueClosed()` returns `false` on OFFLINE mode, parse error, or gh failure, preventing accidental worktree removal or false claim rejection when GitHub is unreachable.

### Tests

- **Epic Case 20A**: closed-issue in-progress gets fast-path cleanup (label removed, assignee removed, worktree deleted).
- **Epic Case 20B**: post-completion auto-claim refusal (no second claim allowed after phase6-summary.md exists).
- **Epic Case 20D**: second-pass step:complete detection (completed project archived automatically, partial projects skipped).
- **Epic Case 20E**: session ownership guard via `cmdResume --session` blocks cross-session finalization.
- **Epic Case 20F**: repair-state `ownedByCurrentSession` returns false for empty session IDs.

## [3.6.1] — 2026-05-18

### Changed — Remove /workflow-next-pr; Drive Sink from Prompt Intent + Merge Fallback (issue #42)

- **Deleted** `commands/workflow-next-pr.md` and `plugins/kaola-workflow/skills/kaola-workflow-next-pr/SKILL.md`.
- **Added** Startup Step 0a — PR Intent Capture to `workflow-next.md`: if the user's prompt contains PR-intent keywords, the agent exports `KAOLA_SINK=pr` before startup.
- **Added** `classifyMergeError()` to `kaola-workflow-sink-merge.js`: classifies push exceptions into `branch_protected`, `non_fast_forward`, or `permission_denied`. On failure, resets local main, writes `.cache/sink-fallback.json`, and exits 3.
- **Added** `cmdSinkFallback` subcommand to `kaola-workflow-claim.js`: reads the fallback receipt and pivots Sink block to `sink: pr`.
- **Added** exit-3 pivot block to Phase 6 dispatch: on `sink-merge.js` exit 3, calls `claim.js sink-fallback` and dispatches to `sink-pr.js`.
- **Added** Epic Cases 18A–18D to `simulate-workflow-walkthrough.js`.

### Fixed — workflow-init doc nudges + stale validator assertions (issue #43)

- `commands/workflow-init.md`: added nudges reflecting current architecture vision from issues #40, #41, #42.
- `scripts/validate-workflow-contracts.js` and `plugins/` mirror: fixed stale assertions; added `verdict: no_target` check.

### Fixed — Post-merge cleanup

- `commands/workflow-next.md`: removed duplicate `claim: "none"` paragraph introduced by version-bump + PR merge overlap; restored `verdict: no_target` routing prose.

## [3.6.0] — 2026-05-18

### Added — Single-Issue Completion Contract (issue #46)

- **Completion Contract prose**: `commands/workflow-next.md` — removed "issue selection when there is one unambiguous open issue" auto-pick clause from Goal-Driven Autonomy; added `/goal` template warning against "next issue in line" phrasing; revised Startup Step 3 to require explicit ask instead of autonomous selection; appended `## Completion Contract` section enforcing stop-and-await after Phase 6 closes one issue.
- **Phase 6 stop contract**: `commands/kaola-workflow-phase6.md` — appended `## Completion Contract` section.
- **Init contract warning**: `commands/workflow-init.md` — added bullet warning that `/goal` templates must not use cross-issue continuation phrasing.
- **README stop contract**: `README.md` — added completion contract block to Autonomy And Goal Contract section.
- **Codex skill mirrors**: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` and `kaola-workflow-finalize/SKILL.md` — appended `## Completion Contract` sections.
- **Validators**: `scripts/validate-workflow-contracts.js` and `scripts/validate-kaola-workflow-contracts.js` — added 16 `assertIncludes` checks for completion contract prose surfaces.

### Changed — Remove /workflow-next-pr; Drive Sink from Prompt Intent + Merge Fallback (issue #42)

- **Deleted** `commands/workflow-next-pr.md` and `plugins/kaola-workflow/skills/kaola-workflow-next-pr/SKILL.md`. The separate command is no longer needed.
- **Added** Startup Step 0a — PR Intent Capture to `workflow-next.md` and `kaola-workflow-next/SKILL.md`: if the user's prompt contains PR-intent keywords ("open a PR", "create a PR", "pull request", "sink=pr", "KAOLA_SINK=pr", "PR sink"), the agent exports `KAOLA_SINK=pr` before the startup call.
- **Added** `classifyMergeError()` to `kaola-workflow-sink-merge.js`: classifies push exceptions into `branch_protected`, `non_fast_forward`, or `permission_denied` tokens. On a classified failure, resets local main (`git reset --hard origin/main`), writes `.cache/sink-fallback.json`, and exits 3.
- **Added** `cmdSinkFallback` subcommand to `kaola-workflow-claim.js`: reads the fallback receipt, updates the lock file and workflow-state.md `## Sink` block to `sink: pr` + `sink_fallback_reason: <reason>`.
- **Added** `buildSinkBlock` now emits `sink_fallback_reason:` when present in lock data.
- **Added** exit-3 pivot block to Phase 6 dispatch (`commands/kaola-workflow-phase6.md` and `kaola-workflow-finalize/SKILL.md`): on `sink-merge.js` exit 3, calls `claim.js sink-fallback` and dispatches to `sink-pr.js`.
- **Added** Epic Cases 18A–18D to `simulate-workflow-walkthrough.js` covering the full auto-fallback chain.
- **Added** `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` env var for deterministic simulation of merge-impossible scenarios.

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
