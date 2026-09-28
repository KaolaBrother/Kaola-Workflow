# Droid CLI edition

Kaola-Workflow defines no subagent roles, role profiles, or subagent model or effort bindings
([ADR 0029](decisions/0029-native-subagents-only.md), #1101). The rendered adapter follows the live
host schema and does not name types
([ADR 0030](decisions/0030-forge-and-engineering-lifecycle.md)). Dated measurements of Droid's
`Task` routes are in [runtime capabilities](runtime-capabilities.md#droid-cli). Kaola installing no
profile is never evidence that Droid lacks subagent capability. These surfaces are measured from
the live schema, which wins over this document.

## Install

```bash
./install-droid.sh --global --forge=github
./install-droid.sh --check --forge=github
```

Use `--forge=gitlab` or `--forge=gitea` for another forge. Use `--project=/absolute/repository/path`
for project-local skills under `<repo>/.factory/skills/`. A fresh Droid session picks up the new
carriers automatically, because Droid discovers skills and the personal AGENTS.md on session start.

The installer writes under the Droid config home `~/.factory` (`DROID_HOME` overrides that
home for a hermetic install) and, since #1112, into the shared `~/.agents` root:

- inline skills to `~/.agents/skills/<name>/SKILL.md` with `triggers: [user, model]` and no model or
  subagent override — Droid's documented personal-compatibility root, shared with other
  tools and read by other runtimes that discover `~/.agents/skills` (dsh documents it), so the
  rendered skills are runtime-neutral: no `~/.factory`/`DROID_HOME` script paths, no
  `--runtime droid` flag, no Droid-only dispatch prose. A runtime that also has its own Kaola
  edition installed may discover both copies of a workflow skill — Kaola never touches another
  runtime's copies. A same-name entry that is not a proven Kaola-Workflow copy (foreign,
  owner-edited, or not a plain one-file `SKILL.md` dir) is refused before anything is
  written; ownership is proven by `~/.factory/kaola-workflow/agents-skills.record`, by the
  staged render, or by the frozen catalog of released renders. Ownership-proven copies under
  the former `~/.factory/skills` root — still a supported Droid personal root — are removed,
  because the owner observed Droid flag same-name pairs across the two roots (its docs call
  duplicate names within one source bucket invalid); anything else there is preserved and
  reported, and the install exits non-zero. A same-name *non-Kaola* skill present in both
  roots is only reported as an advisory `note:` — Kaola never removes it.
- forge-selected support scripts to `~/.agents/kaola-workflow/scripts` (the same
  runtime-neutral root the skill resolvers probe; manifest-named leftovers under the former
  `$DROID_HOME/kaola-workflow/scripts` are retired on install and uninstall);
- the managed global contract to `AGENTS.md`.

It installs **nothing else**. This edition deliberately installs no Droid hook
(`~/.factory/hooks.json`), no custom slash command (`.factory/commands/`), no custom droid
(`.factory/droids/`), no MCP server, and no settings file — those are all measured Droid surfaces
(evidence `droid_hooks` / `droid_commands` / `droid_subagents`) that the edition chooses not to
touch, matching the "additive, no harness additions" posture of the Devin edition. It also never
writes under `agents/` or `.factory/agents/`.

`--uninstall` removes only the Kaola-deployed skills (ownership-proven — never a blind deletion
of the shared `~/.agents/skills` root) and support scripts (by their manifest names), and sweeps
proven copies out of the former `~/.factory/skills` root. A global-scope uninstall (the default)
also strips this runtime's own managed region in `~/.factory/AGENTS.md` through its own per-target
record (`kaola-workflow-global-contract.js uninstall --runtime droid`). The record is deleted and
the runtime's shared config reference is released. An owner-edited carrier is refused and left in
place, and a `--project` uninstall leaves the carrier alone. `--check` reports each deployed skill
as `missing`, `stale` (bytes drifted but still provably a Kaola copy — via the record or the
released-render catalog — so a rerun restores it), or `conflict` (not provably a Kaola copy;
install will refuse it), names any ownership-proven duplicate still in the former root as a
conflict, and prints advisory `note:` lines for non-Kaola same-name pairs across the roots.

The global-contract step is the installer's last step and runs in per-target mode
(`--runtime droid`). It installs and checks only the `droid-local` carrier, never writes another
runtime's home, and cannot be failed by another runtime's carrier conflict or drift. Both `install`
and `--check` report the `droid-local` target status when it is not `CURRENT`.

## Dispatch and model ownership

The live `Task` schema owns the route. Droid ships built-in `worker` and `explorer` subagents and
discovers custom droids from `~/.factory/droids/`; sibling `Task` calls run in parallel with their
own context windows. Background execution and `resume` remain runtime-owned options. Do not invent
profile or model arguments for a session mode that does not expose them. Dated route measurements
are in [runtime capabilities](runtime-capabilities.md). The always-loaded carrier states the
native boundary ([ADR 0030](decisions/0030-forge-and-engineering-lifecycle.md)) and does not name
a type catalog or a dispatch-or-inline rule. Generated skills carry only the pointer to that
carrier.

## Compact recovery and host guards

Droid loads the personal `AGENTS.md` from `~/.factory` (and `~/.agents/`, `~/.agent/`) plus project
AGENTS.md from repository root to cwd on every session, so the machine-global carrier is the
always-loaded compact-recovery authority. This edition installs no hook, so there is no
prompt-lifecycle event to reload it; post-compaction reload of the carrier is not measured in this
scope, and recovery is re-invoking the skill, which resumes from the durable mission ledger
(`kaola-workflow/.ledger/issue-<N>.jsonl` in the main checkout) and workflow state.

Every generated runtime adapter begins with a host guard. A foreign carrier imported by Droid is
inert rather than teaching Droid a nonexistent profile, model, or field schema. The universal
workflow contract above the adapter remains host-neutral.

The runtime measurements and the six evidence entries (five official Droid docs locators plus a
live probe of Droid CLI 0.220.0) are recorded in `templates/agents/runtime-capabilities.json` and
issue #1078. On the measured machine, `install-droid.sh --global --yes --forge=github` installed
the three skills, support scripts, and the global carrier; `--check` passed; and a read-only
`droid exec` probe reported `kaola-workflow-finalize`, `workflow-init`, `workflow-next`, and the
loaded machine-global `AGENTS.md` carrier.
