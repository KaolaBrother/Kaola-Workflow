# Documentation Docking — issue-287 (Phase 6)

## Changed files reviewed (git diff vs origin/main merge-base)
- agents/workflow-planner.md — boundary refusal `planner_control_boundary_violation` + carve-out + 4th return mode
- commands/kaola-workflow-adapt.md (+ gitlab/gitea mirrors) — planner-first ordering + task-list timing
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md — codex mirror of the boundary prose
- scripts/validate-workflow-contracts.js (+ plugins/kaola-workflow/scripts/ byte-twin) — 4 token pins
- scripts/validate-kaola-workflow-contracts.js — codex skill token pin
- docs/decisions/0006-planner-first-entry.md — NEW ADR (the architecture decision record)
- CHANGELOG.md — [Unreleased] ### Changed entry

## Documents checked vs change
- **ADR (docs/decisions/0006-planner-first-entry.md)**: DOCKED — authored by the `doc-sync` node; captures Context/Decision/Consequences of the planner-first boundary. This is the canonical architecture record for the change.
- **CHANGELOG.md**: DOCKED — [Unreleased] ### Changed entry summarizes the invariant, the new typed refusal, the carve-out, task-list timing, and the cross-edition contract pins.
- **docs/architecture.md**: no separate edit required — the planner/main-session boundary is an architecture *decision*, recorded in docs/decisions/0006 per the project's "docs/decisions/ — architecture decision records" convention; architecture.md references the decisions dir. The frozen finalize write set is CHANGELOG.md only, so an architecture.md edit was deliberately scoped to the ADR by the plan.
- **docs/api.md**: no impact — `planner_control_boundary_violation` is agent-profile *behavioral prose*, not a new script subcommand/CLI flag/JSON field (recon confirmed no script receives the dispatch prompt). No api.md surface changes.
- **README.md**: no impact — no new install step, usage example, or env var.
- **docs/conventions.md / docs/workflow-state-contract.md**: no impact — no coding/test/Git convention or durable-state contract change.
- **.env.example**: no impact — no new environment variable.

## Gaps found and fixed
- None. All public/behavioral surfaces of the change are reflected in the ADR + CHANGELOG; every other doc class has an explicit no-impact reason above.

## Final verdict: DOCKED
