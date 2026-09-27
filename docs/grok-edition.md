# Kaola-Workflow · grok Edition

The grok edition makes Kaola-Workflow runnable from
[Grok CLI](https://grok.com) (Grok Build TUI), the same way the opencode edition
makes it runnable from opencode. Grok CLI is a coding-agent **runtime** (like
Codex, opencode, and Kimi), not a git forge, so this edition is delivered the
Grok-native way — flat slash **commands** under `.grok/commands/` and one complete
Rule under `.grok/rules/` — and is fully **additive**: it touches none of the existing
`claude`/`codex`/`gitlab`/`gitea`/`opencode`/`kimi` edition machinery.

Grok loads root-to-cwd project rules including `AGENTS.md` directly. Kaola therefore installs no
project-instruction bridge for Grok; root `AGENTS.md` remains the Agent-maintained project authority.
The machine-global Rule supplies universal Workflow behavior, including the dispatch contract and
the Grok adapter. Kaola ships no Grok agents: subagents are Grok's own `spawn_subagent` types.
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
| `commands/<file>.md` | `.grok/commands/<file>.md` | Flat slash command. The marked runtime dispatch block becomes a one-line pointer to the always-loaded Rule, which carries the dispatch contract and adapter facts. `--runtime claude` becomes `--runtime grok`. Script resolver points at `${GROK_HOME:-$HOME/.grok}/kaola-workflow/scripts`. |
| global contract + compact skeleton + Grok adapter | `$GROK_HOME/rules/kaola-workflow-global.md` | The global transaction renders one V2 native Rule carrying the universal contract, complete operation reload route, mandatory dispatch contract, and Grok adapter. The edition emits no second Rule or compact hook. |

Regenerating the tree never seeds or rewrites `$GROK_HOME/config.toml`, including a user's
`[subagents.models]` or `[subagents.roles.*]` sections there.

## Subagents are Grok's own

Kaola-Workflow defines no subagent roles, role profiles, or subagent model or effort bindings
([ADR 0029](decisions/0029-native-subagents-only.md), #1101), so the edition generates no agents:
`sync-grok-edition.js --write` renders commands only and prunes the retired `agents/` files from a
generated tree. Child model and effort follow Grok's own defaults and the user's configuration.
Before #1101 the edition rendered seven `.grok/agents/` profiles pinning one model and effort; the
#1018 and Grok CLI 1.0.5 probes recorded against those profiles measured the retired pins.

## Runtime-native orchestration guidance

The always-loaded Rule carries the Grok adapter: dispatch with `spawn_subagent`, whose
`subagent_type` names a type from the live catalog — such as full `general-purpose`, read/shell
`explore`, or read/shell `plan` — with native background, isolation, resume, and cwd options. Child
model and effort follow Grok's own defaults. Grok children cannot spawn descendants, but Kaola adds
no restriction to root-level native routes.

Kaola installing no profile is never evidence that Grok lacks subagent capability. The orchestrator
chooses a native route or inline work per item, and the next item starts with a fresh decision.

## Path selection

On the grok edition, the router routes directly to the adaptive workflow. Generated commands
replace the runtime dispatch block with the pointer to the always-loaded Rule; canonical
`commands/*.md` is never touched.

## Installer

`install-grok.sh` is a standalone installer — it has its own `--forge` flag and
does not run through `install.sh --forge`.

> The Grok runtime is also covered by the top-level **`./install-all.sh`**
> ("install/refresh every runtime" — see [README](../README.md#quick-start)),
> which invokes this installer unchanged (`--global` by default) as the fifth
> leg of its nine-runtime sequence, with a per-runtime PASS/FAIL summary. It stays
> a thin orchestrator — it does **not** fold Grok into
> `install.sh`/`edition-sync.js`/`npm test`.

```bash
./install-grok.sh                         # deploy into the current project (.grok/commands)
./install-grok.sh --target /path/to/repo  # deploy into a specific project
./install-grok.sh --global                # commands → ${GROK_HOME:-~/.grok}
./install-grok.sh --regenerate            # refresh in-repo .grok/ from canonical, then exit
./install-grok.sh --uninstall             # remove the kaola-deployed edition
```

Add `--yes` for non-interactive use. `--no-scripts` skips executable support
scripts; the edition still installs no Rule. The installer resolves the generated source
tree via `node scripts/sync-grok-edition.js --print-tree-root` (a worktree
install still finds the main-checkout trees).

- **PROJECT** (`--target` / `$PWD`): commands land under `<project>/.grok/commands`. No
  duplicate project Rule is emitted.
- **GLOBAL** (`--global`): commands land under `${GROK_HOME:-$HOME/.grok}/commands`.
  `install-all.sh` has already installed the single
  `${GROK_HOME:-$HOME/.grok}/rules/kaola-workflow-global.md` through the global transaction.
- Support scripts and hook scripts always land under
  `${GROK_HOME:-$HOME/.grok}/kaola-workflow/{scripts,hooks}`.

The global Rule is a runtime-native prompt carrier, not an executable hook. It is model context for every
interaction in scope, so compaction cannot remove it. It starts no subprocess and does not append a
new copy on each tool call. There is no path selector, JS process, or prompt composition.

`--uninstall` removes only kaola-deployed names. A subsequent bare install
redeploys the edition. No Grok profile is installed. Install and `--uninstall` retire the profiles
earlier releases copied into `agents/` only when their bytes equal a released Grok render, and keep
and report any other Kaola-named file; see
[Upgrading from earlier releases](installation.md#upgrading-from-releases-that-installed-kaola-role-profiles).

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
