# Kaola-Workflow · cursor Edition

The cursor edition makes Kaola-Workflow runnable from
[Cursor](https://cursor.com), the same way the Grok edition makes it runnable
from Grok CLI. Cursor is a coding-agent **runtime** (like Codex, opencode, Kimi,
and Grok), not a git forge, so this edition is delivered the Cursor-native way —
named **agents** under a generated `.cursor/agents/` tree (`Task` types), flat
slash **commands** under `.cursor/commands/`, hook scripts under `.cursor/hooks/`,
and a merged `.cursor/hooks.json` — and is fully **additive**: it touches none of
the existing `claude`/`codex`/`gitlab`/`gitea`/`opencode`/`kimi`/`grok` edition
machinery.

Cursor Cloud Agents may not fire `sessionStart` and may not load project hooks.
That gap is declared, not papered over; durable resume stays `mission-list.md`.

## Forge axis

The runtime is not a forge, but the workflow *prose* is forge-shaped (`gh` vs
`glab` vs `tea`, pull requests vs merge requests, per-forge support-script
basenames), so `install-cursor.sh` takes `--forge=github|gitlab|gitea` (default
`github`) and a GitLab/Gitea project receives a forge-correct edition rather
than GitHub-shaped commands.

The forge variants are **generated, never hand-ported**. `sync-cursor-edition.js`
renders each forge from the routing-surface registry
(`scripts/generate-routing-surfaces.js`, via `scripts/runtime-edition-forge.js`).
github renders the bare `.cursor/` tree; a forge renders the sibling
`.cursor-<forge>/`. All generated trees are gitignored build artifacts. The
installer copies a forge tree **into live `.cursor/`** — Cursor does not scan
`.cursor-gitlab/`.

```bash
./install-cursor.sh --forge=gitlab            # GitLab-shaped edition
node scripts/sync-cursor-edition.js --forge=gitea --check
```

**Additive is unchanged by this.** Being additive is about edition *machinery*,
not forge support: the edition stays out of `npm test`, `edition-sync.js`,
`install.sh`, and the routing-surface `--check` contract, and keeps its own
suite. The mandated `generate-routing-surfaces.js --write` still refreshes a
tree that already exists, and creates none. An unknown `--forge` value is
refused, never silently defaulted to github.

## What gets generated

Everything under `.cursor/` is **generated from canonical** by
`scripts/sync-cursor-edition.js` and parity-checked by
`scripts/test-cursor-edition.js`:

| Canonical source | cursor edition output | Notes |
| ---------------- | --------------------- | ----- |
| `agents/<name>.md` | `.cursor/agents/<name>.md` | Cursor agent frontmatter (`name`, `description`, `model: inherit`, `readonly`). Claude `tools:` (including MCP ids) are dropped. Descriptions that are not plain YAML scalars are JSON-quoted. Reviewer identity is a body comment block (`<!-- cursor-reviewer-identity:start|end -->`); `resolved_profile_hash` is re-stamped over the cursor bytes. |
| `commands/<file>.md` | `.cursor/commands/<file>.md` | Flat slash **command** (not a Skill — Skills lack `$ARGUMENTS`, and `workflow-init` uses `$ARGUMENTS`). `Agent(` dispatch cards become `Task(`. Install-time `model="{...}"` lines are stripped. `--runtime claude` becomes `--runtime cursor`. Script resolver points at `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts`. `argument-hint` is preserved. |
| `hooks/<script>.sh` | `.cursor/hooks/<script>.sh` | Dispatch-log is payload-adapted (`agent_type \|\| subagent_type`, `agent_id \|\| subagent_id`, `model \|\| subagent_model`). Compact-context is wrapped as JSON `{additional_context}` for `sessionStart`. |
| mapping | `.cursor/hooks.json` | Cursor loads this path (not `hooks/hooks.json`). `sessionStart` + `subagentStart`. Project-shaped commands use `.cursor/hooks/…`. A `--global` install rewrites that prefix to `./hooks/`. |

Generated agents are deliberately model-agnostic.

## One model tier — every subagent inherits the session

There is **no Reasoning/Standard two-tier mapping** on Cursor. `opus` / `sonnet` on
canonical `agents/*.md` are portable class tokens, not spawn arguments. Cursor's
`Task` tool accepts an optional `model` and **no effort**; generated surfaces omit
both. To make every dispatched role think harder, raise the **session** effort.

**Declared runtime divergences.** The declarations are the
`inherit_session_model` and `session_start_resume_injection` entries in the
`CURSOR_RUNTIME_NATIVE` table in `scripts/test-cursor-edition.js`. The suite
asserts each entry exists, that its reason states the fact, and that the
generated tree matches it — `model: inherit` on every agent, no `effort:` /
`reasoning_effort:` field, no per-call `model=` override; compact resume injects
via `sessionStart` `additional_context` because `preCompact` cannot inject into
the agent.

An opt-in pin that routes the reasoning-class roster to a different *model* is
not part of this edition's first close.

## Path selection

On the cursor edition, the router routes directly to the adaptive workflow. The
canonical `## Agent Model Dispatch` section is substituted at generation time
for the inherit block above; canonical `commands/*.md` is never touched.

## Installer

`install-cursor.sh` is a standalone installer — it has its own `--forge` flag and
does not run through `install.sh --forge`.

> The Cursor runtime is also covered by the top-level **`./install-all.sh`**
> ("install/refresh every runtime" — see [README](../README.md#installation)),
> which invokes this installer unchanged (`--global` by default) as the sixth
> leg of its six-runtime sequence, with a per-runtime PASS/FAIL summary. It stays
> a thin orchestrator — it does **not** fold Cursor into
> `install.sh`/`edition-sync.js`/`npm test`.

```bash
./install-cursor.sh                         # deploy into the current project (.cursor/{agents,commands})
./install-cursor.sh --target /path/to/repo  # deploy into a specific project
./install-cursor.sh --global                # agents+commands → ${CURSOR_HOME:-~/.cursor}
./install-cursor.sh --regenerate            # refresh in-repo .cursor/ from canonical, then exit
./install-cursor.sh --uninstall             # remove the kaola-deployed edition
```

Add `--yes` for non-interactive use. `--no-scripts` skips support scripts, hook
scripts, and the hooks JSON merge. The installer resolves the generated source
tree via `node scripts/sync-cursor-edition.js --print-tree-root` (a worktree
install still finds the main-checkout trees).

- **PROJECT** (`--target` / `$PWD`): agents and commands land under
  `<project>/.cursor/{agents,commands}`. Hook scripts land under
  `<project>/.cursor/hooks/` and mapping is **merged** into
  `<project>/.cursor/hooks.json` (other events, e.g. `beforeShellExecution`, stay).
  A project install does **not** merge into `~/.cursor/hooks.json` — Cursor has
  project-scoped hooks.
- **GLOBAL** (`--global`): they land under `${CURSOR_HOME:-$HOME/.cursor}/{agents,commands}`
  with **no** nested `.cursor/` directory. Mapping is merged into
  `${CURSOR_HOME:-$HOME/.cursor}/hooks.json` with command paths rewritten to `./hooks/`.
- Support scripts always land under
  `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/{scripts,hooks}`.

`--uninstall` removes only kaola-deployed names and strips kaola entries from
`hooks.json`. It never deletes the user's `hooks.json` file. A subsequent bare
install redeploys the edition.

## Hooks

Cursor's hook model is a JSON mapping at `.cursor/hooks.json` (project) or
`~/.cursor/hooks.json` (global). Payloads use `subagent_type` / `subagent_id` /
`subagent_model`. This edition ships a payload-adapted dispatch-log plus a
compact wrapper. Both are fail-open.

| Event | Claude payload | Cursor payload | Adaptation |
| --- | --- | --- | --- |
| `subagentStart` | `agent_type` / `agent_id` | `subagent_type` / `subagent_id` | dispatch-log accepts `agent_type \|\| subagent_type` and `agent_id \|\| subagent_id` |
| `sessionStart` resume | compact stdout injected after compact | `additional_context` JSON, new session only | wrapper turns compact-context.js stdout into `{additional_context}`. `preCompact` cannot inject — declared as `session_start_resume_injection`. Durable resume is `mission-list.md`. |
