# Documentation docking — issue-1111

Candidate: `c54d905df65fffb9917947a6d121a1e4b3f75952`

This file is the docking record the installed v12.3.1 finalization prompt still requires. ADR 0030 decision 4 retires that requirement for runs that load the #1111 prompt. The lifecycle record those later runs use is `finalization-summary.md`.

## Checked

- `README.md` — updated. Finalization is recorded acceptance evidence, closure, archive, and delivery. The runtime table points subagent use at the live host schema. Dated route measurements are named as evidence in `docs/runtime-capabilities.md`, not as prompt instructions.
- `docs/README.md` — updated. The edition index no longer names `spawn_subagent`, `Task`, or `subagent` as the current instruction. It states that per-issue QA and documentation docking are not a second ceremony.
- `docs/api.md` — updated. Compact recovery no longer says the reloaded prompt carries a mandatory dispatch contract. The Codex installer and preflight rows report config values that were read, leave `dispatch_posture` null, and state that the report is not a session tool inventory or a refusal.
- `docs/architecture.md` — updated. The lifecycle sketch and the runtime-adapter paragraph match ADR 0030: no dispatch policy, dated measurements kept separate from the prompt.
- `docs/installation.md` — updated. Installer and doctor text matches the preflight row above.
- `docs/conventions.md` — updated. Current sections no longer teach dispatch-versus-inline, a Codex `spawn_agent` tutorial, or a mandatory dispatch contract. Resume locators match the Next prompt.
- `docs/workflow-state-contract.md` — updated. Subagent use belongs to the running harness and the user's instructions. `details` records what went out and where the output was to land.
- `docs/agents-source.md` — updated. It no longer credits `runtime-capabilities.json` with owning native routes.
- `docs/runtime-capabilities.md` — updated. Compact-recovery rows no longer claim a mandatory dispatch contract. The dated capability map stays labeled as measurement.
- Edition docs (`docs/cursor-edition.md`, `docs/devin-edition.md`, `docs/droid-edition.md`, `docs/dsh-edition.md`, `docs/grok-edition.md`, `docs/kimi-edition.md`, `docs/opencode-edition.md`, `docs/zcode-edition.md`) — updated. Current behavior points at the live host schema and the dated measurements. Historical catalog sections stay labeled as measurements.
- `CHANGELOG.md` — `[Unreleased]` Changed records the #1111 subtraction, the Claude config-fact report, the carrier sizes (Grok 4889 B, Cursor 4943 B), and the workflow-state contract change, and points at ADR 0030.
- `docs/decisions/0030-forge-and-engineering-lifecycle.md` — new accepted record for the responsibility split. `docs/decisions/0029-native-subagents-only.md` keeps the role retirement and points decision 2 at ADR 0030.
- `AGENTS.md` — updated. Runtime-adapter facts are instruction loading, compact recovery, and install scope. Dispatch policy is named as absent, with ADR 0029 and ADR 0030.
- Examples — no-impact beyond the README table, which was updated. Historical changelog entries and `kaola-workflow/archive/` keep their original wording.

DOCKED
