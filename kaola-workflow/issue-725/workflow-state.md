# Kaola-Workflow State

## Project
name: issue-725
status: active

## Current Position
phase: adaptive
phase_name: Adaptive
workflow_path: adaptive
runtime: claude
step: start
next_command: /kaola-workflow-plan-run issue-725
next_skill: kaola-workflow-plan-run issue-725
main_session_role: orchestrator
implementation_owner: N/A
fix_owner: N/A
inline_emergency_fallback_authorized: no

## Pending Gates
- workflow-plan

## Last Evidence
phase_file: N/A
cache_file: N/A
last_command: startup
last_result: folder_claimed

## Planning Evidence
plan_hash: 7dd4b0472fea7adff2769698c714521a82e1e223244413ad7a4302e863c17e82
decision: ask
risk: sensitivity=false blast_radius=true uncertain=false reasons=declared write set touches SHARED_INFRA
first_node_id: n1-repair
first_node_role: implementer
## Last Updated
2026-07-19T03:47:42.444Z

## Epoch Lineage
epoch_schema_version: 2
claim_repository_id: https://github.com/KaolaBrother/Kaola-Workflow.git
claim_identity_digest: a9e459cc1d242503eef4c8bb46274493f4c3b5ea2efaddaa71388f113b466ffa
claim_root_object_format: sha1
claim_root_base_commit: 33a1ca57fd96a07ba1fbe87a85ae8d171293a221
claim_root_base_tree: 6d299fd1c616ec56a0911303484762aa048fe712
claim_root_base_digest: 44ada0fbecbf3cc5a8fc59ffb6401e36891ac16589e231200ae8edb87aaca725
epoch_lineage_id: 43c25ded7e36413c9c1fdb6f1bbdb1ccc19dfae845cf6366230239d986d27997
plan_epoch: 2
active_plan_hash: 7dd4b0472fea7adff2769698c714521a82e1e223244413ad7a4302e863c17e82
inherited_frontier_digest: fae3cf5a388786839ff280f2fe843a8a7dbe02be2999876c9d307ced49002830
inherited_frontier_classes: code,security
automatic_review_replans: 1
authorized_epoch_ceiling: 2
case_b_exemption_consumed: false
replan_status: none
replan_transaction_id: ee2d46fcbc0422b7780c20671656597df61c2f1b0179d9813063135fb8a6614e
replan_phase: committed
active_snapshot_manifest_digest: 7f8b43c5e61e89dd574a438ef0e1fad3ca1216f0b4a73b4cd6921dcececdf401

## Sink
branch: workflow/issue-725
issue_number: 725
sink: merge
run_posture: worktree
main_root: /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow
session_marker: s-49705-mrr994nl
claim_ts: 2026-07-19T03:47:42.417Z
worktree_path: /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-725
