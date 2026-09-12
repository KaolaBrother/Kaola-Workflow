# Kaola-Workflow · ZCode Edition

ZCode is a coding-agent runtime, not a git forge. Its generated commands come
from the same routing and behavior authorities as the other runtime editions; under ADR 0025
(#1062) ZCode is `native_only` and installs no Kaola role profiles. The focused suite is
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

- `.zcode/commands/<name>.md`: the routing-registry command set with ZCode runtime guidance.
- `.zcode/config.json`: an empty deterministic hook declaration object.
- `.zcode/kaola-workflow/scripts/`: support-script launchers used by the command surface.

ZCode is a native_only runtime under #1062: the render produces no `.zcode/agents/` role
profiles. Older releases installed a Kaola agent roster there and synced it to user scope; the
installer now sweeps only managed-marker retired files and never touches user-authored agents.

Issue #1044 generates no ZCode prompt components and no hook shell. `--check` re-renders and
byte-compares; `--refresh-present` updates only edition trees already present.

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

ZCode discovers subagent profiles only at user scope. A project install stages commands under
`<target>/.zcode/`; it deploys no Kaola agent profiles at any scope. On upgrade the installer
sweeps retired managed-marker files from both `<target>/.zcode/agents/` staging and
`${ZCODE_HOME:-~/.zcode}/agents/`, preserving every user-authored file.

`./install-zcode.sh [--target DIR] [--forge=github|gitlab|gitea] [--global] [--regenerate]
[--uninstall] [--no-scripts] [--yes]`

- A project install deploys commands, installs shared support scripts, and writes no
  Kaola hook declaration.
- `--global` deploys the user-scope commands without writing an ambient repository or
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
