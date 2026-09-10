# Devin CLI edition

The Devin edition follows Devin’s native routing rather than pinning models. The main orchestrator uses the model selected by the user, including Adaptive. Generated Kaola role profiles contain no `model:` field, so custom subagents use Devin’s organization-governable default subagent router. All three Kaola intent classes therefore map to `host_router`.

## Install

```bash
./install-devin.sh --global --forge=github
./install-devin.sh --check --forge=github
```

Use `--forge=gitlab` or `--forge=gitea` for another forge. Use `--project=/absolute/repository/path` for project-local profiles and skills. A new Devin session is required after profile installation because the live catalog is fixed at session start.

The installer writes:

- user profiles to `${DEVIN_CONFIG_DIR:-~/.config/devin}/agents/<role>.md`, or project profiles to `.devin/agents/<role>.md`;
- inline skills to `skills/<name>/SKILL.md` with `triggers: [user, model]` and no model or subagent override;
- forge-selected support scripts to `${DEVIN_CONFIG_DIR:-~/.config/devin}/kaola-workflow/scripts`;
- the managed global contract to `${DEVIN_CONFIG_DIR:-~/.config/devin}/AGENTS.md`;
- exactly one Kaola-owned `UserPromptSubmit` command hook in `${DEVIN_CONFIG_DIR:-~/.config/devin}/config.json`.

Existing non-Kaola hooks are preserved. `--check` compares installed bytes with generated sources and, when `devin` is available, requires `devin doctor --json` to report all 14 role names.

## Dispatch and model ownership

The live carrier is `run_subagent(profile, is_background, resume)`, with `read_subagent` used to reconcile background results. Exact named roles are available only when present in the session-start catalog. An absent exact role is a capability gap only when the mission needs that role’s custody; otherwise the orchestrator may use an adequate native route or work inline.

Profiles use Devin-native `allowed-tools` names: `read`, `grep`, `glob`, `edit`, `write`, and `exec`, selected from each shared behavior contract. Read-only work may run in the background. Write-capable work runs in the foreground unless the required write scope was already approved, because background agents automatically deny tools that require new approval. Children cannot spawn descendants in the measured default configuration.

## Compact recovery and host guards

Measured Devin CLI sessions drop AGENTS and imported always-on rule blocks after `/compact`. `PostCompaction` runs but does not inject `additionalContext`; `UserPromptSubmit` does. The installed hook therefore injects only this short recovery instruction on each user prompt:

```text
Kaola-Workflow: if KW-COMPACT-RECOVERY-V2 is not in your context, read <the resolved DEVIN_CONFIG_DIR or ~/.config/devin>/AGENTS.md and the active kaola-workflow/*/workflow-state.md and mission-list.md before acting.
```

Every generated runtime adapter begins with a host guard. A foreign Cursor or Claude carrier imported by Devin is inert rather than teaching Devin a nonexistent `Task`, model, or field schema. The universal workflow contract above the adapter remains host-neutral.

The runtime measurements and F1–F14 evidence are recorded in `templates/agents/runtime-capabilities.json` and issue #1058.
