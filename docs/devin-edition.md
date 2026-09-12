# Devin CLI edition

Under ADR 0025 (#1062) the Devin edition installs **no Kaola role profiles**: dispatch goes through
Devin's own `run_subagent` / `read_subagent` vendor harness — the built-in `subagent_general` (which
inherits the parent model) or a user-owned profile from the session-start catalog. Kaola pins no
model because it has no lever on that axis: Devin's "Default subagent model" setting routes every
unpinned subagent through an organization router — measured to land on SWE-1.6 today (vendor
documentation fetched 2026-09-12; #1061) — so a Kaola `model:` field could not select a cheaper
child anyway. The main orchestrator uses the model selected by the user, including Adaptive.

## Install

```bash
./install-devin.sh --global --forge=github
./install-devin.sh --check --forge=github
```

Use `--forge=gitlab` or `--forge=gitea` for another forge. Use `--project=/absolute/repository/path` for project-local skills. A new Devin session is required after installation because the live catalog is fixed at session start.

The installer writes under the Devin user config directory `~/.config/devin`:

- inline skills to `skills/<name>/SKILL.md` with `triggers: [user, model]` and no model or subagent override;
- forge-selected support scripts to `kaola-workflow/scripts`;
- the managed global contract to `AGENTS.md`;
- exactly one Kaola-owned `UserPromptSubmit` command hook in `config.json`.

It installs nothing under `agents/` or `.devin/agents/`. On upgrade it removes the fourteen role
profiles earlier releases deployed to `~/.config/devin/agents/` and `.devin/agents/` — but only
files still carrying the `kaola-workflow-managed-agent: true` marker the generator embedded in
every profile it rendered. A user-authored or marker-stripped same-name file survives untouched.

Existing non-Kaola hooks are preserved. `--check` compares installed bytes with generated sources.

The global-contract step is the same machine-wide transaction `install-all.sh` runs: it refreshes the Kaola global carrier of every runtime detected on the machine, not only Devin, and both `install` and `--check` report the `devin-local` target status when that transaction is not `CURRENT`. Set `DEVIN_CONFIG_DIR` only to relocate a hermetic install (tests, sandboxes): Devin does not read that variable. Devin resolves its own user config directory from `XDG_CONFIG_HOME` (measured on `devin 3000.10.21`) or `%APPDATA%\devin` on Windows, so a relocated install is invisible to a normal Devin session.

## Dispatch and model ownership

The live carrier is `run_subagent(profile, is_background, resume)`, with `read_subagent` used to reconcile background results. Only profiles present in the session-start catalog are dispatchable: the built-in `subagent_general` (parent-model) and any user-owned profiles. A missing named Kaola role is design, not a `capability_gap` — the orchestrator uses an adequate native route or works inline per item.

Read-only work may run in the background. Write-capable work runs in the foreground unless the required write scope was already approved, because background agents automatically deny tools that require new approval. Children cannot spawn descendants in the measured default configuration.

## Compact recovery and host guards

Measured Devin CLI sessions drop AGENTS and imported always-on rule blocks after `/compact`. `PostCompaction` runs but does not inject `additionalContext`; `UserPromptSubmit` does. The installed hook therefore injects only this short recovery instruction on each user prompt:

```text
Kaola-Workflow: if KW-COMPACT-RECOVERY-V2 is not in your context, read <the installed root, normally ~/.config/devin>/AGENTS.md and the active kaola-workflow/*/workflow-state.md and mission-list.md before acting.
```

Every generated runtime adapter begins with a host guard. A foreign Cursor or Claude carrier imported by Devin is inert rather than teaching Devin a nonexistent `Task`, model, or field schema. The universal workflow contract above the adapter remains host-neutral.

The runtime measurements and F1–F14 evidence are recorded in `templates/agents/runtime-capabilities.json` and issue #1058.
