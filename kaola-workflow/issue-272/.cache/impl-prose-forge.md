non_tdd_reason: prose/contract documentation parity (gitlab+gitea commands + agent profiles)

build-green: node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js → Kaola-Workflow GitLab contract validation passed
build-green: node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js → Kaola-Workflow Gitea contract validation passed
build-green: node scripts/validate-vendored-agents.js → Vendored agent validation passed for 13 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1

Files touched (write set — 6 files total):
1. plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
2. plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
3. plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md
4. plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
5. plugins/kaola-workflow-gitlab/agents/workflow-planner.toml
6. plugins/kaola-workflow-gitea/agents/workflow-planner.toml

No frozen-core scripts were touched.
No out-of-lane files were edited (Claude commands at commands/ were read-only reference).

Summary of changes applied (mirrored into both gitlab and gitea editions with forge-specific script names):

adapt.md (both forges):
- Agent prompt step (5): removed "opens node1, records baseline" from handoff description; added "does NOT open node1 or record the node1 baseline — plan-run owns the full node lifecycle including the first node"
- "Read the handoff packet" intro: updated to reflect handoff no longer opens node1/records baseline
- handoff_status: renamed ready_to_dispatch_first_node → ready_to_run; removed "dispatch first_node IMMEDIATELY" clause; routes directly to /kaola-workflow-plan-run {project}; added sentence about plan-run owning the complete node lifecycle via kaola-{forge}-workflow-adaptive-node.js
- "Establish the task list": updated to reference kaola-{forge}-workflow-adaptive-node.js open-next and "commit step closes it"

plan-run.md (both forges):
- Resume Detection: replaced contractor Agent() orient block with direct `node "$KAOLA_SCRIPTS/kaola-{forge}-workflow-adaptive-node.js" orient --project {project} --json` transaction; updated framing from "contractor reports" to "typed resume_state"
- Per-Node Loop framing: replaced "summons the contractor for mechanical brackets" with "runs the adaptive-node transactions directly"; "fused into ONE contractor dispatch" → "fused into ONE close-and-open-next call"; established that main session owns and runs script transactions directly
- Step 1: advance contractor bracket → open-next bash script call with full description
- Step 2: added record-evidence --stdin bash call after role dispatch
- Step 3: commit+advance contractor bracket → close-and-open-next script transaction with (a)-(e) sub-steps
- Step 4: contractor-escalation prose → write-halt bash calls for consent and test_thrash
- Enforcement boundary note: "step 4 above" → "step 3 above"

workflow-planner.toml (both forges):
- Step 4: removed "opens node1, records baseline"; added "does NOT open node1 or record the node1 baseline — plan-run owns the full node lifecycle including the first node"
- Output contract: ready_to_dispatch_first_node → ready_to_run; checklist now lists explicit keys ({ claim_acquired, plan_in_grammar, plan_frozen, resume_check_ok, roadmap_staged } all true)
