# Documentation docking — #1053 (candidate 1b779b38)

| file | status | note |
|---|---|---|
| README.md | fixed | Workflow Next bullet extended with task-clarity + verification-scope guidance; links docs/task-quality.md |
| docs/api.md | fixed | "Task-clarity guidance (#1053)" subsection: two generated prose passages, no new CLI/flag/envelope/contract |
| docs/README.md | fixed | Core bullet → task-quality.md |
| docs/task-quality.md | added | short guide; both skeleton passages quoted verbatim (reviewer-verified) |
| CHANGELOG.md `[Unreleased]` | fixed | Added + Changed entries; no API; no test-result or performance claim |
| docs/architecture.md | no impact | no structural change; generation seam unchanged |
| docs/decisions/ | no impact | issue states no new ADR; ADR 0017/0023 unchanged and still accurate |
| docs/runtime-capabilities.md, *-edition.md | no impact | no runtime adapter or capability change; edition renders re-generated from the same source |
| templates/agents/*, agents/ | no impact | no role change |

Validator: `node scripts/validate-workflow-contracts.js` exit 0 (doc-updater run, orchestrator re-run inside npm test).
Status: DOCKED
