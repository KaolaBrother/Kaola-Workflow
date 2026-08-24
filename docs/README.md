# Documentation Index

**Start here: [The mission list](decisions/0017-the-mission-list.md)** — the design record for the
convention that *is* the workflow, and why it is one file per run, four fields per item, three write
moments.

## Core

- [Architecture](architecture.md) — system structure and data flow. Includes
  [Runtime capability divergence](architecture.md#runtime-capability-divergence) — the one place the
  runtimes' differences are recorded (dispatch carrier, command/skill surface, hooks, model &
  tier, install path), as a tier label plus a pointer per cell, never a restated mechanism.
- [API](api.md) — script CLIs, envelopes, and external contracts.
- [Conventions](conventions.md) — coding, testing, Git, and review rules.
- [Workflow State Contract](workflow-state-contract.md) — durable state, and why the forge, not a
  local file, is the backlog.
- [Agent Source](agents-source.md) — vendored agent provenance and refresh procedure.

## Runtime editions

- [opencode Edition](opencode-edition.md) — additive opencode runtime (`opencode.json` + `.opencode/` tree; model and effort inherited from the session, with canonical `fable` classified alongside reasoning for the optional model pin; installs via `install-opencode.sh`).
- [kimi Edition](kimi-edition.md) — additive Kimi Code runtime (`.kimi/skills/` tree + managed `[[hooks]]` block; roles as Skills, inherit-only model tier, including the canonical heavy marker; installs via `install-kimi.sh`).
- [grok Edition](grok-edition.md) — additive Grok CLI runtime (`.grok/agents/` + `.grok/commands/` + hooks JSON; named `spawn_subagent` types; session-inherited model with standard/reasoning/heavy effort tiers (`medium`/`high`/`xhigh`, with heavy verified live); installs via `install-grok.sh`).
- [cursor Edition](cursor-edition.md) — additive Cursor runtime (`.cursor/agents/` + `.cursor/commands/` + merged `hooks.json`; named `Task` types load from the workspace `.cursor/agents` tree, not `~/.cursor/agents`; workspace catalog is refreshed byte-identically from `$CURSOR_HOME/agents`; `--global` from a git work tree dual-writes the project catalog; canonical standard/reasoning/heavy classes render unquoted Grok 4.6 medium/high/xhigh frontmatter pins while `Task` omits `model`; `sessionStart` compact resume + catalog-ensure `{}` hook and runtime limits; Cloud Agents may not fire `sessionStart`; installs via `install-cursor.sh`).

## Decisions

[`decisions/`](decisions/) holds the full catalog. ADR 0019 records the three-tier implementation
present on this branch and pending merge to `main`; the remaining entries are current design records
or history, and most of the older records describe the node/DAG executor that ADR 0017 retired.

- **[0019 — The heavy-reasoning tier](decisions/0019-the-heavy-reasoning-tier.md)** — the accepted
  standard/reasoning/heavy axis: planner and code-architect are canonical heavy roles; Codex uses
  Luna/max, Sol/medium, and Sol/high; Grok and Cursor carry heavy effort pins; OpenCode classifies
  `fable` with reasoning and Kimi remains session-inherited. Claude reviewers rest on `opus` with
  one bounded `fable` escalation in command runtime. Additive generated command surfaces omit that
  dynamic reviewer escalation while preserving reviewer scope and acceptance wording.

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
reviewer-profile generation, the runtime editions) — but where one describes plan grammar, role nodes,
write sets, gates, epochs, or typed refusals, 0017 supersedes it.

## Other

- [Investigations](investigations/) — investigation notes and analysis documents.
- [Audits](audits/) — one-off audit records.
- [Changelog](../CHANGELOG.md) — user-visible changes.
