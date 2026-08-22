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
| `agents/<name>.md` | `.cursor/agents/<name>.md` | Cursor agent frontmatter (`name`, `description`, an unquoted `model: grok-4.6[effort=medium]` or `model: grok-4.6[effort=high]` derived from the canonical class, and `readonly`). Claude `tools:` (including MCP ids) are dropped. Descriptions that are not plain YAML scalars are JSON-quoted. Reviewer identity is a body comment block (`<!-- cursor-reviewer-identity:start|end -->`); `resolved_profile_hash` is re-stamped over the cursor bytes. |
| `commands/<file>.md` | `.cursor/commands/<file>.md` | Flat slash **command** (not a Skill — Skills lack `$ARGUMENTS`, and `workflow-init` uses `$ARGUMENTS`). `Agent(` dispatch cards become `Task(`. Install-time `model="{...}"` lines are stripped. `--runtime claude` becomes `--runtime cursor`. Script resolver points at `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts`. `argument-hint` is preserved. |
| `hooks/<script>.sh` | `.cursor/hooks/<script>.sh` | Dispatch-log is payload-adapted (`agent_type \|\| subagent_type`, `agent_id \|\| subagent_id`, `model \|\| subagent_model`). Adapted copies keep the shebang as line 1. Compact-context is wrapped as JSON `{additional_context}` for `sessionStart`. |
| mapping | `.cursor/hooks.json` | Cursor loads this path (not `hooks/hooks.json`). `sessionStart` + `subagentStart`. Project-shaped commands use `.cursor/hooks/…`. A `--global` install rewrites that prefix to `./hooks/`. |

Generated agents carry a model-and-effort pin derived from the canonical agent
class. The canonical `sonnet`/`standard` and `opus`/`reasoning` tokens remain the
roster authority; generated frontmatter uses the raw, unquoted
`grok-4.6[effort=medium]` and `grok-4.6[effort=high]` values respectively.

## Tiered frontmatter pins — model-free Task dispatch

The canonical `agents/*.md` model class is mapped at generation time: standard
(`sonnet`/`standard`) roles receive the unquoted
`model: grok-4.6[effort=medium]` line, and reasoning (`opus`/`reasoning`)
roles receive `model: grok-4.6[effort=high]`. Unknown class tokens fail closed;
the generator does not invent a fallback roster. Cursor's `Task` tool accepts
an optional `model` but has no separate effort field, so generated command cards
omit `model` and the child takes the model from its custom-agent frontmatter.

Cursor CLI loads custom `Task` types from the **workspace** `.cursor/agents`,
not from `~/.cursor/agents`. `--global` and `install-all.sh`'s default write
`${CURSOR_HOME}/{agents,commands}` (un-nested). That layout is not
dispatch-capable by itself unless the installer also dual-wrote the project
catalog because the process cwd was inside a git work tree. A worktree is a
cwd: do not point `agent --workspace` at `.kw/worktrees/<project>/` unless the
14 agent files already exist there **before** the session starts. After
materializing `.cursor/agents`, start a new chat; a mid-session copy does not
change this session's Task enum.

**Declared runtime divergences.** The declarations are the
`frontmatter_tier_pin` and `session_start_resume_injection` entries in the
`CURSOR_RUNTIME_NATIVE` table in `scripts/test-cursor-edition.js`. The suite
asserts each entry exists, that its reason states the fact, and that the
generated tree matches it — the two raw frontmatter pins above, no separate
`effort:` / `reasoning_effort:` field, no per-call `model=` override; compact
resume injects via `sessionStart` `additional_context` because `preCompact`
cannot inject into the agent.

### Runtime limits

These are Cursor product limits, not alternate pin paths:

1. **Cold start.** Agent files can be loaded at session start. After install or
   sync, use a new chat for close evidence; a mid-session edit is inconclusive.
2. **One-family picker clamp.** Cursor may expose one Grok thinking variant per
   picker family. If a fresh session still runs both classes at the saved
   variant, record a typed deferral; do not add a `Task(model=)` workaround.
3. **Resume.** Resuming a subagent can drop the frontmatter effort and return to
   the picker. Use a fresh dispatch for cost control, not a second pin path.
4. **Cloud vs local.** Cloud Agents may not load project hooks or fire
   `sessionStart`; the live IDE Task path remains the restricted path unless a
   later measurement for this edition shows otherwise. Durable resume remains
   `mission-list.md`.

No config seeding, inline model override, or second pin path is added for these
limits.

## Path selection

On the cursor edition, the router routes directly to the adaptive workflow. The
canonical `## Agent Model Dispatch` section is substituted at generation time
for the model-free Task guidance above; canonical `commands/*.md` is never
touched.

## Installer

`install-cursor.sh` is a standalone installer — it has its own `--forge` flag and
does not run through `install.sh --forge`.

> The Cursor runtime is also covered by the top-level **`./install-all.sh`**
> ("install/refresh every runtime" — see [README](../README.md#installation)),
> which invokes this installer unchanged (`--global` by default) as the sixth
> leg of its six-runtime sequence, with a per-runtime PASS/FAIL summary. `--global`
> alone does not populate the workspace Task catalog unless cwd is a git work
> tree and the dual-write lands `<toplevel>/.cursor/agents`. It stays a thin
> orchestrator — it does **not** fold Cursor into
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
  If the installer cwd is inside a git work tree, the same agents and commands are
  also written to `$(git rev-parse --show-toplevel)/.cursor/{agents,commands}`
  (Task types are workspace-scoped). `--global` from a directory with no git
  toplevel does not invent a project `.cursor/` tree.
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
