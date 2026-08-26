# Kaola-Workflow · grok Edition

The grok edition makes Kaola-Workflow runnable from
[Grok CLI](https://grok.com) (Grok Build TUI), the same way the opencode edition
makes it runnable from opencode. Grok CLI is a coding-agent **runtime** (like
Codex, opencode, and Kimi), not a git forge, so this edition is delivered the
Grok-native way — named **agents** under a generated `.grok/agents/` tree, flat
slash **commands** under `.grok/commands/`, and a hooks JSON file Grok loads
from its hooks dir — and is fully **additive**: it touches none of the existing
`claude`/`codex`/`gitlab`/`gitea`/`opencode`/`kimi` edition machinery.

## Forge axis

The runtime is not a forge, but the workflow *prose* is forge-shaped (`gh` vs
`glab` vs `tea`, pull requests vs merge requests, per-forge support-script
basenames), so `install-grok.sh` takes `--forge=github|gitlab|gitea` (default
`github`) and a GitLab/Gitea project receives a forge-correct edition rather
than GitHub-shaped commands.

The forge variants are **generated, never hand-ported**. `sync-grok-edition.js`
renders each forge from the routing-surface registry
(`scripts/generate-routing-surfaces.js`, via `scripts/runtime-edition-forge.js`).
github renders the bare `.grok/` tree; a forge renders the sibling
`.grok-<forge>/`. All generated trees are gitignored build artifacts.

```bash
./install-grok.sh --forge=gitlab            # GitLab-shaped edition
node scripts/sync-grok-edition.js --forge=gitea --check
```

**Additive is unchanged by this.** Being additive is about edition *machinery*,
not forge support: the edition stays out of `npm test`, `edition-sync.js`,
`install.sh`, and the routing-surface `--check` contract, and keeps its own
suite. The mandated `generate-routing-surfaces.js --write` still refreshes a
tree that already exists, and creates none. An unknown `--forge` value is
refused, never silently defaulted to github.

## What gets generated

Everything under `.grok/` is **generated from canonical** by
`scripts/sync-grok-edition.js` and parity-checked by
`scripts/test-grok-edition.js`:

| Canonical source | grok edition output | Notes |
| ---------------- | ------------------- | ----- |
| `agents/<name>.md` | `.grok/agents/<name>.md` | Grok agent frontmatter (`name`, `description`, `prompt_mode`, `model: inherit`, tier-derived `effort: medium|high|xhigh`, `permission_mode`, `agents_md`). The generator maps canonical `sonnet`/`standard` classes to `medium`, `opus`/`reasoning` classes to `high`, and `fable`/`heavy` classes to `xhigh`. Claude `tools:` (including MCP ids) are dropped so Grok will load the role. Descriptions that are not plain YAML scalars are JSON-quoted — an unquoted colon in `knowledge-lookup`'s description made Grok silently skip the file. Reviewer identity is a body comment block; `resolved_profile_hash` is re-stamped over the grok bytes. |
| `commands/<file>.md` | `.grok/commands/<file>.md` | Flat slash command. `Agent(` dispatch cards become `spawn_subagent(`. Install-time `model="{...}"` lines are stripped. `--runtime claude` becomes `--runtime grok`. Script resolver points at `${GROK_HOME:-$HOME/.grok}/kaola-workflow/scripts`. |
| `hooks/<script>.sh` | `.grok/hooks/<script>.sh` | No runtime-neutral dispatch hook is installed; the generator retains ownership of this directory for stale-artifact cleanup. |
| `hooks/hooks.json` (mapping) | `.grok/hooks/hooks.json` | SessionStart `compact` only. Commands use `${GROK_HOME:-$HOME/.grok}` (Grok expands this). The installer copies the file to `${GROK_HOME:-$HOME/.grok}/hooks/kaola-workflow-hooks.json`, and on a project install also to `<project>/.grok/hooks/hooks.json`. |

Generated agents are deliberately model-agnostic. Regenerating the tree never
overwrites a user's `[subagents.models]` or `[subagents.roles.*]` in
`$GROK_HOME/config.toml`.

## Three effort tiers — every subagent inherits the session model

Generated agents remain model-inheriting: every frontmatter keeps `model: inherit`, so
the session supplies the model. The existing canonical class token also binds the
runtime effort: standard (`sonnet`, or its `standard` alias) emits `effort: medium`,
reasoning (`opus`, or its `reasoning` alias) emits `effort: high`, and heavy (`fable`,
or its `heavy` alias) emits `effort: xhigh`. Tier membership is unchanged and the
canonical tokens remain vendor-neutral.

`spawn_subagent` has no effort parameter, so effort belongs on each generated
`.grok/agents/<role>.md`. Command cards continue to omit `model=`; they name only
`subagent_type`, and the child inherits the parent session's model. User
`$GROK_HOME/config.toml` is not seeded or rewritten.

**Declared runtime divergence.** The `tiered_effort_pin` entry in the
`GROK_RUNTIME_NATIVE` table in `scripts/test-grok-edition.js` declares the
effort tiers. Independently, the suite asserts that every generated agent
retains `model: inherit`, emits the effort for its canonical class
(`medium` for standard, `high` for reasoning, and `xhigh` for heavy), and that
command cards carry no per-call `model=` override.

The #1018 live probe verified that a generated `effort: xhigh` planner reaches a
child at `reasoning_effort: xhigh` on Grok CLI 1.0.5. Generated command surfaces
preserve the reviewer scope-and-acceptance packet but omit Claude's one-bounded
reviewer heavy re-dispatch: `spawn_subagent` has no per-call effort override, so
Grok reviewers remain on their static generated effort.

**Observed Grok CLI 1.0.5 limitation.** The live close probe passed with the
actual `tdd-guide` at `medium` and `code-reviewer` at `high` from an `xhigh`
parent. Three A/B legs using the literal `implementer` name still recorded
`high`, even when its native profile or a minimal inline definition pinned
`model: inherit` plus `effort: medium`. This is a runtime limitation/inference,
not a generator failure: the generator emits `effort: medium` correctly. No
config seeding, per-call override, or second pin path is added.

An opt-in pin that routes the reasoning-class roster to a different *model* is
recorded on #1008 and is not part of this edition's first close.

## Path selection

On the grok edition, the router routes directly to the adaptive workflow. Generated commands adapt
the dispatch call syntax and omit per-call model arguments; canonical `commands/*.md` is never
touched. There is no canonical model-dispatch section to substitute.

## Installer

`install-grok.sh` is a standalone installer — it has its own `--forge` flag and
does not run through `install.sh --forge`.

> The Grok runtime is also covered by the top-level **`./install-all.sh`**
> ("install/refresh every runtime" — see [README](../README.md#installation)),
> which invokes this installer unchanged (`--global` by default) as the fifth
> leg of its seven-runtime sequence, with a per-runtime PASS/FAIL summary. It stays
> a thin orchestrator — it does **not** fold Grok into
> `install.sh`/`edition-sync.js`/`npm test`.

```bash
./install-grok.sh                         # deploy into the current project (.grok/{agents,commands})
./install-grok.sh --target /path/to/repo  # deploy into a specific project
./install-grok.sh --global                # agents+commands → ${GROK_HOME:-~/.grok}
./install-grok.sh --regenerate            # refresh in-repo .grok/ from canonical, then exit
./install-grok.sh --uninstall             # remove the kaola-deployed edition
```

Add `--yes` for non-interactive use. `--no-scripts` skips support scripts, hook
scripts, and the hooks JSON copy. The installer resolves the generated source
tree via `node scripts/sync-grok-edition.js --print-tree-root` (a worktree
install still finds the main-checkout trees).

- **PROJECT** (`--target` / `$PWD`): agents and commands land under
  `<project>/.grok/{agents,commands}`. The generated `hooks.json` and hook
  scripts are also copied to `<project>/.grok/hooks/` (Grok loads
  `<project>/.grok/hooks/*.json`).
- **GLOBAL** (`--global`): they land under `${GROK_HOME:-$HOME/.grok}/{agents,commands}`.
- Support scripts and hook scripts always land under
  `${GROK_HOME:-$HOME/.grok}/kaola-workflow/{scripts,hooks}`.
- The same hooks JSON is always copied to
  `${GROK_HOME:-$HOME/.grok}/hooks/kaola-workflow-hooks.json` regardless of
  scope, unless `--no-scripts`. The generated file already uses
  `${GROK_HOME:-$HOME/.grok}`; the installer copies it as-is and does not
  substitute a `__GROK_HOME__` placeholder.

`--uninstall` removes only kaola-deployed names. A subsequent bare install
redeploys the edition.

## Hooks

Grok's hook model is Claude-JSON compatible, with camelCase payloads and
tool-name aliases. This edition ships a generated `hooks.json` for the retained
compact-resume entry. The hook is fail-open everywhere.

| Event | Claude payload | Grok payload | Adaptation |
| --- | --- | --- | --- |
| `SessionStart` compact | `cwd` | `cwd` | none — compact-context stays as-is |
