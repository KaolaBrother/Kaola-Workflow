# Kaola-Workflow · grok Edition

The grok edition makes Kaola-Workflow runnable from
[Grok CLI](https://grok.com) (Grok Build TUI), the same way the opencode edition
makes it runnable from opencode. Grok CLI is a coding-agent **runtime** (like
Codex, opencode, and Kimi), not a git forge, so this edition is delivered the
Grok-native way — named **agents** under a generated `.grok/agents/` tree, flat
slash **commands** under `.grok/commands/`, and one complete Rule under
`.grok/rules/` — and is fully **additive**: it touches none of the existing
`claude`/`codex`/`gitlab`/`gitea`/`opencode`/`kimi` edition machinery.

Grok loads root-to-cwd project rules including `AGENTS.md` directly. Kaola therefore installs no
project-instruction bridge for Grok; root `AGENTS.md` remains the universal authority. The generated
`.grok/agents/` profiles add only Grok-native carrier, model/effort, permission, and dispatch data.
See [runtime capabilities](runtime-capabilities.md#grok-build) for first-party evidence and limits.

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
| `templates/agents/behavior-contracts.json` + Grok adapter | `.grok/agents/<name>.md` | 14 native profiles with `name`, `description`, native camelCase `promptMode` / `agentsMd`, `model: inherit`, intent-derived `effort: medium\|high\|xhigh`, an explicit capability-derived `tools` allowlist, shared behavior identity, and render-specific hash. Kaola does not emit `permissionMode: plan`: `plan` is not a legal value of the official enum and permission mode is not the tool-boundary carrier. |
| `commands/<file>.md` | `.grok/commands/<file>.md` | Flat slash command. The marked next/finalize block becomes Grok-native profile, `spawn_subagent`, tier, route, and limit guidance; any concrete Claude dispatch cards are adapted. `--runtime claude` becomes `--runtime grok`. Script resolver points at `${GROK_HOME:-$HOME/.grok}/kaola-workflow/scripts`. |
| global contract + compact skeleton + Grok adapter | `$GROK_HOME/rules/kaola-workflow-global.md` | The global transaction renders one V2 native Rule carrying the universal contract, complete operation reload route, mandatory dispatch contract, and Grok adapter. The edition emits no second Rule or compact hook. |

Generated agents are deliberately model-agnostic. Regenerating the tree never
overwrites a user's `[subagents.models]` or `[subagents.roles.*]` in
`$GROK_HOME/config.toml`.

## Three effort tiers — every subagent inherits the session model

Generated agents remain model-inheriting: every frontmatter keeps `model: inherit`, so the session
supplies the model. Runtime-neutral intent maps only in the Grok adapter: `standard` emits
`effort: medium`, `reasoning` emits `effort: high`, and `heavy` emits `effort: xhigh`. Native effort
syntax never enters the shared behavior source.

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

All 14 role bodies come from `templates/agents/behavior-contracts.json` through
`generate-agent-profiles.js`; `sync-grok-edition.js` requests the Grok render and only owns edition
layout, commands, hooks, and install packaging. Reviewer roles have no separate source or transform.

The frontmatter spelling and capability boundary come from xAI's first-party
[`AgentDefinition`](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-agent/src/config.rs),
which serializes agent keys in camelCase and accepts native `model`, `effort`, `tools`, and
`disallowedTools`. Unknown snake_case spellings are not adapter aliases.

## Runtime-native orchestration guidance

`workflow-next` and `kaola-workflow-finalize` expose project/user profile lookup and
`spawn_subagent` with named `subagent_type`. They also preserve Grok's background, isolation,
resume, cwd, and optional per-call model choices; per-call effort is omitted because the profile
carries it. Full `general-purpose` and read/shell `explore` and `plan` are honest item-local
alternatives. Children cannot spawn descendants, but Kaola adds no restriction to root-level native
routes.

One absent exact role does not make the rest of the run inline. The orchestrator tests the other
native routes against that item's task, custody, evidence, and stop boundaries, uses them under
their real identity when adequate, and inlines only that item otherwise. The next item starts with a
fresh routing decision.

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

Add `--yes` for non-interactive use. `--no-scripts` skips executable support
scripts; the edition still installs no Rule. The installer resolves the generated source
tree via `node scripts/sync-grok-edition.js --print-tree-root` (a worktree
install still finds the main-checkout trees).

- **PROJECT** (`--target` / `$PWD`): agents and commands land under
  `<project>/.grok/{agents,commands}`. No duplicate project Rule is emitted.
- **GLOBAL** (`--global`): agents and commands land under
  `${GROK_HOME:-$HOME/.grok}/{agents,commands}`. `install-all.sh` has already installed the single
  `${GROK_HOME:-$HOME/.grok}/rules/kaola-workflow-global.md` through the global transaction.
- Support scripts and hook scripts always land under
  `${GROK_HOME:-$HOME/.grok}/kaola-workflow/{scripts,hooks}`.

The global Rule is a runtime-native prompt carrier, not an executable hook. It is model context for every
interaction in scope, so compaction cannot remove it. It starts no subprocess and does not append a
new copy on each tool call. There is no path selector, JS process, or prompt composition.

`--uninstall` removes only kaola-deployed names. A subsequent bare install
redeploys the edition.

## Why no compact hook

Grok does support Claude-compatible hook JSON, but its event semantics do not supply an injection
carrier for this job. `SessionStart` matches start sources such as `startup` and `resume`; compaction
uses `PreCompact`/`PostCompact`. All three are passive, and official documentation says passive-hook
stdout is ignored. Two live Grok 1.0.13 `/compact` probes confirmed that a `cat` hook did not restore
the marker, dispatch title, or operation rules even after its file target was repaired. The
installer therefore removes the byte-known historical mapping and installs no compact hook.

Grok's official Rules contract is the measured replacement: `$GROK_HOME/rules/*.md` enters model
context for every interaction. The install-time renderer composes the common contract and Grok
overlay once; inference runs no executable prompt machinery.
