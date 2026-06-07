non_tdd_reason: documentation (ADR + architecture + CLAUDE + README)

build-green: node scripts/validate-workflow-contracts.js → "Workflow contract validation passed"
regression-green: node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed"

stale-token-check:
  grep -c ready_to_dispatch_first_node README.md → 0
  grep -c ready_to_dispatch_first_node CLAUDE.md → 0
  grep -c ready_to_dispatch_first_node docs/architecture.md → 0

files-written:
  - docs/decisions/0005-plan-run-owns-node-lifecycle.md (NEW ADR — Accepted, Issue #272)
  - docs/architecture.md (atomicity layer + lean-orchestrator boundary updated)
  - CLAUDE.md (handoff bullet updated; adaptive-node bullet added; 87 lines < 200)
  - README.md (workflow-planner agent table + adaptive path section updated)

frozen-core-untouched: confirmed (no edits to scripts/ or commands/ files)
out-of-lane-untouched: confirmed (no edits outside the 4-file write set)
