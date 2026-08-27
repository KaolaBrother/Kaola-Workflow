# Documentation Index

**Start here: [The mission list](decisions/0017-the-mission-list.md)** — the design record for the
convention that *is* the workflow, and why it is one file per run, four fields per item, three write
moments.

## Core

- [Architecture](architecture.md) — system structure and data flow, including the AGENTS-first
  authority graph and generated-role boundary.
- [Runtime Capabilities](runtime-capabilities.md) — first-party evidence for direct `AGENTS.md`
  loading or Claude's thin bridge, plus native profile discovery, dispatch and fallback routes,
  default tier carriers, runtime limits, hooks, paths, precedence, and known unknowns for all seven
  runtimes.
- [API](api.md) — script CLIs, envelopes, and external contracts.
- [Conventions](conventions.md) — coding, testing, Git, and review rules.
- [Workflow State Contract](workflow-state-contract.md) — durable state, and why the forge, not a
  local file, is the backlog.
- [Agent Behavior Sources and Provenance](agents-source.md) — the 14-role behavioral authority,
  nine adapter variants, 126-render manifest, ECC attribution, and refresh procedure.

## Runtime editions

- [opencode Edition](opencode-edition.md) — direct `AGENTS.md`, native generated profiles, session
  inheritance, permissions, hooks, and installer behavior.
- [Kimi Edition](kimi-edition.md) — direct chained `AGENTS.md`, native custom-agent profiles,
  session-owned model/thinking, hooks, and installer behavior.
- [Grok Edition](grok-edition.md) — direct root-to-cwd `AGENTS.md`, generated named agents,
  session-inherited model with native effort pins, and hooks.
- [Cursor Edition](cursor-edition.md) — direct root/nested `AGENTS.md`, generated named agents,
  CLI vs App product surfaces (App local IDE vs Cloud hosts), live-enum routing (CLI omit-model vs
  Cloud catalog-miss), and hooks.
- [ZCode Edition](zcode-edition.md) — direct user-plus-workspace `AGENTS.md`, user-scope generated
  agents, `thoughtLevel`, known hook limits, and explicit version/relocation unknowns.

## Decisions

[`decisions/`](decisions/) holds the full catalog. ADR 0020 records the AGENTS-first repository and
role-authority architecture; ADR 0021 adds the runtime-native next/finalize guidance boundary. ADR
0017 remains the Mission List design of record; #1037 refines outcome-level missions, custody vs
carrier, and active-run layout adoption without adding fields. Most older records describe the
node/DAG executor that
ADR 0017 retired or the Claude-first role generation that ADR 0020 supersedes.

- **[0021 — Runtime-native orchestration guidance](decisions/0021-runtime-native-orchestration-guidance.md)**
  — common per-item judgment, honest fallback, adapter-rendered native capability exposure, and
  owner-approved default tier bindings without a Kaola scheduler or invented runtime limits.

- **[0020 — AGENTS-first runtime bridges](decisions/0020-agents-first-runtime-bridges.md)** — one
  universal repository authority, one behavioral source for all 14 roles, evidence-backed native
  adapters, prompt-external provenance, and ownership-safe migration. ADR 0021 refines its
  orchestration/model-routing clauses without changing those authorities.

- **[0019 — The heavy-reasoning tier](decisions/0019-the-heavy-reasoning-tier.md)** — historical
  basis for the accepted
  standard/reasoning/heavy axis: planner and code-architect are canonical heavy roles; Codex uses
  Luna/max, Sol/medium, and Sol/high; Grok and Cursor carry heavy effort pins; OpenCode classifies
  `fable` with reasoning and Kimi remains session-inherited. Claude reviewers rest on `opus` with
  one bounded `fable` escalation in command runtime. Additive generated command surfaces omit that
  dynamic reviewer escalation while preserving reviewer scope and acceptance wording. ADR 0020
  supersedes its Claude-shaped role-source details; ADR 0021 retains the runtime binding matrix as
  default dispatch policy while replacing the old rendering mechanism.

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

Everything numbered 0001–0015 and every `D-NNN-NN` record predates 0017. They remain accurate as
history and as rationale for machinery that still ships around the run (claim, sink, release,
role-profile generation, the runtime editions) — but where one describes plan grammar, role nodes,
write sets, gates, epochs, or typed refusals, 0017 supersedes it.

## Other

- [Investigations](investigations/) — investigation notes and analysis documents.
- [Audits](audits/) — one-off audit records.
- [Changelog](../CHANGELOG.md) — user-visible changes.
