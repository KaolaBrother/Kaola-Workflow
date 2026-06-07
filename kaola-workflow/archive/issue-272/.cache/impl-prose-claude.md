non_tdd_reason: prose/contract documentation rewrite (command + skill + agent-profile markdown — no executable logic added or modified)

build-green: node scripts/validate-vendored-agents.js — PASSED (13 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1)

regression-green: node scripts/simulate-workflow-walkthrough.js — fails at testContractValidatorOfflineSkip as expected (see deferred-validator note below); all other tests PASSED. The walkthrough regression itself does NOT assert adapt/plan-run prose tokens directly — the failure is caused by validate-workflow-contracts.js (still pinning ready_to_dispatch_first_node at line 543) which is called inside testContractValidatorOfflineSkip.

deferred-validator: validate-workflow-contracts.js and validate-kaola-workflow-contracts.js remain RED by design — they still pin ready_to_dispatch_first_node (line 543 / line 451). The repin to ready_to_run is the NEXT node (impl-validators). This mid-run RED is documented in the blueprint: "npm test is RED between impl-prose-claude (token rename in prose) and impl-validators (repins). Per-node barrier (commit-node) is the gate, NOT npm test."

no-out-of-lane: Confirmed. Only the 6 files in this node's write set were modified:
  1. commands/kaola-workflow-adapt.md
  2. commands/kaola-workflow-plan-run.md
  3. plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
  4. plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
  5. agents/workflow-planner.md
  6. plugins/kaola-workflow/agents/workflow-planner.toml

No frozen-core/out-of-lane file was touched:
  - scripts/kaola-workflow-next-action.js — not touched
  - scripts/kaola-workflow-commit-node.js — not touched
  - scripts/kaola-workflow-plan-validator.js — not touched
  - scripts/kaola-workflow-adaptive-schema.js — not touched
  - scripts/kaola-workflow-resolve-agent-model.js — not touched
  - scripts/validate-workflow-contracts.js — not touched (impl-validators owns this)
  - scripts/validate-kaola-workflow-contracts.js — not touched (impl-validators owns this)

## Summary of changes

### Token rename (ready_to_dispatch_first_node → ready_to_run)
- commands/kaola-workflow-adapt.md: renamed in "Read the handoff packet" branch
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md: renamed in same section
- agents/workflow-planner.md: renamed in Durable return contract + output contract JSON (×3 occurrences)
- plugins/kaola-workflow/agents/workflow-planner.toml: renamed in output contract

### Handoff "opens node1 / records baseline" prose removed
- adapt.md: planner dispatch prompt updated; "node1 baseline+ledger" prose updated
- adapt SKILL.md: same two locations updated
- agents/workflow-planner.md: Method step 4 updated; Durable return contract updated
- workflow-planner.toml: step 4 updated

### Checklist JSON updated
- agents/workflow-planner.md: dropped first_node_opened + baseline_recorded; kept claim_acquired, plan_in_grammar, plan_frozen, resume_check_ok, roadmap_staged
- workflow-planner.toml: output contract updated to match

### ready_to_run branch: dispatch-first-node removed → route to plan-run
- adapt.md: branch now routes directly to /kaola-workflow-plan-run (plan-run owns full lifecycle via adaptive-node.js)
- adapt SKILL.md: same

### commands/kaola-workflow-plan-run.md: core rewrite
- Resume Detection: contractor Agent call replaced with adaptive-node.js orient --project P --json (READ-ONLY)
- Per-Node Loop intro: contractor/agent language replaced with "main session owns loop + runs script transactions" (ADR 0004/0005)
- Step 1: contractor bracket replaced with adaptive-node.js open-next --project P --json (uniform for first node)
- Step 2: dispatch unchanged; added record-evidence --stdin step (load-bearing for step 3 evidence check)
- Step 3: contractor prompt replaced with close-and-open-next typed transaction; all a/b/c/e/d semantics preserved (now SCRIPT-ENFORCED)
- Step 4: halt via write-halt --reason consent|test_thrash; BOTH consent+security markers documented

### plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md: mirror of plan-run.md changes
- All Codex invocations use node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" <subcommand>
