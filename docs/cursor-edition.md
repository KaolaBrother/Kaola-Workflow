# Kaola-Workflow · cursor Edition

The cursor edition makes Kaola-Workflow runnable from
[Cursor](https://cursor.com), the same way the Grok edition makes it runnable
from Grok CLI. Cursor is a coding-agent **runtime** (like Codex, opencode, Kimi,
and Grok), not a git forge, so this edition is delivered the Cursor-native way —
named **agents** under a generated `.cursor/agents/` tree, flat
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
| `commands/<file>.md` | `.cursor/commands/<file>.md` | Flat slash **command** (not a Skill — Skills lack `$ARGUMENTS`, and `workflow-init` uses `$ARGUMENTS`). The marked next/finalize block becomes Cursor-native profile, live-schema/catalog, tier, route, and limit guidance; any concrete Claude dispatch cards are adapted. `--runtime claude` becomes `--runtime cursor`. Script resolver points at `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts`. `argument-hint` is preserved. |
| `hooks/<script>.sh` | `.cursor/hooks/<script>.sh` | No runtime-neutral dispatch hook is installed. Compact-context is wrapped as JSON `{additional_context}` for `sessionStart`. A second `sessionStart` wrapper runs `kaola-workflow-ensure-cursor-catalog.js` and prints `{}` so it does not emit `additional_context`. |
| mapping | `.cursor/hooks.json` | Cursor loads this path (not `hooks/hooks.json`). `sessionStart` (compact resume + catalog ensure) only. Project-shaped commands use `.cursor/hooks/…`. A `--global` install rewrites that prefix to `./hooks/`. |

Generated agents carry a model-and-effort pin derived from the runtime-neutral intent class.
`standard`, `reasoning`, and `heavy` are the behavior-source values; only the Cursor adapter maps
them to the raw, unquoted `grok-4.6[effort=medium]`, `grok-4.6[effort=high]`, and
`grok-4.6[effort=xhigh]` frontmatter values.

## Three-tier frontmatter pins — model-free native dispatch

The behavior source's `standard` roles receive the unquoted
`model: grok-4.6[effort=medium]` line, `reasoning` roles receive
`model: grok-4.6[effort=high]`, and `heavy` roles receive the raw, unquoted
`model: grok-4.6[effort=xhigh]`. Unknown intent tokens fail closed; the generator does not invent a
fallback roster. Generated dispatch guidance omits a per-call model, leaving the named profile as
the model/effort carrier rather than guessing at an unpublished portable Task request schema.

Runtime-native dispatch guidance is embedded only in `/workflow-next` and
`/kaola-workflow-finalize`; `/workflow-init` remains the shared bootstrapper. A custom profile may
be selected explicitly as `/<role>` or through Cursor's natural-language routing. If the current
session exposes a Task call and named catalog, that live schema is the authority; public
documentation does not establish one portable JSON call schema, so Kaola does not invent fields.
The profile remains the model/effort carrier and the call omits a per-call model.

The same guidance exposes Cursor's host-dependent native alternatives rather than assuming one role
miss ends all dispatch. IDE documentation describes scoped `Explore`, `Bash`, and `Browser`. The
supported Cursor CLI probe below instead exposed writable `generalPurpose` plus specialist and
project custom types, and did not expose those scoped types. The live catalog wins. A generic or
specialist child remains itself and is never prompted to impersonate `implementer`, `tdd-guide`, or
another custody-bearing role. Explicit, automatic, parallel, and resume-by-agent-ID paths remain
runtime-owned options.

For each mission item, use the exact custom route when present, otherwise use a catalog route only
when its actual task, custody, evidence, and stop boundaries fit. Inline that item when no
adequate route exists, record the specific capability gap, and re-evaluate the next item. A cohesive
production owner does not absorb independent research, test authorship, documentation, or review.

### Supported CLI live probe

On 2026-08-27, the locally authenticated Cursor CLI `2026.08.11-e8db854` was exercised against a
disposable project install. This is runtime evidence for the supported CLI, not a claim about every
Cursor host:

- The Task catalog exposed `generalPurpose`, `cursor-guide`, `bugbot`, `security-review`,
  `best-of-n-runner`, and all 14 project Kaola roles. It did not expose
  `Explore`/`Bash`/`Browser` in that host.
- `generalPurpose` appeared as `subagentType.unspecified` and wrote a probe file successfully. It is
  therefore a real writable generic fallback on this CLI, under its own identity.
- Exact `tdd-guide`, `adversarial-verifier`, and `planner` dispatches resolved to
  `cursor-grok-4.6-medium`, `cursor-grok-4.6-high`, and `cursor-grok-4.6-xhigh` respectively.
- Parallel Task dispatch succeeded; explicit/automatic selection and resume by agent ID remain
  runtime-owned options rather than Kaola requirements.
- A direct child dispatched `tdd-guide`; a grandchild had no Task tool. The measured bound is one
  descendant dispatch generation.
- A user `~/.cursor/agents/tdd-guide.md` file alone was not visible in an empty project. Project
  `.cursor/agents/` materialization was the measured reachable carrier.
- After adding a project profile, reopening the CLI process with the **same chat ID** exposed it.
  Same-process hot load remains unknown; a new chat is not required by this measurement.

All 14 role bodies come from `templates/agents/behavior-contracts.json` through
`generate-agent-profiles.js`; `sync-cursor-edition.js` requests Cursor renders and owns only edition
layout, commands, hooks, and install packaging. Reviewer roles have no separate source or transform.

Cursor documents custom profiles at project `.cursor/agents/` and user `~/.cursor/agents/`, with
project definitions winning a conflict. Kaola's project install writes the project location and
`--global` writes `${CURSOR_HOME:-$HOME/.cursor}/agents/` directly. A global install made while the
current directory is inside a git work tree also mirrors the roster to that project. The mirror is
not merely optional compatibility for the supported CLI: the live probe reached project profiles
and did not reach a user file alone. The catalog-ensure hook and
`kaola-workflow-ensure-cursor-catalog.js` keep the project catalog byte-aligned.

The official model contract is likewise bounded: `model` is either `inherit` or an exact model ID,
and bracket parameters carry options such as effort. Team policy, legacy-plan settings, or plan
availability may force a compatible fallback. Generated dispatch guidance therefore omits a
per-call model; the profile remains the one model/effort carrier.

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
> leg of its seven-runtime sequence, with a per-runtime PASS/FAIL summary. The installer writes the
> documented user scope and, when cwd is a git work tree, materializes
> `<toplevel>/.cursor/agents` as the precedence-winning, live-proven CLI catalog. It stays a thin
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
  project `.cursor/` tree; the documented user carrier is still written, but its files alone were
  not catalog-visible in the measured supported CLI.
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
| `sessionStart` catalog | n/a | wrapper stdout is `{}` | `kaola-workflow-ensure-cursor-catalog.sh` copies the 14 canon roles from `$CURSOR_HOME/agents` into `<cwd>/.cursor/agents`. A new CLI process with the same chat was sufficient in the live probe; same-process hot load is unknown. |
