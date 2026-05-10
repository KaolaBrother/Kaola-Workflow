# Claude Workflow

A 6-phase, Claude-native development workflow with per-phase file artifacts, multi-model orchestration, and full resumability across sessions and context resets.

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
/plugin marketplace add https://github.com/KaolaBrother/Claude-Workflow
/plugin install claude-workflow@kaolabrother-claude-workflow
/reload-plugins
```

If you previously used the manual installer, remove or update user-level command
files such as `~/.claude/commands/workflow-next.md` or the legacy
`~/.claude/commands/claude-workflow.md`; user-level commands can take
precedence over plugin commands.

Then run:

```text
/workflow-init
/workflow-next
```

### Manual command install

```bash
git clone https://github.com/KaolaBrother/Claude-Workflow.git
cd Claude-Workflow
./install.sh
```

Plugin uninstall:

```text
/plugin uninstall claude-workflow
```

Manual command uninstall:

```bash
./uninstall.sh
```

## Usage

Initialize each project once:

```
/workflow-init
```

This creates or updates a compact `CLAUDE.md`, `claude-workflow/ROADMAP.md`, and the baseline documentation map without replacing existing project guidance. The generated `CLAUDE.md` keeps commands, hard rules, workflow pointers, and documentation links in root memory while leaving long details in docs or skills.

In any Claude Code session, run:

```
/workflow-next
```

The command is a thin router. It first checks local/remote Git state, safely fast-forwards clean behind-only branches, and asks before risky synchronization such as diverged history, dirty worktrees with upstream changes, rebases, merges, stashes, resets, or conflicts. It then scans `claude-workflow/`, reads `workflow-state.md` when present, and routes to the right phase command:

```text
/claude-workflow-phase1
/claude-workflow-phase2
/claude-workflow-phase3
/claude-workflow-phase4
/claude-workflow-phase5
/claude-workflow-phase6
```

## GitHub Roadmap Cycle

Use a separate research or roadmap session to discover future work and create or refine GitHub issues. `/workflow-next` is the implementation cycle: it fetches open GitHub issues, mirrors active unfinished work into `claude-workflow/ROADMAP.md`, advances one selected item, then comments on or closes linked issues after validation.

The local roadmap is a working mirror, not the source of truth. Keep only active unfinished work there; completed workflow folders move to `claude-workflow/archive/`.

The workflow also enforces context discipline: `CLAUDE.md` targets under 200 lines, the local roadmap should not become history storage, and agent prompts should include only the relevant phase excerpts needed for the delegated task.

Each phase records a required-agent compliance ledger. Each active workflow also maintains `workflow-state.md`, which records the current phase, intra-phase step, next command, pending gates, and ownership rules. After resume or compaction, the main session must read that state file and the relevant compliance ledger before continuing.

Avoid redundant validation runs: Phase 4 uses targeted affected checks, Phase 5 validates only review fixes or cites existing evidence, and Phase 6 runs each full final command once against the final candidate state. Small targeted commands may run in the main session, while expensive or noisy test/lint/type/build commands should be delegated and summarized from cache evidence.

## ECC Hook Policy

ECC hooks are background hygiene, not workflow validation. They may format,
lint, or typecheck edited files automatically, but `/workflow-next` should not
rerun the same check unless the phase requires broader validation or relevant
files changed after the hook ran. Hook output counts as workflow evidence only
when recorded with command, scope, result, and evidence path.

For heavy Phase 4 implementation bursts or many subagents, use the lighter hook
profile:

```bash
ECC_HOOK_PROFILE=minimal claude
```

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

All phase files are written to `{project-root}/claude-workflow/{project-name}/` while active. Completed workflow folders are archived to `{project-root}/claude-workflow/archive/`. Active unfinished work is tracked in `{project-root}/claude-workflow/ROADMAP.md`.

## Resuming

Any interrupted session resumes from `workflow-state.md` first, then reconstructs from phase files if state is missing or stale. Phase 4 tracks `pending / in_progress / complete` per task in `phase4-progress.md`, and all phases record intra-phase checkpoints in `workflow-state.md`.

### State Bootstrap And Repair

When `/workflow-next` can reconstruct one safe next command from phase
artifacts, it repairs or creates `claude-workflow/{project}/workflow-state.md`
before routing by running `scripts/claude-workflow-repair-state.js` when the
helper is available. It does not create state for brand-new work, ambiguous
active projects, contradictory phase files, or unresolved compliance gates that
make the next command unsafe.

When installed as a Claude Code plugin, `hooks/hooks.json` injects a compact resume reminder after context compaction. Manual command install copies slash commands only; use plugin install when you want the compaction resume hook.

## Updating

```bash
cd Claude-Workflow
git pull
./install.sh
```
