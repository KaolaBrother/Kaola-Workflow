# Kaola-Workflow · Kimi Code Edition

The Kimi edition makes Kaola-Workflow available through Kimi Code without making Kimi syntax a
repository-wide contract. Kimi is a runtime, not a forge, so this edition remains additive: it has
its own installer, generator, and suite and does not join `install.sh`, `edition-sync.js`, or the
forge validation chains.

Kimi loads `AGENTS.md` directly. Its project discovery concatenates instructions from the git root
toward the current directory, preferring `.kimi-code/AGENTS.md` before `AGENTS.md`/`agents.md` at
each level. Root `AGENTS.md` is therefore the Agent-maintained project authority; no Kimi bridge or
copy is installed. Universal Workflow behavior comes from the machine-global carrier. The
first-party discovery source and the warning-only 32 KiB recommendation are linked in
[runtime capabilities](runtime-capabilities.md#kimi-code).

## Native carriers

Since ADR 0025 (#1062) the Kimi adapter is `role_dispatch: "native_only"`: this edition installs no
Kaola role profiles. Kimi's custom-agent `model` field is ignored by the runtime, so a Kaola
profile has no cost lever — children inherit the session model and thinking either way, and the
vendor's own harness is the dispatch route.

The edition uses one Kimi carrier:

| Purpose | Generated source tree | Live project path | Live global path |
| --- | --- | --- | --- |
| workflow slash commands | `.kimi/skills/<command>/SKILL.md` | `<project>/.kimi-code/skills/<command>/SKILL.md` | `$KIMI_CODE_HOME/skills/<command>/SKILL.md` |

`$KIMI_CODE_HOME` defaults to `~/.kimi-code`.

The command Skills keep their canonical basenames, so `/workflow-init`, `/workflow-next`, and
`/kaola-workflow-finalize` remain the three entrypoints. Dispatch goes through Kimi's built-in
agents (`coder`, `explore`, `plan`, `AgentSwarm`) under their real identities — no Kaola
`kaola-role-*` profile is installed or impersonated.

Kimi's documented custom-agent surface remains available to the user:
[Custom agents](https://moonshotai.github.io/kimi-code/en/customization/agents.html). The documented
project locations are `.kimi-code/agents/` and `.agents/agents/`; the user locations are
`$KIMI_CODE_HOME/agents/` and `~/.agents/agents/`. Kaola writes none of them.

## One role behavior source

`scripts/sync-kimi-edition.js` renders only the command Skills and the global contract for this
adapter; it requests no role profiles from `generate-agent-profiles.js`. The seven-role behavior
authority in `templates/agents/behavior-contracts.json` still governs the shared contract prose.

## Model and thinking

Kimi's current custom-agent `model` field is ignored — the measured reason the adapter is
`native_only`. Kaola emits no `model` field and no
per-call model override. The session model and thinking configuration own routing, and every
child inherits them.

Kimi documents an experimental secondary-model pool for subagents. Kaola does not enable, seed, or
rewrite that user-owned experiment. Only a user who explicitly opts in may select its pool aliases
for newly spawned children; the normal default remains session model/thinking inheritance.

## Runtime-native orchestration guidance

The two execution commands expose Kimi's full relevant native surface: direct `Agent` dispatch,
`AgentSwarm` parallel lists up to 128 items, resume/background
options, and the writable `coder`, read-only `explore`, and non-shell `plan` built-ins. Built-ins are leaves;
custom profiles may allowlist deeper agents. Kaola neither disables those routes nor silently
enables the experimental secondary-model pool.

A missing named Kaola role is design, not a `capability_gap`: the orchestrator evaluates these
routes for the current item. A
built-in remains honestly identified and must satisfy the actual task, custody, evidence, and stop
boundaries; it is not renamed into a role. Inline applies only when no adequate route
exists, and the next mission item is reconsidered independently.

## Forge axis

The runtime is independent of the forge, while command prose and support-script names are not.
`install-kimi.sh` accepts `--forge=github|gitlab|gitea` and
`sync-kimi-edition.js` renders `.kimi/`, `.kimi-gitlab/`, or `.kimi-gitea/` from the routing-surface
registry. An unknown forge is refused.

```bash
./install-kimi.sh --forge=gitlab
node scripts/sync-kimi-edition.js --forge=gitea --check
```

## Prompt lifecycle

The Kimi edition generates zero Kaola hook files and installs no `[[hooks]]` prompt-lifecycle rule.
Its measured context does not justify per-tool injection, and this scope did not prove a compact
carrier equivalent to the direct Claude/Codex/Grok path. Ordinary tool use adds zero Kaola recovery
bytes and starts zero Kaola recovery subprocesses.

On upgrade, the installer removes the retired exact managed block between:

```text
# >>> kaola-workflow kimi hooks
# <<< kaola-workflow kimi hooks
```

Content outside that retired block in
`${KIMI_CODE_HOME:-$HOME/.kimi-code}/config.toml` is preserved. When a Kimi binary is available, the
installer validates the resulting config and restores the previous file if validation fails.

Support scripts live under
`${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts/`. Generated command Skills use
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

Project installs write command Skills below `<project>/.kimi-code/`. Global installs
write them directly below `$KIMI_CODE_HOME`. Support scripts remain user-scoped in both
cases.

On upgrade the installer removes the fourteen `kaola-role-*` artifacts earlier releases deployed —
the custom-agent profiles and the older role-shaped Skill directories — but only under exact
ownership proof: a manifest-recorded, managed-marker, hash-matching agent file, or a `kaola-role-*`
Skill directory whose complete one-file bytes match the exact profile shipped by v9.17.2.
A user-authored, modified, or unknown same-name file survives; a candidate that fails its
ownership check fails the install closed rather than being deleted. Reinstall is idempotent.
Uninstall removes only ownership-proven artifacts, the
three reserved Kaola command Skills, managed support files, and the retired managed config block. It
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

The suite proves the separate carrier inventories, the native-only invariant (no role profiles
rendered or installed, no `kaola-role-*` dispatch in rendered surfaces), role behavior reachability
in shared prose, model inheritance, generated-tree determinism, zero Claude-path
leakage, forge variants, project/global installation, unmanaged-collision refusal, idempotent
reinstall, ownership-gated legacy role-Skill and role-agent retirement, and ownership-safe uninstall. It proves tracked and
sandboxed filesystem behavior, not private prompt-loader attestation or identical stochastic model
output.
