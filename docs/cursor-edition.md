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

Cursor reads root and nested `AGENTS.md` directly, combining parent guidance with more-specific
instructions. Kaola installs no project-instruction bridge for Cursor. Generated agent frontmatter,
workspace catalog rules, and hooks are Cursor adapter data, not a copy of the universal contract.
See [runtime capabilities](runtime-capabilities.md#cursor) for first-party evidence and limits.

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
| `templates/agents/behavior-contracts.json` + Cursor adapter | `.cursor/agents/<name>.md` | 14 native profiles with `name`, `description`, intent-mapped `model: grok-4.6[effort=…]`, capability-derived `readonly`, shared behavior identity, and render-specific hash |
| `commands/<file>.md` | `.cursor/commands/<file>.md` | Flat slash **command** (not a Skill — Skills lack `$ARGUMENTS`, and `workflow-init` uses `$ARGUMENTS`). `Agent(` dispatch cards become `Task(`. Install-time `model="{...}"` lines are stripped. `--runtime claude` becomes `--runtime cursor`. Script resolver points at `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts`. `argument-hint` is preserved. |
| `hooks/<script>.sh` | `.cursor/hooks/<script>.sh` | No runtime-neutral dispatch hook is installed. Compact-context is wrapped as JSON `{additional_context}` for `sessionStart`. A second `sessionStart` wrapper runs `kaola-workflow-ensure-cursor-catalog.js` and prints `{}` so it does not emit `additional_context`. |
| mapping | `.cursor/hooks.json` | Cursor loads this path (not `hooks/hooks.json`). `sessionStart` (compact resume + catalog ensure) only. Project-shaped commands use `.cursor/hooks/…`. A `--global` install rewrites that prefix to `./hooks/`. |

Generated agents carry a model-and-effort pin derived from the runtime-neutral intent class.
`standard`, `reasoning`, and `heavy` are the behavior-source values; only the Cursor adapter maps
them to the raw, unquoted `grok-4.6[effort=medium]`, `grok-4.6[effort=high]`, and
`grok-4.6[effort=xhigh]` frontmatter values.

## Three-tier frontmatter pins — model-free Task dispatch

The behavior source's `standard` roles receive the unquoted
`model: grok-4.6[effort=medium]` line, `reasoning` roles receive
`model: grok-4.6[effort=high]`, and `heavy` roles receive the raw, unquoted
`model: grok-4.6[effort=xhigh]`. Unknown intent tokens fail closed; the generator does not invent a
fallback roster. Cursor's `Task` tool
accepts an optional `model` but has no separate effort field, so generated
command cards omit `model`.

Reliable IDE and CLI dispatch is one wording, embedded in `/workflow-next` and
`/kaola-workflow-finalize`. `/workflow-init` is the shared all-runtime
bootstrapper; it does not carry Cursor spawn teaching or a Cursor overlay freeze.
Overlay source is `templates/routing/init.skeleton.md` (runtime-neutral).
Dispatch teaching is only `/workflow-next` and `/kaola-workflow-finalize`. Named
dispatch is `Task` with
`subagent_type: "<role>"` only; do not substitute `generalPurpose` plus a
prompt costume. Omit per-call model, including `inherit` — do not pass inherit.
The IDE Task schema lists inherit as the default; that default is for built-ins.
For named Kaola types, omit anyway; do not pass inherit to satisfy the schema.
Do not pass `cursor-grok-4.6-xhigh` as the Task model. Never resume a Kaola
subagent; fresh dispatch only (resume drops frontmatter effort). The Task prompt
is the mission and locator; do not paste the role contract onto a named type.

Two guarantees, and no second pin path:

- **(A) Role.** Dispatch is the workspace catalog plus the named type.
- **(B) Effort.** The CLI stream envelope is the oracle
  (`cursor-grok-4.6-medium` vs `cursor-grok-4.6-high` vs `cursor-grok-4.6-xhigh`). The IDE picker clamp
  (selected session Grok 4.6 / `selectedModels`) is a typed deferral; do not
  add a `Task(model=)` workaround. Do not claim IDE children display distinct
  effort.

Generated command surfaces preserve the reviewer scope-and-acceptance packet but
omit Claude's one-bounded reviewer heavy re-dispatch. Cursor's `Task` dispatch
has no documented per-call effort override; reviewer behavior therefore follows
the static generated frontmatter pin.

All 14 role bodies come from `templates/agents/behavior-contracts.json` through
`generate-agent-profiles.js`; `sync-cursor-edition.js` requests Cursor renders and owns only edition
layout, commands, hooks, and install packaging. Reviewer roles have no separate source or transform.

Cursor officially discovers custom profiles from both project `.cursor/agents/` and user
`~/.cursor/agents/`; project definitions win on a name conflict. Kaola's project install writes the
project location and `--global` writes `${CURSOR_HOME:-$HOME/.cursor}/agents/` directly. A global
install made while the current directory is inside a git work tree also mirrors the roster to that
project. The catalog-ensure hook and `kaola-workflow-ensure-cursor-catalog.js` keep this optional
mirror byte-aligned; they are convergence helpers, not evidence that Cursor lacks its documented
user-profile carrier.

The official model contract is likewise bounded: `model` is either `inherit` or an exact model ID,
and bracket parameters carry options such as effort. Team policy, legacy-plan settings, or plan
availability may force a compatible fallback. Generated Task cards therefore name the role and omit
a per-call model; the profile remains the one model/effort carrier. Current official documentation
also allows two child levels (main → child → grandchild), with no deeper spawn.

Compact resume and catalog synchronization remain edition hook behavior. Durable recovery never
depends on either hook: `mission-list.md` is the authority after a new local, CLI, or cloud session.

## Path selection

On the cursor edition, the router routes directly to the adaptive workflow. Generated commands
adapt the dispatch call syntax and omit per-call model arguments; canonical `commands/*.md` is
never touched. There is no canonical model-dispatch section to substitute.

## Installer

`install-cursor.sh` is a standalone installer — it has its own `--forge` flag and
does not run through `install.sh --forge`.

> The Cursor runtime is also covered by the top-level **`./install-all.sh`**
> ("install/refresh every runtime" — see [README](../README.md#installation)),
> which invokes this installer unchanged (`--global` by default) as the sixth
> leg of its seven-runtime sequence, with a per-runtime PASS/FAIL summary. The user-scope
> `$CURSOR_HOME/agents` carrier is native; when cwd is a git work tree the installer also
> materializes `<toplevel>/.cursor/agents` for a project-local, precedence-winning mirror. It stays a thin
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
  as a project-local mirror. `--global` from a directory with no git toplevel does not invent a
  project `.cursor/` tree; the documented user carrier remains available.
- Support scripts always land under
  `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/{scripts,hooks}`.
  `kaola-workflow-ensure-cursor-catalog.js` is a Cursor-only extra: the installer
  copies and `--uninstall` removes it by name. It is **not** listed in
  `kaola-workflow-install-manifest.js`.

`--uninstall` removes only kaola-deployed names and strips kaola entries from
`hooks.json`. It never deletes the user's `hooks.json` file. A subsequent bare
install redeploys the edition.

## Hooks

Cursor's hook model is a JSON mapping at `.cursor/hooks.json` (project) or
`~/.cursor/hooks.json` (global). This edition ships a compact wrapper and a
catalog-ensure wrapper. Compact resume and catalog materialize are different
jobs. The ensure wrapper prints `{}` so it does not clobber compact-resume.
Both sessionStart commands use a 5s timeout. All are fail-open.

| Event | Claude payload | Cursor payload | Adaptation |
| --- | --- | --- | --- |
| `sessionStart` resume | compact stdout injected after compact | `additional_context` JSON, new session only | wrapper turns compact-context.js stdout into `{additional_context}`. `preCompact` cannot inject — declared as `session_start_resume_injection`. Durable resume is `mission-list.md`. |
| `sessionStart` catalog | n/a | wrapper stdout is `{}` | `kaola-workflow-ensure-cursor-catalog.sh` copies the 14 canon roles from `$CURSOR_HOME/agents` into `<cwd>/.cursor/agents`. Mid-session copy still needs a new chat. |
