# Kaola-Workflow · Kimi Code Edition

The Kimi edition makes Kaola-Workflow available through Kimi Code without making Kimi syntax a
repository-wide contract. Kimi is a runtime, not a forge, so this edition remains additive: it has
its own installer, generator, and suite and does not join `install.sh`, `edition-sync.js`, or the
forge validation chains.

Kimi loads `AGENTS.md` directly. Its project discovery concatenates instructions from the git root
toward the current directory, preferring `.kimi-code/AGENTS.md` before `AGENTS.md`/`agents.md` at
each level. Root `AGENTS.md` is therefore Kaola's universal repository authority; no Kimi bridge or
copy is installed. The first-party discovery source and the warning-only 32 KiB recommendation are
linked in [runtime capabilities](runtime-capabilities.md#kimi-code).

## Native carriers

The edition uses two distinct Kimi carriers:

| Purpose | Generated source tree | Live project path | Live global path |
| --- | --- | --- | --- |
| workflow slash commands | `.kimi/skills/<command>/SKILL.md` | `<project>/.kimi-code/skills/<command>/SKILL.md` | `$KIMI_CODE_HOME/skills/<command>/SKILL.md` |
| 14 named roles | `.kimi/agents/<role>.md` | `<project>/.kimi-code/agents/<role>.md` | `$KIMI_CODE_HOME/agents/<role>.md` |

`$KIMI_CODE_HOME` defaults to `~/.kimi-code`. Kimi also documents the generic compatibility
profile directories `<project>/.agents/agents/` and `~/.agents/agents/`; Kaola installs to the
branded `.kimi-code` / `$KIMI_CODE_HOME` locations so one managed layout has an unambiguous owner.

The command Skills keep their canonical basenames, so `/workflow-init`, `/workflow-next`, and
`/kaola-workflow-finalize` remain the three entrypoints. Roles are **not Skills**. Each role is a
native Markdown/YAML custom-agent profile whose frontmatter name is
`kaola-role-<role>`. A generated command dispatches it directly with
`subagent_type="kaola-role-<role>"`; it does not substitute Kimi's built-in `coder` or `explore`
agent and does not ask a built-in agent to load a role-contract Skill.

This matches Kimi's documented custom-agent surface:
[Custom agents](https://moonshotai.github.io/kimi-code/en/customization/agents.html). The documented
project locations are `.kimi-code/agents/` and `.agents/agents/`; the user locations are
`$KIMI_CODE_HOME/agents/` and `~/.agents/agents/`.

## One role behavior source

`scripts/generate-agent-profiles.js` combines
`templates/agents/behavior-contracts.json` with the Kimi adapter. It produces one native profile
for every role and carries the same `behavior_contract_hash` used by other runtimes plus a
Kimi-render-specific `resolved_profile_hash`. `scripts/sync-kimi-edition.js` owns only the edition
layout, command transformation, hooks, and install packaging; it does not parse a Claude profile or
maintain a reviewer-only transform.

Every Kimi profile has an explicit native `tools` allowlist derived from the role's capability
requirements:

- every role receives `Read`, `Grep`, and `Glob`;
- `scoped_write` adds `Write` and `Edit`;
- `command_execution` adds `Bash`;
- `external_research` adds `WebSearch` and `FetchURL`.

These fields are runtime-enforced capability boundaries, not prose suggestions. A missing required
native capability is reported as `capability_gap`; the adapter does not silently grant a broader
toolset.

## Model and thinking

Kimi's current custom-agent `model` field is ignored. Kaola therefore emits no `model` field and no
per-call model override. The session model and thinking configuration own normal routing, and every
named Kaola child inherits them. The runtime-neutral `standard`, `reasoning`, and `heavy` intent
classes remain in the behavior source, but the Kimi adapter maps all three to session inheritance.

Kimi documents an experimental secondary-model pool for subagents. Kaola does not enable, seed, or
rewrite that user-owned experiment.

## Forge axis

The runtime is independent of the forge, while command prose and support-script names are not.
`install-kimi.sh` accepts `--forge=github|gitlab|gitea` and
`sync-kimi-edition.js` renders `.kimi/`, `.kimi-gitlab/`, or `.kimi-gitea/` from the routing-surface
registry. An unknown forge is refused.

```bash
./install-kimi.sh --forge=gitlab
node scripts/sync-kimi-edition.js --forge=gitea --check
```

## Hooks

Kimi hooks are `[[hooks]]` rules in the user `config.toml`. The edition generates
`.kimi/hooks/kimi-hooks.toml` and maps compact-resume behavior to `PostCompact`. The installer
merges exactly one block between:

```text
# >>> kaola-workflow kimi hooks
# <<< kaola-workflow kimi hooks
```

Kimi's documented hook configuration is user-scoped, so both project and global installs merge the
managed block into `${KIMI_CODE_HOME:-$HOME/.kimi-code}/config.toml`. Content outside that block is
preserved. `--no-scripts` skips the hook/support-script install. When a Kimi binary is available,
the installer validates the merged config and restores the previous file if validation fails.

Support scripts live under
`${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/{scripts,hooks}/`. Generated command Skills use
the Kimi-native resolver and carry no `$CLAUDE_PLUGIN_ROOT` or `~/.claude/kaola-workflow` path.

## Install and ownership

```bash
./install-kimi.sh                         # current project
./install-kimi.sh --target /path/to/repo  # selected project
./install-kimi.sh --global                # user-wide Kimi home
./install-kimi.sh --forge=gitlab          # selected forge prose and scripts
./install-kimi.sh --regenerate            # refresh generated .kimi* tree
./install-kimi.sh --uninstall             # remove this scope's managed edition
```

Project installs write command Skills and agents below `<project>/.kimi-code/`. Global installs
write them directly below `$KIMI_CODE_HOME`. Support scripts and hooks remain user-scoped in both
cases.

Every generated native agent is recorded in a filename-plus-SHA manifest; the visible marker alone
is never ownership proof. Install refuses an unmanaged or owner-modified same-name agent and any
agent-directory, profile, or manifest symlink before writing. Reinstall updates only hash-proven
managed profiles and is idempotent. The migration removes an older `kaola-role-*` Skill directory
only when its complete one-file bytes match an exact profile shipped by v9.17.2; modified and
unknown role-shaped Skills remain. Uninstall removes only manifest/exact-byte-proven agents, the
three reserved Kaola command Skills, managed hook/support files, and the managed config block. It
preserves the user's other agents, Skills, config content, and the shared
`~/.config/kaola-workflow/config.json`.

## Develop and verify

```bash
node scripts/generate-agent-profiles.js --write
node scripts/generate-agent-profiles.js --check
node scripts/sync-kimi-edition.js --write
node scripts/sync-kimi-edition.js --check
node scripts/test-kimi-edition.js
```

The suite proves the separate carrier inventories, all-role behavior reachability, native tool
allowlists, direct named dispatch, model inheritance, generated-tree determinism, zero Claude-path
leakage, forge variants, project/global installation, unmanaged-collision refusal, idempotent
reinstall, legacy role-Skill retirement, and ownership-safe uninstall. It proves tracked and
sandboxed filesystem behavior, not private prompt-loader attestation or identical stochastic model
output.
