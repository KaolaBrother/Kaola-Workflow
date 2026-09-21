# Droid CLI edition

Under ADR 0025 (#1062) the Droid edition installs **no Kaola role profiles**: dispatch goes through
Droid's own native `Task` routes — the built-in `worker` (general-purpose, all tools) and read-only
`explorer`, or any user-defined custom droid from `~/.factory/droids/`. A spawned route resolves its
model from the invoking route plus the parent's complexity routing and inherits the parent when
unpinned, and it cannot spawn further descendants. A missing named Kaola role is design, not a
`capability_gap` — the orchestrator uses an adequate native route or works inline per item. These
surfaces are measured from the live schema, which wins over this document.

## Install

```bash
./install-droid.sh --global --forge=github
./install-droid.sh --check --forge=github
```

Use `--forge=gitlab` or `--forge=gitea` for another forge. Use `--project=/absolute/repository/path`
for project-local skills under `<repo>/.factory/skills/`. A fresh Droid session picks up the new
carriers automatically, because Droid discovers skills and the personal AGENTS.md on session start.

The installer writes under the Droid config home `~/.factory` (`DROID_HOME` overrides it for a
hermetic install):

- inline skills to `skills/<name>/SKILL.md` with `triggers: [user, model]` and no model or
  subagent override;
- forge-selected support scripts to `kaola-workflow/scripts`;
- the managed global contract to `AGENTS.md`.

It installs **nothing else**. This edition deliberately installs no Droid hook
(`~/.factory/hooks.json`), no custom slash command (`.factory/commands/`), no custom droid
(`.factory/droids/`), no MCP server, and no settings file — those are all measured Droid surfaces
(evidence `droid_hooks` / `droid_commands` / `droid_subagents`) that the edition chooses not to
touch, matching the "additive, no harness additions" posture of the Devin edition. It also never
writes under `agents/` or `.factory/agents/`.

`--uninstall` removes only the Kaola-deployed skills and support scripts (by their rendered and
manifest names — never a blind deletion). A global-scope uninstall (the default) also strips this
runtime's own managed region in `~/.factory/AGENTS.md` through its own per-target record
(`kaola-workflow-global-contract.js uninstall --runtime droid`). The record is deleted and the runtime's
shared config reference is released. An owner-edited carrier is refused and left in place, and a
`--project` uninstall leaves the carrier alone. `--check` compares
installed bytes with generated sources.

The global-contract step is the installer's last step and runs in per-target mode
(`--runtime droid`). It installs and checks only the `droid-local` carrier, never writes another
runtime's home, and cannot be failed by another runtime's carrier conflict or drift. Both `install`
and `--check` report the `droid-local` target status when it is not `CURRENT`.

## Dispatch and model ownership

The live `Task` schema owns the route. Droid ships built-in `worker` and `explorer` subagents and
discovers custom droids from `~/.factory/droids/`; sibling `Task` calls run in parallel with their
own context windows. Background execution and `resume` remain runtime-owned options. Do not invent
profile or model arguments for a session mode that does not expose them. The universal dispatch
contract (choose a native route or work inline per item, custody of meaning, honest fallback) lives
in the always-loaded machine-global carrier and is never restated in the generated skills — they
carry only the always-loaded pointer once.

## Compact recovery and host guards

Droid loads the personal `AGENTS.md` from `~/.factory` (and `~/.agents/`, `~/.agent/`) plus project
AGENTS.md from repository root to cwd on every session, so the machine-global carrier is the
always-loaded compact-recovery authority. This edition installs no hook, so there is no
prompt-lifecycle event to reload it; post-compaction reload of the carrier is not measured in this
scope, and recovery is re-invoking the skill, which resumes from the durable mission list and
workflow state.

Every generated runtime adapter begins with a host guard. A foreign carrier imported by Droid is
inert rather than teaching Droid a nonexistent profile, model, or field schema. The universal
workflow contract above the adapter remains host-neutral.

The runtime measurements and the six evidence entries (five official Droid docs locators plus a
live probe of Droid CLI 0.220.0) are recorded in `templates/agents/runtime-capabilities.json` and
issue #1078. On the measured machine, `install-droid.sh --global --yes --forge=github` installed
the three skills, support scripts, and the global carrier; `--check` passed; and a read-only
`droid exec` probe reported `kaola-workflow-finalize`, `workflow-init`, `workflow-next`, and the
loaded machine-global `AGENTS.md` carrier.
