# Documentation Index

**Start here: [The mission list](mission-list.md)** — the file convention that *is* the workflow. One
file per run, four fields per item, three write moments. Its design record is
[ADR 0017](decisions/0017-the-mission-list.md).

## Core

- [The mission list](mission-list.md) — the run record: `item` / `status` / `dispatched` / `result`.
- [Architecture](architecture.md) — system structure and data flow.
- [API](api.md) — script CLIs, envelopes, and external contracts.
- [Conventions](conventions.md) — coding, testing, Git, and review rules.
- [Workflow State Contract](workflow-state-contract.md) — durable state and the generated roadmap mirror.
- [Agent Source](agents-source.md) — vendored agent provenance and refresh procedure.

## Runtime editions

- [opencode Edition](opencode-edition.md) — additive opencode runtime (`opencode.json` + `.opencode/` tree; provider-open two-tier effort mapping; installs via `install-opencode.sh`).
- [kimi Edition](kimi-edition.md) — additive Kimi Code runtime (`.kimi/skills/` tree + managed `[[hooks]]` block; roles as Skills, inherit-only model tier; installs via `install-kimi.sh`).

## Decisions

[`decisions/`](decisions/) holds the full catalog. Two records describe what ships today; the rest are
history, and most of them describe the node/DAG executor that ADR 0017 retired.

- **[0017 — The mission list: four fields where the DAG was](decisions/0017-the-mission-list.md)** — the
  design of record. A run is one file of `item` / `status` / `dispatched` / `result`, written at three
  moments, with no script required. Concurrency carries no machinery. The sink reports and the
  orchestrator owns the outcome; the refusal count in the run design is zero. Derived additively from
  an observed bare-session run, not by subtracting from the DAG.
- **[0016 — The substrate: bookkeeping over gates](decisions/0016-the-substrate-bookkeeping-over-gates.md)** —
  completed by 0017. *Delete the verdict, keep the measurement.* Read it for why the finalize door and
  the sink measure and report rather than refuse.

Everything numbered 0001–0015 and every `D-NNN-NN` record predates 0017. They remain accurate as
history and as rationale for machinery that still ships around the run (claim, roadmap, sink, release,
reviewer-profile generation, the runtime editions) — but where one describes plan grammar, role nodes,
write sets, gates, epochs, or typed refusals, 0017 supersedes it.

## Other

- [Investigations](investigations/) — investigation notes and analysis documents.
- [Audits](audits/) — one-off audit records.
- [Changelog](../CHANGELOG.md) — user-visible changes.
