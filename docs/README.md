# Documentation Index

**Start here: [The mission list](decisions/0017-the-mission-list.md)** — the design record for the
convention that *is* the workflow, and why it is one file per run, four fields per item, three write
moments.

## Core

- [Architecture](architecture.md) — system structure and data flow, including the AGENTS-first
  authority graph and generated-role boundary.
- [Installation](installation.md) — shortest correct all-runtime setup, per-runtime scopes, Cursor
  Cloud lifecycle, update, verification, and uninstall.
- [Runtime Capabilities](runtime-capabilities.md) — first-party evidence for direct `AGENTS.md`
  loading or Claude's thin bridge, plus native profile discovery, dispatch and fallback routes,
  the per-adapter subagent default binding, runtime limits, hooks, paths, precedence, and known
  unknowns for all eight runtime families.
- [API](api.md) — script CLIs, envelopes, and external contracts.
- [Task Quality](task-quality.md) — how to express a task's outcome and acceptance basis in a forge
  issue so the Next route can proceed without a fixed requirement template.
- [Conventions](conventions.md) — coding, testing, Git, and review rules.
- [Workflow State Contract](workflow-state-contract.md) — durable state, and why the forge, not a
  local file, is the backlog.
- [Agent Behavior Sources and Provenance](agents-source.md) — the seven-role behavioral authority,
  six profile-installing adapters, 42-render manifest, source classification with historical
  origin record, and how to add or change a role.

## Runtime editions

- [opencode Edition](opencode-edition.md) — direct `AGENTS.md`, vendor-native dispatch (no Kaola
  role profiles), session inheritance, permissions, hooks, and installer behavior.
- [Kimi Edition](kimi-edition.md) — direct chained `AGENTS.md`, vendor-native dispatch (no Kaola
  role profiles), session-owned model/thinking, hooks, and installer behavior.
- [Grok Edition](grok-edition.md) — direct root-to-cwd `AGENTS.md`, generated named agents pinned
  to `grok-4.6` / `effort: medium`, and hooks.
- [Cursor Edition](cursor-edition.md) — direct root/nested `AGENTS.md`, generated named agents
  pinned to `grok-4.6[effort=medium]`, CLI vs App product surfaces (App local IDE vs saved Cloud
  environments), live-enum routing, host-specific install/reload carriers, and hooks.
- [ZCode Edition](zcode-edition.md) — direct user-plus-workspace `AGENTS.md`, vendor-native
  dispatch (no Kaola role profiles), known hook limits, and explicit version/relocation unknowns.
- [Devin CLI Edition](devin-edition.md) — vendor-harness `run_subagent` dispatch (no Kaola role
  profiles), inline skills, managed global contract, and UserPromptSubmit recovery after
  compaction drops rules.

## Decisions

- **[0025 — Lean orchestrator; one subagent binding per runtime; seven roles](decisions/0025-lean-orchestrator-single-subagent-binding.md)**
  — the orchestrator holds judgment and acceptance; the per-role intent axis and
  the 14-role roster are retired in favor of seven roles; every profile-installing adapter
  declares exactly one `subagent_default` (Claude `sonnet`; Codex `gpt-5.6-luna` / `max` pinned in
  the TOML; Grok `grok-4.6` / `effort: medium`; Cursor `grok-4.6[effort=medium]`); OpenCode, Kimi,
  ZCode, and Devin are `native_only` — no Kaola role profiles, vendor-harness dispatch.

[`decisions/`](decisions/) holds the full catalog. ADR 0021 adds runtime-native next/finalize
guidance; ADR 0022 moves universal behavior to a machine-global contract and compact-safe native
carriers; ADR 0023 makes repository instructions an Agent-maintained outcome; ADR 0024 retires
finalize's parsing of the orchestrator's own records and rewrites role bodies around positioning,
deliverable, custody, and stop condition. ADR 0017 remains the Mission List design of record.
[ADR 0025](decisions/0025-lean-orchestrator-single-subagent-binding.md)
([#1062](https://github.com/KaolaBrother/Kaola-Workflow/issues/1062)) is the landed successor
to ADR 0019's remaining three-tier axis and ADR 0021's three intent classes: lean orchestrator,
7 roles, one `subagent_default` per binding adapter, and `native_only` on OpenCode / Kimi / ZCode /
Devin. Most
older records describe the node/DAG executor retired by ADR 0017 or project-prompt ownership
retired by ADR 0023.

- **[0024 — Finalize measures; roles state positioning; one authority per constant](decisions/0024-finalize-measures-roles-state-one-authority.md)**
  — finalize keeps two durable measurements (`## Validation`, `## Changed Paths`) and stops parsing
  the Mission List or any other orchestrator-authored record as a machine interface; the finalize
  mirror guard decides by content, not a count; role bodies state positioning, deliverable, unique
  custody, and stop condition; one authoring source per constant, with a generated or required
  mirror where a second copy is structurally necessary; validators check interfaces and generation
  guarantees, not prose wording; source classification follows what the current content measurably
  retains.

- **[0023 — Agent-owned project instructions](decisions/0023-agent-owned-project-instructions.md)**
  — the Agent verifies repository facts, maintains project instructions without a prescribed prose
  shape, and obtains authorization before rewriting existing owner-authored content. Scripts expose
  installation evidence but do not own repository prompts.

- **[0021 — Runtime-native orchestration guidance](decisions/0021-runtime-native-orchestration-guidance.md)**
  — common per-item judgment, honest fallback, adapter-rendered native capability exposure, and
  owner-approved default bindings without a Kaola scheduler or invented runtime limits.
  The "exactly three intent classes" clause is superseded by ADR 0025: one `subagent_default`
  per binding adapter; `native_only` adapters declare none.

- **[0022 — Machine-global workflow contract](decisions/0022-machine-global-workflow-contract.md)**
  — one universal source, ten measured host adapters, batch-safe installation, subtractive project
  instructions, and V2 compact recovery that reloads the complete active operation without tool
  hooks or inference-time JavaScript.

- **[0020 — AGENTS-first runtime bridges](decisions/0020-agents-first-runtime-bridges.md)** —
  historical basis for direct `AGENTS.md` discovery, thin bridges, shared role behavior, and native
  adapters. ADR 0023 supersedes its project-instruction ownership and migration clauses; ADR 0021
  retains the routing refinements.

- **[0019 — The heavy-reasoning tier](decisions/0019-the-heavy-reasoning-tier.md)** — historical
  basis for the retired
  three-tier axis: planner and code-architect were its canonical heavy roles; Codex used
  Luna/max, Sol/medium, and Sol/high; Grok and Cursor carried heavy effort pins; OpenCode classified
  `fable` with reasoning and Kimi remained session-inherited. Reviewers rested at reasoning; the
  former Claude-only bounded `fable` reviewer escalation is **retired** (2026-09-11 / #1059;
  surfaces cleared in #1032) — when more power is needed the orchestrator does the work itself.
  ADR 0020 supersedes its Claude-shaped role-source details; ADR 0021 retains the runtime binding
  matrix as default dispatch policy while replacing the old rendering mechanism. The remaining
  three-tier axis, 14-role roster, and Heavy as planner-class default are retired as of ADR 0025
  ([#1062](https://github.com/KaolaBrother/Kaola-Workflow/issues/1062), 12.0.0);
  this file remains the historical record of the three-tier model.

- **[0017 — The mission list: four fields where the DAG was](decisions/0017-the-mission-list.md)** — the
  design of record. A run is one file of `item` / `status` / `dispatched` / `result`, written at three
  moments, with no script required. Concurrency carries no machinery. The sink reports and the
  orchestrator owns the outcome; the refusal count in the run design is zero. Derived additively from
  an observed bare-session run, not by subtracting from the DAG.
- **[0018 — The forge is the backlog](decisions/0018-the-forge-is-the-backlog.md)** — the local backlog
  layer is retired: `.roadmap/issue-N.md` sources and the `ROADMAP.md` mirror are gone, and an issue's
  title, labels, and comments are what the work is — nothing local mirrors them. Priority is a bare
  `P0`–`P3` forge label, ordered (never selected) by `list-open`; the pick step reads each shortlisted
  issue's body and comments before claiming, with comments winning where they contradict the body; and
  finalize now requires a run to comment what it corrected, not only file what it found. The one
  surviving local file is the optional `kaola-workflow/.roadmap/_rules.md`. Migrating an existing
  consumer repo off its old `.roadmap/` sources (ADR §8 step 6) is not yet built. Derived by measuring
  a live consumer and walking every field to a producer; five of its own claims were reversed under
  adversarial review before it stabilized.
- **[0016 — The substrate: bookkeeping over gates](decisions/0016-the-substrate-bookkeeping-over-gates.md)** —
  completed by 0017. *Delete the verdict, keep the measurement.* Read it for why the finalize door and
  the sink measure and report rather than refuse.

Everything numbered 0001–0015 and the `D-NNN-NN` records contemporaneous with the DAG executor
predate 0017. They remain accurate as history and as rationale for machinery that still ships
around the run (claim, sink, release, role-profile generation, the runtime editions) — but where
one describes plan grammar, role nodes, write sets, gates, epochs, or typed refusals, 0017
supersedes it. [D-1050-01](decisions/D-1050-01.md) is a later wording-level note on the
`metric-optimizer` pass-rate branch; it does not restore that machinery.

## Other

- [Investigations](investigations/) — investigation notes and analysis documents.
- [Audits](audits/) — one-off audit records.
- [Changelog](../CHANGELOG.md) — user-visible changes.
