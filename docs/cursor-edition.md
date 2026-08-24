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
| `agents/<name>.md` | `.cursor/agents/<name>.md` | Cursor agent frontmatter (`name`, `description`, an unquoted `model: grok-4.6[effort=medium]`, `model: grok-4.6[effort=high]`, or `model: grok-4.6[effort=xhigh]` derived from the canonical class, and `readonly`). Claude `tools:` (including MCP ids) are dropped. Descriptions that are not plain YAML scalars are JSON-quoted. Reviewer identity is a body comment block (`<!-- cursor-reviewer-identity:start|end -->`); `resolved_profile_hash` is re-stamped over the cursor bytes. |
| `commands/<file>.md` | `.cursor/commands/<file>.md` | Flat slash **command** (not a Skill — Skills lack `$ARGUMENTS`, and `workflow-init` uses `$ARGUMENTS`). `Agent(` dispatch cards become `Task(`. Install-time `model="{...}"` lines are stripped. `--runtime claude` becomes `--runtime cursor`. Script resolver points at `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts`. `argument-hint` is preserved. |
| `hooks/<script>.sh` | `.cursor/hooks/<script>.sh` | Dispatch-log is payload-adapted (`agent_type \|\| subagent_type`, `agent_id \|\| subagent_id`, `model \|\| subagent_model`). Adapted copies keep the shebang as line 1. Compact-context is wrapped as JSON `{additional_context}` for `sessionStart`. A second `sessionStart` wrapper runs `kaola-workflow-ensure-cursor-catalog.js` and prints `{}` so it does not emit `additional_context`. |
| mapping | `.cursor/hooks.json` | Cursor loads this path (not `hooks/hooks.json`). `sessionStart` (compact resume + catalog ensure) + `subagentStart`. Project-shaped commands use `.cursor/hooks/…`. A `--global` install rewrites that prefix to `./hooks/`. |

Generated agents carry a model-and-effort pin derived from the canonical agent
class. The canonical `sonnet`/`standard`, `opus`/`reasoning`, and `fable`/`heavy`
tokens remain the roster authority; generated frontmatter uses the raw, unquoted
`grok-4.6[effort=medium]`, `grok-4.6[effort=high]`, and
`grok-4.6[effort=xhigh]` values respectively.

## Three-tier frontmatter pins — model-free Task dispatch

The canonical `agents/*.md` model class is mapped at generation time: standard
(`sonnet`/`standard`) roles receive the unquoted
`model: grok-4.6[effort=medium]` line, reasoning (`opus`/`reasoning`) roles
receive `model: grok-4.6[effort=high]`, and heavy (`fable`/`heavy`) roles receive
the raw, unquoted `model: grok-4.6[effort=xhigh]`. Unknown class tokens fail
closed; the generator does not invent a fallback roster. Cursor's `Task` tool
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

Cursor CLI loads custom `Task` types from the **workspace** `.cursor/agents`,
not from `~/.cursor/agents`. The workspace catalog is refreshed from
`${CURSOR_HOME:-$HOME/.cursor}/agents`: all 14 canonical role files must be
byte-identical to that global tree; global is the source of truth (not git
toplevel). `sessionStart` runs an ensure wrapper that prints `{}`. `/workflow-next`
runs `kaola-workflow-ensure-cursor-catalog.js` via the same `kaola_script`
resolver as claim.js. Dest is always `<cwd>/.cursor/agents`. The script prints
one of `already-present` | `copied` | `missing-source` (exit 0 on the first two,
1 on `missing-source`). `already-present` means dest is in-sync (all 14
byte-identical) and a named omit-model `Task` may proceed; `copied` still
requires a cold start (new chat, then re-run `/workflow-next`); `missing-source`
means print `./install-cursor.sh --target "$PWD"` and do not name a Task type.
`--global` and `install-all.sh`'s default write
`${CURSOR_HOME}/{agents,commands}` (un-nested). That layout is not
dispatch-capable by itself unless the installer also dual-wrote the project
catalog because the process cwd was inside a git work tree. A worktree is a
cwd: do not point `agent --workspace` at `.kw/worktrees/<project>/` unless the
14 agent files already exist there **before** the session starts. After
materializing `.cursor/agents`, start a new chat; a mid-session copy does not
change this session's Task enum. Overlay source is
`templates/routing/init.skeleton.md` (runtime-neutral). `/workflow-init` is the
shared all-runtime bootstrapper; it does not carry Cursor spawn teaching or a
Cursor overlay freeze. Dispatch teaching is only `/workflow-next` and
`/kaola-workflow-finalize`.

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
2. **CLI envelope oracle.** Named omit-model Tasks on CLI resolve effort in the
   stream envelope (`cursor-grok-4.6-medium` vs `cursor-grok-4.6-high` vs
   `cursor-grok-4.6-xhigh`). That
   envelope is the measurement. Do not pass inherit, `cursor-grok-4.6-xhigh`,
   or any other per-call model to force it.
3. **IDE picker clamp.** The selected session Grok 4.6 / `selectedModels`
   picker may clamp children to one thinking variant. That is a typed
   deferral; do not add a `Task(model=)` workaround, and do not claim IDE
   children display distinct effort.
4. **IDE Task schema inherit default.** The schema lists inherit as the default
   for built-ins. For named Kaola types that default is a trap: omit the model
   argument anyway.
5. **Resume.** Never resume a Kaola subagent. Resume drops frontmatter effort.
   Fresh dispatch only; not a second pin path.
6. **Cloud vs local.** Cloud Agents may not load project hooks or fire
   `sessionStart` (so the catalog-ensure hook may not run there); the live IDE
   Task path remains the restricted path unless a later measurement for this
   edition shows otherwise. Durable resume remains `mission-list.md`.

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
  `kaola-workflow-ensure-cursor-catalog.js` is a Cursor-only extra: the installer
  copies and `--uninstall` removes it by name. It is **not** listed in
  `kaola-workflow-install-manifest.js`.

`--uninstall` removes only kaola-deployed names and strips kaola entries from
`hooks.json`. It never deletes the user's `hooks.json` file. A subsequent bare
install redeploys the edition.

## Hooks

Cursor's hook model is a JSON mapping at `.cursor/hooks.json` (project) or
`~/.cursor/hooks.json` (global). Payloads use `subagent_type` / `subagent_id` /
`subagent_model`. This edition ships a payload-adapted dispatch-log, a compact wrapper, and a
catalog-ensure wrapper. Compact resume and catalog materialize are different
jobs. The ensure wrapper prints `{}` so it does not clobber compact-resume.
Both sessionStart commands use a 5s timeout. All are fail-open.

| Event | Claude payload | Cursor payload | Adaptation |
| --- | --- | --- | --- |
| `subagentStart` | `agent_type` / `agent_id` | `subagent_type` / `subagent_id` | dispatch-log accepts `agent_type \|\| subagent_type` and `agent_id \|\| subagent_id` |
| `sessionStart` resume | compact stdout injected after compact | `additional_context` JSON, new session only | wrapper turns compact-context.js stdout into `{additional_context}`. `preCompact` cannot inject — declared as `session_start_resume_injection`. Durable resume is `mission-list.md`. |
| `sessionStart` catalog | n/a | wrapper stdout is `{}` | `kaola-workflow-ensure-cursor-catalog.sh` copies the 14 canon roles from `$CURSOR_HOME/agents` into `<cwd>/.cursor/agents`. Mid-session copy still needs a new chat. |
