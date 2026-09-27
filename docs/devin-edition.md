# Devin CLI edition

Kaola-Workflow defines no subagent roles, role profiles, or subagent model or effort bindings
([ADR 0029](decisions/0029-native-subagents-only.md), #1101); the Devin edition has been
native-only since #1062. Dispatch goes through whichever native route the live Devin schema
exposes: `run_subagent` / `read_subagent` with the session-start profile catalog (the built-in
`subagent_general` or a user-owned profile), or the Fusion `sidekick` route. Devin owns the child
model: its "Default subagent model" setting routes every unpinned subagent through an organization
router — measured to land on SWE-1.6 (vendor documentation fetched 2026-09-12; #1061). The main
orchestrator uses the model selected by the user, including Adaptive.

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

It installs nothing under `agents/` or `.devin/agents/`. Install removes the agent profiles earlier
releases put there only when their bytes equal a released Devin render; an edited or unrecorded one
is kept and reported. `--check` fails only while a released profile is still installed. See
[Upgrading from earlier releases](installation.md#upgrading-from-releases-that-installed-kaola-role-profiles).

Existing non-Kaola hooks are preserved. `--check` compares installed bytes with generated sources.

`install-devin.sh` has no `--uninstall` yet; this is a known gap. To strip only the Devin carrier
through its own per-target record, run
`node scripts/kaola-workflow-global-contract.js uninstall --runtime devin --json`. The skills,
support scripts, and hook entry must be removed by hand.

The global-contract step is the installer's last step and runs in per-target mode (`--runtime devin`). It installs and checks only the `devin-local` carrier, never writes another runtime's home, and cannot be failed by another runtime's carrier conflict or drift. Both `install` and `--check` report the `devin-local` target status when it is not `CURRENT`. Set `DEVIN_CONFIG_DIR` only to relocate a hermetic install (tests, sandboxes): Devin does not read that variable. Devin resolves its own user config directory from `XDG_CONFIG_HOME` (measured on `devin 3000.10.21`) or `%APPDATA%\devin` on Windows, so a relocated install is invisible to a normal Devin session.

## Dispatch and model ownership

The live schema owns the route. Earlier measured sessions exposed `run_subagent(profile, is_background, resume)` with `read_subagent`, the built-in `subagent_general`, and session-start user profiles. A fresh Fusion session on 2026-09-12 instead exposed `sidekick`; its ACP event carried `cognition.ai/sidekick: true` on a completed read of the probe file. No child model telemetry was exposed. Do not transfer profile/model arguments between these different session modes. Kaola installing no profile is never evidence that Devin lacks subagent capability: the orchestrator uses a native route the session exposes or works inline per item.

A narrated child reply does not establish a dispatch: use the native tool event to establish
that a child ran, and inspect its findings or artifacts separately to judge the outcome. A file
can also be written by the parent; read-only work need not create one. This applies the existing
orchestrator verdict rule and adds no gate or record field. The #1063 archive reports three
sessions with narrated replies but no dispatch events; its retained summary is not the original
session export. #1065 records that evidence limit. A simulated answer cannot establish why a
real dispatch was rejected, or rule out prompt content or task difficulty. The vendor cause
remains unknown.

Read-only work may run in the background. Write-capable work runs in the foreground unless the required write scope was already approved, because background agents automatically deny tools that require new approval. Children cannot spawn descendants in the measured default configuration.

## Compact recovery and host guards

Measured Devin CLI sessions drop AGENTS and imported always-on rule blocks after `/compact`. `PostCompaction` runs but does not inject `additionalContext`; `UserPromptSubmit` does. The installed hook therefore injects only this short recovery instruction on each user prompt:

```text
Kaola-Workflow: if KW-COMPACT-RECOVERY-V2 is not in your context, read <the installed root, normally ~/.config/devin>/AGENTS.md and the active kaola-workflow/*/workflow-state.md and its kaola-workflow/.ledger/issue-<N>.jsonl mission ledger before acting.
```

Every generated runtime adapter begins with a host guard. A foreign Cursor or Claude carrier imported by Devin is inert rather than teaching Devin a nonexistent `Task`, model, or field schema. The universal workflow contract above the adapter remains host-neutral.

The runtime measurements and F1–F14 evidence are recorded in `templates/agents/runtime-capabilities.json` and issue #1058.
