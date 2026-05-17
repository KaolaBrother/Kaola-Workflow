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

## Dependency — Everything Claude Code (ECC)

> **This plugin requires ECC to be installed.**
>
> The workflow delegates work to ECC-provided agents at each phase:
>
> | Agent | Phase | Model |
> |-------|-------|-------|
> | `code-explorer` | 1 — Research/Discovery (code facts) | Sonnet |
> | `docs-lookup` | 1 — Research/Discovery (external docs, when needed) | Sonnet |
> | `planner` | 2 — Ideation | Opus |
> | `code-architect` | 3 — Plan | Sonnet |
> | `tdd-guide` | 4 — Execute (per-task TDD executor) | Sonnet |
> | `build-error-resolver` | 4–6 — Validation repair when needed | Sonnet |
> | `code-reviewer` | 5 — Review | Sonnet |
> | `security-reviewer` | 5 — Review (conditional) | Sonnet |
> | `doc-updater` | 6 — Finalize | Haiku |
>
> Install ECC first:
>
> ```text
> /plugin marketplace add https://github.com/affaan-m/everything-claude-code
> /plugin install everything-claude-code@everything-claude-code
> ```
>
> **Minimal Kaola-Workflow ECC configuration**
>
> - **Hooks:** do not enable ECC hooks (see [ECC Hook Policy](#ecc-hook-policy) below)
> - **Subagents:** install only the ECC subagents listed in the table above
> - **Language rules:** do not install ECC language rules as part of Kaola-Workflow setup
> - **Common rules:** user choice based on your own project preferences
>
> ECC's current npm package name is `ecc-universal`; the older `everything-claude-code`
> npm package name is not the active install surface.
>
> The Opus advisor gates in Phases 2, 3, and conditional Phase 5 require
> `"advisorModel": "opus"` in `~/.claude/settings.json` or an equivalent
> Claude Code advisor configuration.
>
> If ECC is installed only as a Claude Code plugin, agents may appear with the
> `everything-claude-code:` prefix. The workflow supports either form.
>
> In ECC terms, `tdd-guide` is the spawnable agent. `tdd-workflow` is the
> maintained TDD playbook that the agent follows for RED → GREEN → REFACTOR.

## Installation

### As a Claude Code plugin

From Claude Code:

```text
/plugin marketplace add https://github.com/KaolaBrother/Kaola-Workflow
/plugin install kaola-workflow@kaolabrother-kaola-workflow
/reload-plugins
```

If you previously used the manual installer, remove or update user-level command
files such as `~/.claude/commands/workflow-next.md` or the legacy
`~/.claude/commands/kaola-workflow.md`; user-level commands can take
precedence over plugin commands.

Then run:

```text
/workflow-init
/workflow-next
```

### Manual command install

Marketplace install (above) is the recommended path and requires no `install.sh` run —
the plugin runtime exposes `${CLAUDE_PLUGIN_ROOT}` and command/script resolution
happens automatically. Use the manual installer below only when you cannot use
the marketplace (air-gapped environments, source checkouts, or `~/.claude/commands/`
preference):

```bash
git clone https://github.com/KaolaBrother/Kaola-Workflow.git
cd Kaola-Workflow
./install.sh
```

Plugin uninstall:

```text
/plugin uninstall kaola-workflow
```

Manual command uninstall:

```bash
./uninstall.sh
```

## Codex Pack

This repository also includes a self-use Codex pack under
`plugins/kaola-workflow/`. It exposes the same Kaola-Workflow identity through
Codex-native skills, using `kaola-workflow/` project artifacts and `AGENTS.md`
guidance rather than Claude Code slash commands and `CLAUDE.md`.

### Install On Another Computer

Prerequisites:

- Codex is installed and authenticated on the target computer.
- The target computer can access this GitHub repository.
- Restart Codex after adding, upgrading, installing, or enabling the plugin.

Fresh install from GitHub:

```bash
codex plugin marketplace add KaolaBrother/Kaola-Workflow
codex
```

Then install or enable `kaola-workflow` from the `kaolabrother-kaola-workflow`
marketplace in the Codex plugin directory. For direct config enablement, add:

```toml
[plugins."kaola-workflow@kaolabrother-kaola-workflow"]
enabled = true
```

After restarting Codex, open the target project and ask Codex to initialize the
workflow:

```text
Use Kaola-Workflow for Codex in this repo.
Run workflow-init for Kaola-Workflow for Codex.
```

Install from a local clone when working offline or testing local changes:

```bash
git clone https://github.com/KaolaBrother/Kaola-Workflow.git
codex plugin marketplace add /path/to/Kaola-Workflow
```

Update an existing Codex install to the newest marketplace version:

```bash
codex plugin marketplace upgrade kaolabrother-kaola-workflow
```

Restart Codex, then rerun `kaola-workflow-init` in any project that should
receive the newest managed agent profiles and project config.

To verify a project was initialized for Codex, check that `.codex/config.toml`
contains a `# BEGIN kaola-workflow agents` managed block and that
`.codex/agents/kaola-workflow/` contains the role profile files.

The primary skills are:

```text
kaola-workflow-init
kaola-workflow-next
kaola-workflow-next-pr
kaola-workflow-research
kaola-workflow-ideation
kaola-workflow-plan
kaola-workflow-execute
kaola-workflow-review
kaola-workflow-finalize
```

The Codex pack keeps the same six-phase shape, state repair, compliance ledger,
TDD evidence, review, documentation docking, roadmap refresh, archive, and final
Git gate. It does not depend on ECC agents. Instead, `kaola-workflow-init`
automatically installs Codex-native role profiles that mirror the ECC workflow
roles:

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
preserving unrelated config. When Codex subagents are available, phases use
those roles for detached research, planning, execution, repair, review, and
documentation work; otherwise the current Codex session follows the same role
contracts locally.

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

- Claude Code `kaola-workflow` package/plugin: `3.1.8`
- Codex `kaola-workflow` plugin manifest: `1.1.8`

The root `package.json` version is the official repository and Claude Code
release version. The Codex plugin has its own manifest version in
`plugins/kaola-workflow/.codex-plugin/plugin.json`; bump it whenever the Codex
plugin install surface, skills, agent profiles, or workflow behavior changes.

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

This creates or updates a compact `CLAUDE.md`, `kaola-workflow/ROADMAP.md`, and the baseline documentation map without replacing existing project guidance. The generated `CLAUDE.md` keeps commands, hard rules, workflow pointers, and documentation links in root memory while leaving long details in docs or skills.

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

The workflow includes automation scripts packaged with the Claude Code plugin.
Marketplace installs expose them via `${CLAUDE_PLUGIN_ROOT}/scripts/` and need
no extra setup. Manual `install.sh` users get them copied to
`~/.claude/kaola-workflow/scripts/`. Commands resolve scripts in this order:
`${CLAUDE_PLUGIN_ROOT}/scripts/` → `~/.claude/kaola-workflow/scripts/` → `./scripts/`
(dev checkout). Drift between `scripts/` and `plugins/kaola-workflow/scripts/`
is detected at test time by `scripts/validate-script-sync.js`.

| Script | Purpose | Phase |
|--------|---------|-------|
| `kaola-workflow-repair-state.js` | Reconstruct workflow state from phase artifacts | Init / Resume |
| `kaola-workflow-claim.js` | Multi-session lease management (claim, release, heartbeat, ticker, sweep, status, patch-branch, watch-pr, bootstrap, derive-session, finalize, **pick-next, resume, worktree-status, worktree-finalize**); `--runtime claude\|codex` flag on claim and bootstrap | All phases |
| `kaola-workflow-sink-merge.js` | Branch-per-issue auto-merge sink — rebase-then-ff-merge sequence | Phase 6 |
| `kaola-workflow-roadmap.js` | ROADMAP.md regenerator — generate/migrate/validate/init-issue/project-name subcommands; reads `kaola-workflow/.roadmap/issue-{N}.md` per-issue files | Phase 1, Phase 6 |
| `kaola-workflow-classifier.js` | Parallel-work classifier — classifies open issues as green/yellow/red/blocked before claim; reads lock files, issue file sets, and active remote claim markers | Startup (Step 0) |
| `kaola-workflow-sink-pr.js` | PR-based sink — pushes branch, opens GitHub PR via `gh pr create`, records PR URL; optionally enables auto-merge | Phase 6 |

### Session Identity Binding

Session identity is derived from the Claude ancestor process rather than self-asserted via `KAOLA_SESSION_ID`. This prevents accidental cross-session conflicts and enforces true session isolation.

**Kernel-Derived Identity Model:**
- Session start (`SessionStart` hook) writes an O_EXCL identity file at `<coordRoot>/kaola-workflow/.runtime/<claude_pid>.identity` containing the session ID, Claude PID, and start time
- `derive-session` subcommand walks the process tree to locate a Claude ancestor, reads its identity file, validates the ancestor is still alive with matching start time, and returns the derived session ID
- `kaola-workflow-pre-commit.sh` hook uses `derive-session` to block cross-session commits

**Environment Variables:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `KAOLA_ENFORCE_PLATFORM_SESSION` | (unset) | Set to `1` to enable kernel-derived session identity enforcement; mutating commands (claim, release, heartbeat, etc.) exit 3 on session mismatch |
| `KAOLA_KERNEL_SESSION_SKIP` | (unset) | Set to `1` to skip kernel derivation and use `KAOLA_SESSION_ID` directly (backward compatibility, direct git usage) |
| `KAOLA_KERNEL_SESSION_FAKE_PID` | (unset) | TEST ONLY — override `walkToClaudePid()` return value for testing without running inside Claude |
| `KAOLA_COORD_ROOT` | (auto) | Override the coordination root path; normally discovered via `git rev-parse --git-common-dir` |
| `KAOLA_WORKFLOW_DEBUG_CWD` | (unset) | DEV/TEST ONLY — when set, `sink-merge.js` writes the final `process.cwd()` to the named file on exit. Used by test suite to verify CWD restoration after worktree removal. Not for production use. |
| `KAOLA_WORKTREE_NATIVE` | `0` | Set to `1` to enable worktree-as-primary-signal mode. `workflow-next.md` routes to `pick-next` instead of `startup`; Phase 4 resolves `ACTIVE_WORKTREE_PATH` from the issue worktree path instead of `$(pwd)`. Legacy session-lease path remains active when this flag is unset. |
| `KAOLA_PATH` | (unset) | Set to `fast` to request fast-path workflow execution (Plan+Execute+Review single-pass for small, well-scoped issues); defaults to `full` (standard 6-phase workflow). Fast path requires ≤2 closely related files and mandates escalation to full workflow on scope growth. |

**Worktree-Native Subcommands (`KAOLA_WORKTREE_NATIVE=1`):**

Four new subcommands implement the worktree-as-primary-signal model. Enable with `KAOLA_WORKTREE_NATIVE=1`. Legacy subcommands remain active when the flag is unset.

| Subcommand | Usage | Description |
|------------|-------|-------------|
| `pick-next` | `node scripts/kaola-workflow-claim.js pick-next --session <id> --runtime <claude\|codex> [--sink <merge\|pr>]` | Finds first unclaimed open issue, provisions a linked worktree, sets `workflow:in-progress` label (online), and emits `{verdict:'acquired', issue, project, branch, worktree_path}` or `{verdict:'none'}` |
| `resume` | `node scripts/kaola-workflow-claim.js resume [--project <name>] [--session <id>]` | Scans phase artifacts in the main worktree to determine the current phase and emit the next slash command. Derives project from current branch if `--project` is omitted |
| `worktree-status` | `node scripts/kaola-workflow-claim.js worktree-status` | Lists all `workflow/issue-*` linked worktrees with GitHub issue metadata |
| `worktree-finalize` | `node scripts/kaola-workflow-claim.js worktree-finalize --project <name> [--session <id>]` | Copies phase artifacts from main worktree into the issue worktree and commits them on the issue branch |

**`derive-session` Subcommand:**

```bash
node scripts/kaola-workflow-claim.js derive-session [--json]
```

Walks the process tree to find the Claude ancestor PID, reads its identity file, validates the ancestor is alive and has a matching start time, and returns the derived session ID. Exits with code 4 if no valid Claude ancestor is found.

- Output (plain): session ID to stdout
- Output (`--json`): `{ "sid": "<session-id>", "source": "file|skip|invalid_sid|null" }` to stdout
- Exit codes: 0 (success), 4 (no Claude ancestor found)

### Classifier Configuration

The `kaola-workflow-classifier.js` script uses `~/.config/kaola-workflow/config.json` for parallel-work settings:

```json
{
  "parallel_mode": "auto"
}
```

Valid `parallel_mode` values:

- `auto` (default): Classify each issue as green/yellow/red/blocked before claiming, based on dependency graphs, exact file-path overlaps, file-area overlaps, and lock files.
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
- Issue must be unclaimed (no active lock)
- Issue must be green or yellow (not blocked or red)
- No duplicate claims across sessions

If the agent does not provide an explicit target issue, startup refuses and emits a structured error with the `recovery` field indicating the next action.

**Startup Receipt Priority Information** — The startup receipt includes a `ranking` array listing `{ issue, tier, priority_label, override_label }` for all candidate issues. This helps agents make informed decisions. Ranking sorts by:

1. **`workflow:queued` label** — queued issues always win, regardless of priority tier.
2. **Priority tier** — P0 (highest) → P1 → P2 → P3 → unlabeled (lowest). Determined by GitHub label names.
3. **Issue number** — ascending (lowest number wins among equal-priority issues).

**Top-tier override labels** — any label listed in `priority_top_tier_labels` is forced to tier 0, overriding P-label ranking. When an override label fires, `priority_label` is `null` and `override_label` is the matched label name.

Configure top-tier labels in either config layer (union of both arrays applies):

```json
// ~/.config/kaola-workflow/config.json  (global)
// <repo>/kaola-workflow/config.json     (project-local)
{
  "priority_top_tier_labels": ["hotfix", "Engine Showcase Gap"]
}
```

Both config files are read-only on startup; missing or malformed files silently return an empty label list.

### PR Sink

Use `/workflow-next-pr` instead of `/workflow-next` when Phase 6 should open a GitHub PR and wait for merge rather than performing a local fast-forward merge.

`/workflow-next-pr` sets `KAOLA_SINK=pr` in the environment and delegates to `/workflow-next`. Startup Step 0 passes `--sink pr` to `claim`, which writes `sink: pr` to the `## Sink` block of `workflow-state.md`. Phase 6 runs the final commit gate first, then reads this field in the sink step and dispatches to `kaola-workflow-sink-pr.js`.

**`pr_auto_merge` config key** (`~/.config/kaola-workflow/config.json`):

```json
{
  "pr_auto_merge": false
}
```

- `false` (default): open PR and watch for manual merge; `watch-pr` detects MERGED/CLOSED and releases lease automatically
- `true`: open PR and also call `gh pr merge --auto --squash --delete-branch` (requires branch protection rules to be enabled on the repo; failure is non-fatal)

**`watch-pr` subcommand** (`kaola-workflow-claim.js watch-pr`):

Called automatically at `/workflow-next` Startup Step 0 (order: sweep → watch-pr → classify → claim). Scans all `.lock` files for entries with `sink: pr` and a `pr_url`. For each:
- `MERGED`: releases lease, deletes local branch via `git branch -D`
- `CLOSED` (no merge): releases lease with reason=aborted; does NOT delete branch; issue stays open
- `OPEN`: updates `last_heartbeat` and extends `expires` in the lock file

**OFFLINE behavior**: `kaola-workflow-sink-pr.js` writes `OFFLINE_PLACEHOLDER` and `0` to the lock file, workflow-state.md Sink block, and phase6-summary.md, then exits 0.

The sink-merge script is invoked after the Phase 6 final commit gate to automate the final merge sequence. It performs: git fetch, clean-worktree guard, checkout of the requested workflow branch, merge-base skip-check, rebase onto origin/main, post-rebase validation, FF-only merge with race-condition retry loop (MAX_AUTOMERGE_RETRIES=3), push, issue close, and branch cleanup. Exit codes: 0 (success), 1 (error), 2 (FF race exhausted).

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

## ECC Hook Policy

ECC hooks are background hygiene, not workflow validation. They may format,
lint, or typecheck edited files automatically, but `/workflow-next` should not
rerun the same check unless the phase requires broader validation or relevant
files changed after the hook ran. Hook output counts as workflow evidence only
when recorded with command, scope, result, and evidence path.

Kaola-Workflow recommends **not enabling ECC hooks**. Most ECC hook functionality
is now covered by native Claude Code features (Session Memory, `/cost`, status-line
cost display), and the remaining hooks add friction without meaningful workflow
benefit. Run Claude Code without any `ECC_HOOK_PROFILE` setting.

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

When installed as a Claude Code plugin, `hooks/hooks.json` injects a compact resume reminder after context compaction. Manual command install copies slash commands only; use plugin install when you want the compaction resume hook.

## Multi-Session Support

Multiple concurrent Kaola-Workflow sessions can safely coexist when each targets a distinct project. Session management is handled by `kaola-workflow-claim.js`:

### Session Leases & Coordination State

- Automatic on startup via `/workflow-next`; it uses `KAOLA_SESSION_ID` when set, otherwise derives it from the host platform (`CODEX_THREAD_ID` in Codex, Claude Code `SessionStart.session_id` via the plugin hook), and generates a fallback only when no platform id is available
- Manual claim/release: `kaola-workflow-claim.js claim --session <id> --project <name> --issue <N>`
- Explicit recovery/handoff: check `kaola-workflow-claim.js can-handoff --project <name> --session <id>` first, then use `kaola-workflow-claim.js handoff --project <name> --session <id>` to transfer an unfinished project only when the user intentionally wants to pick it up
- Background ticker (`ticker` subcommand) keeps leases active across machines with 15-min heartbeat intervals
- Claim race tiebreaker: lowest GitHub comment ID wins; losers yield cleanly and release the lease
- Simultaneous startup race retry: if a session classifies an issue as claimable but loses the local claim race before writing its lock, bootstrap continues scanning the open issue list and claims the next green/yellow issue automatically
- Remote sweeper (`sweep` subcommand) checks GitHub comment `updated_at` — skips active sessions (< 24h), clears stale ones (≥ 24h); second pass garbage-collects orphaned active directories (no lock file + expired >30 minutes + no phase artifacts) as `status: abandoned`
- Pre-commit hook blocks commits that stage files from a project owned by a different session

**Shared coordination state (coordRoot)**: All linked worktrees of the same repository share lock, session, and ticker state via the canonical git common directory (`<repo>/.git/kaola-workflow/`). Discovered via `git rev-parse --git-common-dir`. This ensures that a session is uniquely bound to an issue across all worktrees on the same machine or across different machines accessing the same repository.

### Per-Session Git Worktrees

When a session claims an issue, `kaola-workflow-claim.js` automatically provisions a dedicated git worktree at `<repo-parent>/<repo-name>.kw/<project>/` via the `provisionWorktree()` helper. The worktree path is stored in the lock file as `worktree_path`, and the environment variable `KAOLA_WORKTREE_PATH` is exported after provisioning.

**Worktree lifecycle management:**
- `removeWorktree()`: removes worktree on PR MERGED, sink-merge success, or explicit release
- Dirty worktrees are renamed to `.abandoned-<ISO-timestamp>` and left for manual cleanup
- Removal of own current working directory is deferred to `.pending-removal/<project>.json` for processing on next startup/sweep
- `drainPendingRemovals()`: processes deferred removals during startup sweep and after sink completion
- `cmdWatchPr()`: automatically removes worktree on PR MERGED or CLOSED
- `sink-merge.js`: removes worktree before final branch deletion
- `cmdSweep()`: runs `drainPendingRemovals()` followed by `git worktree prune`

**Environment variable**: All workflow phases should use `KAOLA_WORKTREE_PATH` when present. The 6 SKILL.md files include a Session Heartbeat shim that changes directory: `cd "$KAOLA_WORKTREE_PATH" 2>/dev/null || true`.

### Session State & Resumption

Normal startup resumes only work whose lease `session_id` exactly matches the current `KAOLA_SESSION_ID`. Active work owned by a different live session is treated as occupied, so `/workflow-next` skips it and claims the next free issue. If no free issue exists, startup stops with a no-unclaimed-work message instead of adopting the foreign lease.

Session id lifecycle:

- Claude Code: new startup, `/clear`, and normal exit/re-enter produce a fresh session id. `--continue`, `--resume`, and `/resume` keep the resumed session id. The plugin SessionStart hook persists that id as `KAOLA_SESSION_ID` for later Bash commands.
- Codex: fresh threads, `/clear`, `/new`, and `/fork` produce a fresh thread id. `/compact`, `/resume`, and `codex resume <SESSION_ID>` keep the same resumed thread id. Kaola uses `CODEX_THREAD_ID` when `KAOLA_SESSION_ID` is unset.

Use recovery/handoff only when a user intentionally switches a new session to continue a specific unfinished project. Recovery is never triggered implicitly by being in the same folder or by there being only one active workflow project. Normal handoff is blocked by live local Claude session history, an alive ticker PID, an unexpired lock, or a recent heartbeat; `--force-live-takeover` is reserved for explicit dangerous recovery.

**Backwards compatibility**: On every startup, an idempotent migrator (`migrateLegacyCoordState()`) runs to move coordination state from the legacy `<worktree>/kaola-workflow/` location to the shared coordRoot. No manual migration needed.

Cross-machine hardening ensures that only one session can hold an issue lease at a time, with automatic cleanup if a session becomes inactive. For full details, see `commands/workflow-next.md` "Startup Step 0" and "Co-active Leases".

## Updating

```bash
cd Kaola-Workflow
git pull
./install.sh
```
