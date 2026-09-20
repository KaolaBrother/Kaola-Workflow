# Kaola-Workflow · ZCode Edition

ZCode is a coding-agent runtime, not a git forge. Its generated skills come
from the same routing and behavior authorities as the other runtime editions; under ADR 0025
(#1062) ZCode is `native_only` and installs no Kaola role profiles. The focused suite is
`node scripts/test-zcode-edition.js`.

ZCode loads user-global `~/.zcode/AGENTS.md` and workspace-root `AGENTS.md` directly and needs no
bridge. The locally measured product was ZCode App
`3.10.1` / build `3.10.1.6272`; its bundled CLI was available through the App, while a standalone
ZCode executable or binary was absent from `PATH`. Live named-subagent/model resolution remains
**unknown**.

The same live session reported a 1,000,000-token context window and used only 32,730 tokens during
the probe. Under #1079 (ZCode 3.12.3 + the KPR ACP adapter 0.3.3, upstream
[kaola-project-runner#94](https://github.com/KaolaBrother/kaola-project-runner/pull/94)) the
compact-recovery mechanism landed without a prompt-lifecycle gate: workspace
`.zcode/skills/<name>/SKILL.md` (frontmatter `name:` + `description:`) is natively discovered,
`/<name>` produces a native Skill tool call that loads the full body, and ZCode's AGENTS.md prefix
survives compaction (KPR #75). Recovery is therefore the always-loaded global carrier plus a
native Skill re-invocation — never a manual `read` of the skill file.

## Forge axis and generated surface

`./install-zcode.sh` uses the GitHub-shaped `.zcode/` source. `--forge=gitlab` and
`--forge=gitea` select `.zcode-gitlab/` and `.zcode-gitea/`; unknown forges refuse with exit 2.

`node scripts/sync-zcode-edition.js --write` renders, for each forge:

- `.zcode/skills/<name>/SKILL.md`: the routing-registry surfaces as native Skills —
  `kaola-workflow-next`, `kaola-workflow-init`, and `kaola-workflow-finalize`, with ZCode
  runtime guidance and the `/workflow-next` → `/kaola-workflow-next` route renames.
- `.zcode/config.json`: an empty deterministic hook declaration object.
- `.zcode/kaola-workflow/scripts/`: support-script launchers used by the skill surface.

ZCode is a native_only runtime under #1062: the render produces no `.zcode/agents/` role
profiles. Older releases installed a Kaola agent roster there and synced it to user scope; the
installer now sweeps only managed-marker retired files and never touches user-authored agents.
Pre-#1079 flat commands under `.zcode/commands/` retired the same way: install and uninstall
remove exactly the three deployed basenames (`workflow-next`, `workflow-init`,
`kaola-workflow-finalize`) and preserve every other, user-owned file.

Issue #1044 generates no ZCode prompt components and no hook shell. `--check` re-renders and
byte-compares; `--refresh-present` updates only edition trees already present.

## Compact recovery (#1079)

ZCode is an always-loaded-carrier runtime: the machine-global transaction renders the full
compact-recovery prompt (global contract, Workflow Next resume, dispatch contract, and the ZCode
adapter) into the managed region of `${ZCODE_HOME:-~/.zcode}/AGENTS.md`. That prefix survives
compaction, so after a compact the region itself routes recovery to a native
`/kaola-workflow-next` or `/kaola-workflow-finalize` Skill invocation, which emits a fresh Skill
tool call and reloads the complete prompt. A real `/compact` completes, and both a
previously-uninvoked Skill and a re-invoked Skill emit fresh Skill tool calls after it. ACP
exposes no `available_commands_update`, so no command-catalog visibility is claimed; a real 1M
auto-compact leg was not run and is explicitly unverified.

The generated skills carry only the one-line pointer to that carrier — they do not restate the
dispatch contract or adapter facts.

## Model and dispatch adapter

ZCode installs no Kaola role profiles, so there is no profile binding to pin: generated dispatch
prose names no `subagent_type="<kaola role>"` target and invents no per-call model field. Earlier
releases pinned `model: GLM-5.3` plus a `thoughtLevel` key on each rendered profile; that profile
carrier retired with the role catalog under #1062.

ZCode documents automatic subagent selection and native `@` dispatch. If a live session
exposes an Agent call with named types, its schema wins. The public documentation does not publish
one complete JSON call schema, so the adapter names no unverified call fields. `general-purpose`
and read-only `Explore` remain truthful alternatives when the live catalog exposes them; neither
may impersonate a Kaola role. ZCode children cannot spawn descendants.

## Discovery and installation

ZCode discovers skills at workspace scope (`.zcode/skills/`) and user scope
(`${ZCODE_HOME:-~/.zcode}/skills/`); subagent profiles are discovered only at user scope. A
project install stages skills under `<target>/.zcode/skills/`; it deploys no Kaola agent
profiles at any scope. On upgrade the installer sweeps retired managed-marker files from both
`<target>/.zcode/agents/` staging and `${ZCODE_HOME:-~/.zcode}/agents/`, and retires the three
legacy command basenames from the resolved scope's `commands/` directory, preserving every
user-authored file.

`./install-zcode.sh [--target DIR] [--forge=github|gitlab|gitea] [--global] [--regenerate]
[--uninstall] [--no-scripts] [--yes]`

- A project install deploys skills, installs shared support scripts, and writes no
  Kaola hook declaration.
- `--global` deploys the user-scope skills without writing an ambient repository or
  executable hook mapping.
- Upgrade strips receipt-owned legacy Kaola entries from both the user CLI config and project
  `.zcode/config.json`, while preserving foreign entries and keys.
- Uninstall removes only receipt-owned/deployed Kaola files and declarations.

## Why this edition has no hooks

The live App did prove that project hook declarations could be reviewed, approved, and executed.
An interim Issue #1044 design then placed prompt binding in `PreToolUse`. A real
`/workflow-next` run immediately self-locked: the hook denied the binding tool that was supposed to
satisfy the same gate. This is direct evidence against a tool-gated prompt protocol, not evidence
for adding more hook phases.

The final adapter therefore installs no `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, or `Stop` Kaola hook. Ordinary tool use adds 0 Kaola recovery bytes and starts 0
Kaola recovery subprocesses. The always-loaded AGENTS.md managed region remains the prompt
authority across compaction, and the invoked Skill body is the operation authority. Legacy trust
records may remain inert in ZCode-owned state, but without
a declaration they execute nothing; the installer does not advertise or require a hook approval
flow.
