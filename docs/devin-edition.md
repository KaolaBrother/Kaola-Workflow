# Devin CLI edition

The Devin edition follows Devin’s native routing rather than pinning models. The main orchestrator uses the model selected by the user, including Adaptive. Generated Kaola role profiles contain no `model:` field, so custom subagents use Devin’s organization-governable default subagent router. All three Kaola intent classes therefore map to `host_router`.

## Install

```bash
./install-devin.sh --global --forge=github
./install-devin.sh --check --forge=github
```

Use `--forge=gitlab` or `--forge=gitea` for another forge. Use `--project=/absolute/repository/path` for project-local profiles and skills. A new Devin session is required after profile installation because the live catalog is fixed at session start.

The installer writes under the Devin user config directory `~/.config/devin`:

- user profiles to `agents/<role>.md`, or project profiles to `.devin/agents/<role>.md`;
- inline skills to `skills/<name>/SKILL.md` with `triggers: [user, model]` and no model or subagent override;
- forge-selected support scripts to `kaola-workflow/scripts`;
- the managed global contract to `AGENTS.md`;
- exactly one Kaola-owned `UserPromptSubmit` command hook in `config.json`.

Existing non-Kaola hooks are preserved. `--check` compares installed bytes with generated sources and, when `devin` is available, requires `devin doctor --json` to report all 14 role names.

The global-contract step is the same machine-wide transaction `install-all.sh` runs: it refreshes the Kaola global carrier of every runtime detected on the machine, not only Devin, and both `install` and `--check` report the `devin-local` target status when that transaction is not `CURRENT`. Set `DEVIN_CONFIG_DIR` only to relocate a hermetic install (tests, sandboxes): Devin does not read that variable. Devin resolves its own user config directory from `XDG_CONFIG_HOME` (measured on `devin 3000.10.21`) or `%APPDATA%\devin` on Windows, so a relocated install is invisible to a normal Devin session.

## Dispatch and model ownership

The live carrier is `run_subagent(profile, is_background, resume)`, with `read_subagent` used to reconcile background results. Exact named roles are available only when present in the session-start catalog. An absent exact role is a capability gap only when the mission needs that role’s custody; otherwise the orchestrator may use an adequate native route or work inline.

Profiles use Devin-native `allowed-tools` names: `read`, `grep`, `glob`, `edit`, `write`, `exec`, `web_search`, and `webfetch`, selected from each shared behavior contract (`knowledge-lookup` is the role whose `external_research` requirement adds the two web tools). Read-only work may run in the background. Write-capable work runs in the foreground unless the required write scope was already approved, because background agents automatically deny tools that require new approval. Children cannot spawn descendants in the measured default configuration.

## Compact recovery and host guards

Measured Devin CLI sessions drop AGENTS and imported always-on rule blocks after `/compact`. `PostCompaction` runs but does not inject `additionalContext`; `UserPromptSubmit` does. The installed hook therefore injects only this short recovery instruction on each user prompt:

```text
Kaola-Workflow: if KW-COMPACT-RECOVERY-V2 is not in your context, read <the installed root, normally ~/.config/devin>/AGENTS.md and the active kaola-workflow/*/workflow-state.md and mission-list.md before acting.
```

Every generated runtime adapter begins with a host guard. A foreign Cursor or Claude carrier imported by Devin is inert rather than teaching Devin a nonexistent `Task`, model, or field schema. The universal workflow contract above the adapter remains host-neutral.

The runtime measurements and F1–F14 evidence are recorded in `templates/agents/runtime-capabilities.json` and issue #1058.
