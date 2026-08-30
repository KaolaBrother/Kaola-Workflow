# Kaola-Workflow · ZCode Edition

ZCode is a coding-agent runtime, not a git forge. Its generated commands and 14 role profiles come
from the same routing and behavior authorities as the other runtime editions. The focused suite is
`node scripts/test-zcode-edition.js`.

ZCode loads user-global `~/.zcode/AGENTS.md` and workspace-root `AGENTS.md` directly. `CLAUDE.md` is
onboarding migration input, not an ongoing bridge. The locally measured product was ZCode App
`3.10.1` / build `3.10.1.6272`; its bundled CLI was available through the App, while a standalone
ZCode executable or binary was absent from `PATH`. Live named-subagent/model resolution remains
**unknown**.

The same live session reported a 1,000,000-token context window and used only 32,730 tokens during
the probe. That measurement supports keeping Issue #1044's compact-recovery mechanism off ZCode:
one normal Workflow Next run is not expected to consume this window, and an unobserved compact
class does not justify a prompt-lifecycle gate.

## Forge axis and generated surface

`./install-zcode.sh` uses the GitHub-shaped `.zcode/` source. `--forge=gitlab` and
`--forge=gitea` select `.zcode-gitlab/` and `.zcode-gitea/`; unknown forges refuse with exit 2.

`node scripts/sync-zcode-edition.js --write` renders, for each forge:

- `.zcode/agents/<role>.md`: native ZCode profile frontmatter and shared behavior identity.
- `.zcode/commands/<name>.md`: the routing-registry command set with ZCode runtime guidance.
- `.zcode/config.json`: an empty deterministic hook declaration object.
- `.zcode/kaola-workflow/scripts/`: support-script launchers used by the command surface.

Issue #1044 generates no ZCode prompt components and no hook shell. `--check` re-renders and
byte-compares; `--refresh-present` updates only edition trees already present.

## Model and dispatch adapter

The runtime-neutral intent classes render as:

| intent | ZCode profile |
|---|---|
| standard | `model: GLM-5.3`, `thoughtLevel: high` |
| reasoning | `model: GLM-5.3`, `thoughtLevel: max` |
| heavy | `model: GLM-5.3`, `thoughtLevel: max` |

The key is `thoughtLevel`, NOT reasoningEffort, and it is paired with an explicit `model`. The
profile carries the model/thought default, so generated dispatch prose does not invent a per-call
model field.

ZCode documents automatic subagent selection and native `@<role>` dispatch. If a live session
exposes an Agent call with named types, its schema wins. The public documentation does not publish
one complete JSON call schema, so the adapter names no unverified call fields. `general-purpose`
and read-only `Explore` remain truthful alternatives when the live catalog exposes them; neither
may impersonate a missing custody-bearing Kaola role. ZCode children cannot spawn descendants.

## Discovery and installation

ZCode discovers subagent profiles at user scope. A project install stages profiles and commands
under `<target>/.zcode/` and synchronizes profiles to `${ZCODE_HOME:-~/.zcode}/agents/`. The
project profile directory is installer staging, not independent discovery evidence.

`./install-zcode.sh [--target DIR] [--forge=github|gitlab|gitea] [--global] [--regenerate]
[--uninstall] [--no-scripts] [--yes]`

- A project install deploys agents and commands, installs shared support scripts, and writes no
  Kaola hook declaration.
- `--global` deploys the user-scope agents and commands without writing an ambient repository or
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
Kaola recovery subprocesses. The initial command remains the prompt authority for the measured
one-million-token session. Legacy trust records may remain inert in ZCode-owned state, but without
a declaration they execute nothing; the installer does not advertise or require a hook approval
flow.
