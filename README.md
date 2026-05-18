# Kaola-Workflow

A 6-phase development workflow for Claude Code and Codex with per-phase file artifacts, multi-model orchestration, and full resumability across sessions and context resets.

## Autonomy And Goal Contract

Kaola-Workflow is goal-driven. For Claude Code, use `/goal` or equivalent
prompt-based Stop-hook wording so a workflow turn continues until the current
phase objective and completion audit are genuinely satisfied. For Codex, the
same contract lives in the Kaola-Workflow skills: continue until the phase
objective, evidence, and `workflow-state.md` next pointer are complete.

Routine workflow bookkeeping is autonomous. Generated project/folder names,
collision suffixes such as `-2`, cache/artifact paths, and ordering that does
not affect user intent should be chosen automatically and recorded. Essential
technical decisions should consult the configured expert internally, then apply
and record the chosen answer: Claude Code uses the advisor/Opus path, while
Codex uses the strongest available expert model or agent profile for the
session. Prompt the user only for true external authorization or materially
user-owned choices, such as risky Git synchronization, destructive rewrites,
credential or deployment actions, or issue/roadmap reorganization.

The single-issue completion contract applies at the end of every run: after
Phase 6 closes issue #N and archives the active folder, the agent stops and awaits
explicit re-direction. Do not use "next issue in line" phrasing in `/goal`
templates — cross-issue continuation is never automatic.

## Vendored Claude Code Agents

Kaola-Workflow installs the Claude Code agents it needs directly from this
repository. The agent prompts are derived from Everything Claude Code (ECC) and
vendored under the MIT License; see [docs/agents-source.md](docs/agents-source.md)
for the pinned upstream commit, attribution, and refresh procedure.

| Agent | Phase | Model |
|-------|-------|-------|
| `code-explorer` | 1 — Research/Discovery (code facts) | Sonnet |
| `docs-lookup` | 1 — Research/Discovery (external docs, when needed) | Sonnet |
| `planner` | 2 — Ideation | Opus |
| `code-architect` | 3 — Plan | Sonnet |
| `tdd-guide` | 4 — Execute (per-task TDD executor) | Sonnet |
| `build-error-resolver` | 4–6 — Validation repair when needed | Sonnet |
| `code-reviewer` | 5 — Review | Sonnet |
| `security-reviewer` | 5 — Review (conditional) | Sonnet |
| `doc-updater` | 6 — Finalize | Haiku |

The Opus advisor gates in Phases 2, 3, and conditional Phase 5 require
`"advisorModel": "opus"` in `~/.claude/settings.json` or an equivalent Claude
Code advisor configuration.

## Installation

### Choose An Edition

Kaola-Workflow has two sibling editions:

- **GitHub edition**: default. Uses GitHub issues, pull requests, and `gh`.
- **GitLab edition**: opt-in. Uses GitLab issues, merge requests, and `glab`.

The workflow commands keep the same names in both editions, so a manual Claude
Code command install should choose one forge at a time. install.sh `--forge`
flag selects which edition to install.

### Claude Code

Claude Code installs use `install.sh` only. Do not install Kaola-Workflow through
the Claude Code plugin marketplace; `install.sh` copies the slash commands,
support scripts, optional hook config, and vendored agents into `~/.claude/`.
If an older Claude Code plugin install is present, the installer refuses to run
until the plugin is removed:

```bash
claude plugin uninstall kaola-workflow@kaolabrother-kaola-workflow
claude plugin uninstall kaola-workflow-gitlab@kaolabrother-kaola-workflow  # if installed
claude plugin marketplace remove kaolabrother-kaola-workflow
```

GitHub edition, default behavior:

```bash
curl -fsSL https://raw.githubusercontent.com/KaolaBrother/Kaola-Workflow/main/install.sh | bash
```

GitLab edition:

```bash
curl -fsSL https://raw.githubusercontent.com/KaolaBrother/Kaola-Workflow/main/install.sh | bash -s -- --forge=gitlab
```

From a local clone:

```bash
git clone https://github.com/KaolaBrother/Kaola-Workflow.git
cd Kaola-Workflow
./install.sh --forge=github  # default GitHub edition
# or
./install.sh --forge=gitlab  # GitLab edition
```

Then in Claude Code:

```text
/workflow-init
/workflow-next
```

Uninstall:

```bash
./uninstall.sh --forge=github
./uninstall.sh --forge=gitlab
./uninstall.sh --forge=all
```

If you installed with the one-liner and do not have a local clone, clone the
repository first, then run the matching uninstall command.

### GitLab Prerequisites

Before using the GitLab edition in a target project:

- Install and authenticate `glab`.
- Use a GitLab-hosted project remote, or provide an explicit GitLab project
  selection when the CLI cannot infer one from `origin`.
- Enable GitLab issues and merge requests for the project.
- Keep the workflow labels available: `workflow:queued` and
  `workflow:in-progress`.

## Codex Packs

This repository also includes Codex packs under `plugins/`. They expose the same
Kaola-Workflow identity through Codex-native skills, using `kaola-workflow/`
project artifacts and `AGENTS.md` guidance rather than Claude Code slash
commands and `CLAUDE.md`.

- GitHub edition: `plugins/kaola-workflow/`
- GitLab edition: `plugins/kaola-workflow-gitlab/`

`.agents/plugins/marketplace.json` is the Codex registration manifest. Codex's
CLI requires this file (its only registration command is `plugin marketplace
add <path>`) — it contains both `kaola-workflow` and `kaola-workflow-gitlab`
entries so a single local-path registration exposes either edition.

### Install On Another Computer

Prerequisites:

- Codex is installed and authenticated on the target computer.
- The target computer can access this GitHub repository.
- Restart Codex after adding or updating the plugin.

Clone the repository, then register it with Codex from the local path. The
Codex CLI exposes `codex plugin marketplace add` as its only plugin
registration command — pointing it at a local clone keeps the install local
and does not rely on any remote/public marketplace:

```bash
git clone https://github.com/KaolaBrother/Kaola-Workflow.git ~/kaola-workflow
codex plugin marketplace add ~/kaola-workflow
```

The local marketplace exposes both entries: `kaola-workflow` for GitHub and
`kaola-workflow-gitlab` for GitLab.

For direct config enablement, add the desired entry to your Codex configuration:

```toml
[plugins."kaola-workflow@kaolabrother-kaola-workflow"]
enabled = true

[plugins."kaola-workflow-gitlab@kaolabrother-kaola-workflow"]
enabled = true
```

After restarting Codex, open the target project and ask Codex to initialize the
selected workflow:

```text
Use Kaola-Workflow for Codex in this repo.
Run workflow-init for Kaola-Workflow for Codex.

Use Kaola-Workflow GitLab for Codex in this repo.
Run workflow-init for Kaola-Workflow GitLab for Codex.
```

Update an existing Codex install:

```bash
cd ~/kaola-workflow
git pull
```

Restart Codex to pick up the updated plugin files.

To verify a project was initialized for Codex, check that `.codex/config.toml`
contains a `# BEGIN kaola-workflow agents` managed block and that
`.codex/agents/kaola-workflow/` contains the role profile files.

The primary skills are:

```text
kaola-workflow-init
kaola-workflow-next
kaola-workflow-research
kaola-workflow-ideation
kaola-workflow-plan
kaola-workflow-execute
kaola-workflow-review
kaola-workflow-finalize
```

Both Codex packs keep the same six-phase shape, state repair, compliance ledger,
TDD evidence, review, documentation docking, roadmap refresh, archive, and final
Git gate. They do not depend on external agent installs. Instead,
`kaola-workflow-init` automatically installs Codex-native role profiles that
mirror the Claude workflow roles:

```text
code-explorer
docs-lookup
planner
code-architect
tdd-guide
build-error-resolver
code-reviewer
security-reviewer
doc-updater
```

The managed setup copies role configs into `.codex/agents/kaola-workflow/` and
maintains a `# BEGIN kaola-workflow agents` block in `.codex/config.toml` while
preserving unrelated config. At startup, Codex workflows ask the user to authorize
a delegation policy (`delegate`, `local-authorized`, or `tool-unavailable`).
When policy permits and subagents are available, phases invoke those roles for
detached research, planning, execution, repair, review, and documentation work.
Otherwise, the current Codex session performs the work locally under explicit
user authorization.

Codex profiles intentionally do not pin model names, so model upgrades can flow
through the user's active Codex configuration. They only set reasoning effort:

| Role | Reasoning effort |
| --- | --- |
| `code-explorer` | `medium` |
| `docs-lookup` | `medium` |
| `planner` | `xhigh` |
| `code-architect` | `high` |
| `tdd-guide` | `medium` |
| `build-error-resolver` | `medium` |
| `code-reviewer` | `high` |
| `security-reviewer` | `high` |
| `doc-updater` | `low` |

There is no separate Codex advisor role. Codex advisor gates use the strongest
available expert model/profile for the current session, or the current session
performs the same review locally when no detached advisor profile is available.

## Release Versioning

Current official release versions:

- Claude Code command install, GitHub edition: `3.8.0`
- Claude Code command install, GitLab edition: `3.8.0`
- Codex `kaola-workflow` plugin manifest: `1.4.0`
- Codex `kaola-workflow-gitlab` plugin manifest: `1.4.0`

The root `package.json` version is the official repository and Claude Code
command-install release version. The GitLab Claude command pack follows that
same version through the root release. Codex plugins have their own manifest
versions in `plugins/*/.codex-plugin/plugin.json`; bump the affected Codex
manifest whenever that plugin's install surface, skills, agent profiles, or
workflow behavior changes.

The npm package includes `"plugins/"` in `package.json#files`, so both Codex
packs and the GitLab Claude command sources are part of the packaged release
surface.

Use SemVer for both versions:

- `MAJOR`: breaking command, artifact, plugin, or workflow-contract changes.
- `MINOR`: backward-compatible workflow phases, agent roles, install features,
  or new automation.
- `PATCH`: compatible bug fixes, validation fixes, documentation-only updates,
  or small install clarifications.

Official release checklist:

```bash
npm test
git diff --check
git tag kaola-workflow-v3.1.0
git push origin main --tags
```

Create a tag only when publishing a tagged release. For normal development
pushes, update the versions and changelog, run validation, commit, and push the
branch.

## Usage

Initialize each project once:

```
/workflow-init
```

This creates or updates a compact `CLAUDE.md`, `kaola-workflow/ROADMAP.md`, and the baseline documentation map without replacing existing project guidance. The generated `CLAUDE.md` keeps commands, hard rules, durable state invariants, workflow pointers, and documentation links in root memory while leaving long details in docs or skills.

In any Claude Code session, run:

```
/workflow-next
```

The command is a thin router. It first checks local/remote Git state, safely fast-forwards clean behind-only branches, and asks before risky synchronization such as diverged history, dirty worktrees with upstream changes, rebases, merges, stashes, resets, or conflicts. It then scans `kaola-workflow/`, reads `workflow-state.md` when present, and routes to the right phase command.

### Fast Path (Optional)

For small, well-scoped issues (≤2 closely related files), request the fast-path workflow:

```
KAOLA_PATH=fast /workflow-next
```

Fast path executes Plan, Implement, and Review in a single pass, writing `fast-summary.md` instead of the full 6-phase artifacts. If scope expands during execution (multiple file groups, security concerns, dependencies, new packages), fast path escalates automatically to the full workflow. Otherwise, it routes directly to Phase 6.

## Automation Scripts

The workflow includes automation scripts installed by `install.sh` to
`~/.claude/kaola-workflow/scripts/` for the GitHub edition or
`~/.claude/kaola-workflow-gitlab/scripts/` for the GitLab edition. Commands
prefer the installed support directory and fall back to the repo checkout when
developing locally. Drift between `scripts/` and `plugins/kaola-workflow/scripts/`
is detected at test time by `scripts/validate-script-sync.js`.

| Script | Purpose | Phase |
|--------|---------|-------|
| `kaola-workflow-repair-state.js` | Reconstruct workflow state from phase artifacts | Init / Resume |
| `kaola-workflow-claim.js` | Active-folder coordination: claim, release/discard, status, patch-branch, watch-pr, bootstrap/startup, finalize, pick-next, resume, worktree-status, worktree-finalize | All phases |
| `kaola-workflow-sink-merge.js` | Branch-per-issue auto-merge sink — rebase-then-ff-merge sequence | Phase 6 |
| `kaola-workflow-roadmap.js` | ROADMAP.md regenerator — generate/migrate/validate/init-issue/project-name subcommands; reads `kaola-workflow/.roadmap/issue-{N}.md` per-issue files | Phase 1, Phase 6 |
| `kaola-workflow-classifier.js` | Parallel-work classifier: classifies open issues as green/yellow/red/blocked using active folders, roadmap metadata, and GitHub state | Startup |
| `kaola-workflow-sink-pr.js` | PR-based sink — pushes branch, opens GitHub PR via `gh pr create`, records PR URL; optionally enables auto-merge | Phase 6 |

### Active Folder Coordination

Kaola-Workflow treats `kaola-workflow/{project}/workflow-state.md` plus GitHub issue/PR state as the durable coordination contract. No lease/session layer remains.

The detailed durable-state map lives in `docs/workflow-state-contract.md`. Keep generated root-memory files to compact invariants: `ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md`, `.roadmap/` is not purged wholesale, active work stays under `kaola-workflow/{project}/` until archive or discard, and active artifacts include `workflow-state.md`, phase files, optional `fast-summary.md`, and `.cache/` evidence.

**Environment Variables:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `KAOLA_WORKFLOW_OFFLINE` | `0` | Skip GitHub calls for local tests or air-gapped usage |
| `KAOLA_WORKFLOW_DEBUG_CWD` | (unset) | DEV/TEST ONLY — when set, `sink-merge.js` writes its final cwd to this file |
| `KAOLA_PATH` | (unset) | Set to `fast` to request fast-path workflow execution; defaults to the full six-phase flow |

**Active-folder subcommands:**

| Subcommand | Usage | Description |
|------------|-------|-------------|
| `startup` / `bootstrap` | `node scripts/kaola-workflow-claim.js startup --target-issue <N> [--runtime claude|codex] [--sink merge|pr]` | Validates and atomically creates or reuses the active folder for issue N |
| `status` | `node scripts/kaola-workflow-claim.js status` | Lists active folders and their issue, branch, phase, sink, and worktree metadata |
| `release` / `discard` | `node scripts/kaola-workflow-claim.js release --project <name>` | Archives an active folder as abandoned and clears advisory GitHub labels when online |
| `finalize` | `node scripts/kaola-workflow-claim.js finalize --project <name> [--keep-worktree]` | Marks the folder closed and moves it to `kaola-workflow/archive/`; by default removes the linked worktree, while `--keep-worktree` preserves it for the final commit gate |
| `watch-pr` | `node scripts/kaola-workflow-claim.js watch-pr` | Archives PR-backed folders when GitHub reports MERGED or CLOSED |
| `worktree-status` / `worktree-finalize` | see `--help` usage errors | Lists workflow worktrees and mirrors final artifacts into the linked worktree |

### Classifier Configuration

The `kaola-workflow-classifier.js` script uses `~/.config/kaola-workflow/config.json` for parallel-work settings:

```json
{
  "parallel_mode": "auto"
}
```

Valid `parallel_mode` values:

- `auto` (default): Classify each issue as green/yellow/red/blocked before claiming, based on dependency graphs, exact file-path overlaps, file-area overlaps, and active folders.
- Other values: Bypass classification; treat all issues as green for fast claiming.

Exact file-path overlap returns `red`, including shared-infrastructure files such as `scripts/kaola-workflow-claim.js` and packaged plugin files under `plugins/kaola-workflow/`. Different files in the same shared-infrastructure directory can still return `yellow`. Offline roadmap classification reads explicit paths and `touches:` metadata from `kaola-workflow/.roadmap/issue-{N}.md`.

When an issue receives a `yellow` verdict (shared infrastructure warning), a cache file is written to `kaola-workflow/{project}/.cache/parallel-classifier.md` to flag the caution for the phase team.

### Agent-Directed Issue Selection

Issue selection is an agent decision, not a hidden script decision. Agents must:

1. Inspect the local roadmap (`kaola-workflow/ROADMAP.md`)
2. Fetch open GitHub issues
3. Classify candidates as green/yellow/red/blocked (using parallel-work guidance if multi-session)
4. Select the best match based on priority, dependencies, and phase completion
5. Pass the chosen issue number via `KAOLA_TARGET_ISSUE=N` before calling `/workflow-next`

The startup script validates the agent's choice:
- Issue must be unclaimed (no active folder)
- Issue must be green or yellow (not blocked or red)
- No duplicate active folder for the same issue

If the agent does not provide an explicit target issue, startup refuses with `verdict: no_target`.


### PR Sink

The sink mode is set at claim time and determines how Phase 6 delivers the completed work. Two paths are available:

**Intent detection** (recommended): If the user's initial prompt contains PR intent keywords ("open a PR", "create a PR", "pull request", "sink=pr", "KAOLA_SINK=pr", "PR sink"), the agent exports `KAOLA_SINK=pr` before the startup call. Startup Step 0 passes `--sink pr` to `claim`, which writes `sink: pr` to the `## Sink` block of `workflow-state.md`. Phase 6 dispatches to `kaola-workflow-sink-pr.js`.

**Auto-fallback**: When `sink: merge` is configured and the push to main fails with a merge-impossible error (branch protection, non-fast-forward, or permission denied), Phase 6 automatically pivots to PR creation. `sink-merge.js` writes a `.cache/sink-fallback.json` receipt and exits 3. Phase 6 calls `claim.js sink-fallback` to update the Sink block (`sink: pr`, `sink_fallback_reason: <reason>`), then dispatches to `kaola-workflow-sink-pr.js`.

**`pr_auto_merge` config key** (`~/.config/kaola-workflow/config.json`):

```json
{
  "pr_auto_merge": false
}
```

- `false` (default): open PR and watch for manual merge; `watch-pr` detects MERGED/CLOSED and archives the active folder automatically
- `true`: open PR and also call `gh pr merge --auto --squash --delete-branch` (requires branch protection rules to be enabled on the repo; failure is non-fatal)

**`watch-pr` subcommand** (`kaola-workflow-claim.js watch-pr`):

Called automatically at `/workflow-next` startup. Scans active folders with `sink: pr` and `pr_url`. For each:
- `MERGED`: archives the folder as closed and clears advisory GitHub labels
- `CLOSED` (no merge): archives the folder as abandoned and clears advisory GitHub labels
- `OPEN`: leaves the folder active

**OFFLINE behavior**: `kaola-workflow-sink-pr.js` writes `OFFLINE_PLACEHOLDER` and `0` to the workflow-state.md Sink block and phase6-summary.md, then exits 0.

The sink-merge script is invoked after the Phase 6 final commit gate to automate the final merge sequence. It performs: git fetch, clean-worktree guard, checkout of the requested workflow branch, merge-base skip-check, rebase onto origin/main, post-rebase validation, FF-only merge with race-condition retry loop (MAX_AUTOMERGE_RETRIES=3), push, issue close, and branch cleanup. Exit codes: 0 (success), 1 (error), 2 (FF race exhausted), 3 (merge-impossible fallback to PR).

```text
/kaola-workflow-phase1
/kaola-workflow-phase2
/kaola-workflow-phase3
/kaola-workflow-phase4
/kaola-workflow-phase5
/kaola-workflow-phase6
```

## GitHub Roadmap Cycle

Use a separate research or roadmap session to discover future work and create or refine GitHub issues. `/workflow-next` is the implementation cycle: it fetches open GitHub issues, mirrors active unfinished work into `kaola-workflow/ROADMAP.md`, advances one selected item, then comments on or closes linked issues after validation.

The local roadmap is a working mirror, not the source of truth. Keep only active unfinished work there; completed workflow folders move to `kaola-workflow/archive/`.

The workflow also enforces context discipline: `CLAUDE.md` targets under 200 lines, the local roadmap should not become history storage, and agent prompts should include only the relevant phase excerpts needed for the delegated task.

Each phase records a required-agent compliance ledger. Each active workflow also maintains `workflow-state.md`, which records the current phase, intra-phase step, next command, pending gates, and ownership rules. After resume or compaction, the main session must read that state file and the relevant compliance ledger before continuing.

Avoid redundant validation runs: Phase 4 uses targeted affected checks, Phase 5 validates only review fixes or cites existing evidence, and Phase 6 runs each full final command once against the final candidate state. Small targeted commands may run in the main session, while expensive or noisy test/lint/type/build commands should be delegated and summarized from cache evidence.

## Hook Policy

Hooks are background hygiene, not workflow validation. They may format, lint, or
typecheck edited files automatically, but `/workflow-next` should not rerun the
same check unless the phase requires broader validation or relevant files changed
after the hook ran. Hook output counts as workflow evidence only when recorded
with command, scope, result, and evidence path.

Phase 6 still owns the final full relevant validation gate. It also performs
documentation docking to match code changes with docs and issue/roadmap state,
uses an advisor-backed closure decision gate when deferred or conflict items
remain, and leaves commit and push as the final clean/synced workspace step.

## Phases

| # | Phase | What happens | Output file |
|---|-------|-------------|-------------|
| 1 | Research/Discovery | Facts only: requirement parsing → code-explorer maps affected code/patterns/tests/config → docs-lookup checks external docs when needed → completeness gate | `phase1-research.md` |
| 2 | Ideation | Strategy only: planner generates 2–3 grounded approaches → advisor gate → user selects | `phase2-ideation.md` |
| 3 | Plan | Blueprint only: code-architect turns selected approach into files, tasks, write sets, dependencies, parallel groups, and validation | `phase3-plan.md` |
| 4 | Execute | Per-task TDD loop: tdd-guide executes RED → GREEN → REFACTOR; main session reviews, validates, and checkpoints | `phase4-progress.md` |
| 5 | Review | code-reviewer always; security-reviewer conditional; review fixes delegated to tdd-guide/build-error-resolver | `phase5-review.md` |
| 6 | Finalize | Full validation with delegated repair if needed, documentation docking, closure decisions, issue/roadmap/archive updates, final commit and push | `phase6-summary.md` |

All phase files are written to `{project-root}/kaola-workflow/{project-name}/` while active. Completed workflow folders are archived to `{project-root}/kaola-workflow/archive/`. Active unfinished work is tracked in `{project-root}/kaola-workflow/ROADMAP.md`.

## Resuming

Any interrupted session resumes from `workflow-state.md` first, then reconstructs from phase files if state is missing or stale. Phase 4 tracks `pending / in_progress / complete` per task in `phase4-progress.md`, and all phases record intra-phase checkpoints in `workflow-state.md`.

### State Bootstrap And Repair

When `/workflow-next` can reconstruct one safe next command from phase
artifacts, it repairs or creates `kaola-workflow/{project}/workflow-state.md`
before routing by running `scripts/kaola-workflow-repair-state.js` when the
helper is available. It does not create state for brand-new work, ambiguous
active projects, contradictory phase files, or unresolved compliance gates that
make the next command unsafe.

Hook installation is handled by `install.sh` — agents must not hand-merge or
duplicate the hooks block.

- `install.sh` copies hook files to `~/.claude/kaola-workflow/hooks/` and
  auto-merges three managed entries into `~/.claude/settings.json`:
  `kaola-workflow:compact-context` (SessionStart),
  `kaola-workflow:pre-commit-guard` (PreToolUse Bash),
  `kaola-workflow:phantom-advisor` (PostToolUse Write|Edit). The merge is
  idempotent and identifies managed entries by `id` prefix `kaola-workflow:`
  or a command path containing `kaola-workflow`. Prior settings are backed up
  under `~/.claude/backups/settings.json.kaola-workflow.<ts>.bak`.
- Verify with `jq '.hooks' ~/.claude/settings.json` — expect those three ids
  present, each pointing at a script under `~/.claude/kaola-workflow/hooks/`
  or `~/.claude/kaola-workflow/scripts/`.
- If hooks are missing, re-run `./install.sh --forge=github` (or `--forge=gitlab`).
  Do not edit `~/.claude/settings.json` directly to add them — re-running the
  installer is the supported path.
- Fallback when `python3` is unavailable or `--no-settings-merge` was passed:
  `install.sh` prints a manual hint and the source of truth is
  `~/.claude/kaola-workflow/hooks/hooks.json`. Merge its `hooks` block into
  the user's `~/.claude/settings.json` `hooks` object, preserving any
  non-`kaola-workflow:` entries.
- `uninstall.sh` strips only entries matching the same managed-id rule; it
  does not touch other hooks.

## Parallel Active Work

Multiple Kaola-Workflow runs can coexist when each targets a distinct active folder. The source of truth is `kaola-workflow/{project}/workflow-state.md`, with GitHub issue state used to reject closed issues and PR state used by `watch-pr`.

- Startup requires an explicit `--target-issue N`; the agent chooses the issue and scripts validate it.
- Claiming uses atomic folder creation, so two agents cannot create the same `kaola-workflow/{project}/` folder.
- `status` lists active folders; `release` archives abandoned work; `finalize` archives completed work.
- The pre-commit hook blocks commits that stage multiple workflow project folders together.

### Per-Issue Git Worktrees

When Git is available, `kaola-workflow-claim.js` provisions a sibling worktree at `<repo-parent>/<repo-name>.kw/<project>/`. The path is stored in the active folder Sink block as `worktree_path`, so commands can resolve the linked worktree without consulting a lock file.

## Updating

If installed via one-liner, re-run it:

```bash
curl -fsSL https://raw.githubusercontent.com/KaolaBrother/Kaola-Workflow/main/install.sh | bash
```

If installed from a local clone:

```bash
cd Kaola-Workflow
git pull
./install.sh
```
