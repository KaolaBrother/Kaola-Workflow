# Workflow Plan — issue #247 (docs: unify the task→`in_progress` flip trigger)

<!-- plan_hash: 80251a831e152cac3fc1b0c171c2bb8ffc0223bb1ddc3fec0b4b7d5e4a15c67e -->

Docs-only / low-cosmetic. Fix a prose contradiction between the adaptive `kaola-workflow-adapt`
(establish-time) and `kaola-workflow-plan-run` (run-time) surfaces about WHEN the orchestrator
flips a node's task to `in_progress`. Adapt-side currently says flip "when it opens that node
(via `open-next`)"; plan-run-side says flip "when you dispatch its role (after `open-next`)".
**Canonical trigger = flip `in_progress` at DISPATCH** (per the issue recommendation). Normalize the
adapt-side wording (4 files) to the dispatch trigger and pin the vague codex adapt SKILL to it; the
plan-run-side (4 files) already says "dispatch" but is normalized to one byte-identical clause.
Byte-consistent across all four editions; verified by `simulate-workflow-walkthrough.js`. No script
logic changes.

Coordination (issue #279 runs concurrently): #279 edits `commands/kaola-workflow-plan-run.md` in the
repair-routing section plus validator/schema/node/reviewer files. Confine THIS plan's plan-run.md
edits to the task-flip lines (the `in_progress`/`completed` clause only) so the branches rebase clean.

## Meta
labels: documentation, area:workflow-phases

## Nodes

| id          | role          | depends_on | declared_write_set                                                                                                                                                                                  | cardinality | shape    |
|-------------|---------------|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------|----------|
| adapt-side  | implementer   | —          | commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md | 1           | sequence |
| planrun-side| implementer   | adapt-side | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md | 1           | sequence |
| review      | code-reviewer | planrun-side | —                                                                                                                                                                                               | 1           | sequence |
| finalize    | finalize      | review     | CHANGELOG.md                                                                                                                                                                                       | 1           | sequence |

## Node Ledger

| id          | status  |
|-------------|---------|
| adapt-side  | complete |
| planrun-side| complete |
| review      | complete |
| finalize    | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (adapt-side) | subagent-invoked | node: adapt-side (implementer) | |

| implementer (planrun-side) | subagent-invoked | node: planrun-side (implementer) | |
| code-reviewer | subagent-invoked | node: review (code-reviewer, G1 — post-dominates adapt-side + planrun-side) | |
| finalize (finalize) | subagent-invoked | # Finalize node evidence — issue #247 | |
## Node Briefs

Informational only (not covered by `plan_hash`, which hashes `## Meta` + `## Nodes`).

- **adapt-side** (`implementer`, `non_tdd_reason`: prose/markdown edit to authoritative command +
  skill text — no failing unit test exists for documentation wording; behavior-preserving doc fix).
  In all 4 adapt-side files, change the flip trigger from "when it opens that node (via `open-next`)"
  to the canonical DISPATCH clause: the executor flips each task `in_progress` **when it dispatches
  that node's role (after `open-next`)** and `completed` after the commit step closes it (`n/a` nodes
  → skipped). The codex adapt SKILL (`plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`)
  is currently vague ("flips `in_progress`/`completed` per node") — PIN it to the same dispatch
  trigger. Keep the clause byte-identical across the four edition surfaces.
- **planrun-side** (`implementer`, `non_tdd_reason`: prose/markdown normalization — no failing unit
  test for doc wording; behavior-preserving). depends_on adapt-side so this agent reads the canonical
  dispatch clause adapt-side committed and mirrors it byte-for-byte. The plan-run command files
  already say "dispatch" but the plan-run SKILL phrasing differs ("when its role is dispatched" vs
  "when you dispatch its role") — normalize all 4 plan-run surfaces to ONE byte-identical clause
  matching adapt-side. CONFINE the `commands/kaola-workflow-plan-run.md` edit to the task-flip
  `in_progress`/`completed` clause only (issue #279 concurrently edits the repair-routing section of
  the same file) so the two branches rebase cleanly.
- **review** (`code-reviewer`, G1 post-dominance over both implement nodes). Verify byte-consistency
  of the canonical clause across all 8 files; confirm no script-logic change; confirm plan-run.md
  edit stayed confined to the task-flip lines (#279 rebase-safety). Read-only.
- **finalize** (sink). Add a CHANGELOG entry under `[Unreleased]`; run
  `node scripts/simulate-workflow-walkthrough.js` (must exit 0 with the pass sentinel). Docs/state
  writes only.
