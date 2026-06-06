# Workflow Plan — issue-255

<!-- plan_hash: 6e54312470db9baf81ff645989296d31bfc72a70e00a6251f5af6d0249769e33 -->

Collapse the fresh adaptive **planner-to-first-node handoff** into a deterministic, script-owned
transaction (ADR 0004, #255). Add `scripts/kaola-workflow-adaptive-handoff.js`: a pure-mechanical
script the `workflow-planner` RUNS (never judges) that COMPOSES the existing `plan-validator.js`,
`next-action.js`, and `commit-node.js` cores by shelling them, then branches on the validator
`--json` verdict — `decision:auto-run` → freeze + bookkeeping + open node1 + record baseline →
`ready_to_dispatch_first_node`; `decision:ask` + no `--authorized` → `needs_user_approval` (no
mutation); `ask` + `--authorized` → ready; `result:refuse` → `typed_refusal`. The planner `#44`
boundary shifts from "never freeze" to "never *judge* risk; the script freezes mechanically iff the
validator decision is auto-run". The four shelled cores
(`kaola-workflow-plan-validator.js`, `kaola-workflow-claim.js`, `kaola-workflow-next-action.js`,
`kaola-workflow-commit-node.js`) are NOT edited — the in-flight executor shells them per node; the
handoff script only composes them.

The change spans ~17 files across the four editions and shared surfaces. Top-level-directory
collisions across `scripts/` and `plugins/` make a fan-out impossible (the disjointness check is at
top-level-dir granularity), so the implement work is a SERIALIZED chain of single-concern `tdd-guide`
nodes (each reaches the next → no concurrent write antichain), each ≤ FILE_CEILING (6) declared
paths, under one trailing `code-reviewer` (G1) that post-dominates the whole implement chain.

Sensitivity: labels are `area:scripts, area:workflow-phases, enhancement` (none in SENSITIVE_LABELS)
and no declared write-set path matches a Phase-5 SENSITIVE_PATTERN → no G2 / `security-reviewer` node
is required. The issue changes README/CLAUDE public surfaces, so a `doc-updater` node runs before the
`finalize` sink; the sink writes docs/state only (`CHANGELOG.md`). G1 post-dominance holds through
the `review → finalize` and `review → docs → finalize` fan-in: nothing downstream of `review`
produces code (docs writes `.md`, finalize writes `CHANGELOG.md`, both docs-exempt).

## Meta

labels: area:scripts, area:workflow-phases, enhancement

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| explore | code-explorer | — | — | 1 | sequence |
| plan | planner | explore | — | 1 | sequence |
| impl-handoff | tdd-guide | plan | scripts/kaola-workflow-adaptive-handoff.js, scripts/test-adaptive-handoff.js | 1 | sequence |
| impl-wire | tdd-guide | impl-handoff | plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js, scripts/validate-script-sync.js, package.json | 1 | sequence |
| impl-planner-profile | tdd-guide | impl-wire | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 1 | sequence |
| impl-adapt-contract | tdd-guide | impl-planner-profile | commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md | 1 | sequence |
| impl-sim | tdd-guide | impl-adapt-contract | scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| review | code-reviewer | impl-sim | — | 1 | sequence |
| docs | doc-updater | review | README.md, CLAUDE.md | 1 | sequence |
| finalize | finalize | review, docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | notes |
| --- | --- | --- |
| explore | complete | |
| plan | complete | |
| impl-handoff | complete | |
| impl-wire | complete | |
| impl-planner-profile | complete | |
| impl-adapt-contract | complete | complete; orchestrator-authorized out-of-lane amendment: scripts/validate-workflow-contracts.js (#255 handoff un-ban + new-design lock; frozen plan laned no validator file) |
| impl-sim | complete | |
| review | complete | |
| docs | complete | |
| finalize | complete | |
