# Kaola-Workflow State

## Project
name: bundle-651-652
status: active

## Current Position
phase: adaptive
phase_name: Adaptive
workflow_path: adaptive
runtime: claude
step: start
next_command: /kaola-workflow-plan-run bundle-651-652
next_skill: kaola-workflow-plan-run bundle-651-652
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
plan_hash: d8bdf05cb3f970f463d1bb0906fcc75f4d2627fb69dcebc947fe6f1c3ba4b9cc
decision: ask
risk: sensitivity=false blast_radius=true uncertain=false reasons=declared write set touches SHARED_INFRA
first_node_id: n5-adversarial
first_node_role: adversarial-verifier

## Last Updated
2026-07-10T10:56:11.183Z

## Sink
branch: workflow/bundle-651-652
issue_number: 651
sink: merge
run_posture: worktree
main_root: /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow
session_marker: s-72496-mretlho0
claim_ts: 2026-07-10T10:56:11.184Z
worktree_path: /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-651-652
issue_numbers: 651,652
bundle_id: bundle-651-652
closure_policy: all_or_nothing
