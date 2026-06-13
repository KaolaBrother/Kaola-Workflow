evidence-binding: n11-docs 951099118ade

Documentation for #443 D-420 P1 autopilot driver. Anti-fabrication honored: all CLI/schema/field names transcribed from kaola-workflow-autopilot.js + n1-architect.md (verified against real --json output). Only the 3 declared files touched.

1. CHANGELOG.md — one entry under ## [Unreleased] → ### Added: kaola-workflow-autopilot.js (next/digest), /kaola-workflow-auto command described as ×6 surfaces (3 Claude commands + 3 Codex SKILLs) with script editions noted separately as ×4 (the required wording, NOT the bare-×4-for-a-6-surface-command propagation-gap symptom); six typed stops with ground-truth bindings; receipt seams #429 steps.push_main==='done' / #432 chain-receipt / #441 goal_check / #440 triage; KAOLA_AUTOPILOT_REPAIR consent model (mechanical-class {add_to_write_set, write_set_swap}); readPlanAllDone `$(?![\s\S])` fix; issue-scout backlog_empty shape; lean-orchestrator #44. References #443.

2. docs/architecture.md — new ## Autopilot Driver subsection (between issue-scout and Agent Profile Structure): forge-neutral stage state-machine aggregator; lean-orchestrator boundary #44; next/digest subcommands; receipt-seams table (#429/#432/#441/#440 with exact fields); six typed stop reasons table; KAOLA_AUTOPILOT_REPAIR ask|auto + mechanical-class boundary + KAOLA_GOAL; append-only digest crash-resume; backlog_empty; readPlanAllDone ledger-last fix; one-bundle-per-invocation; AUTO_COMMAND/AUTO_SKILL exports; ×6 route-reachability. Forge-neutral.

3. docs/decisions/D-443-01.md (NEW, D-442-01 house format) — D1 pure receipt-reader/zero-dispatch, D2 stateless next, D3 digest crash-resume (ISO ts `.replace(/\.\d{3}Z$/,'Z')`), D4 one-bundle-per-invocation, D5 structural stops + verified ground-truth field table; mechanical-class boundary; readPlanAllDone regex fix; edition strategy + registration surface; consequences note the .env.example KAOLA_AUTOPILOT_REPAIR as an out-of-lane follow-up.

write_set (exactly the three declared, no out-of-lane writes): CHANGELOG.md (modified), docs/architecture.md (modified), docs/decisions/D-443-01.md (created).
