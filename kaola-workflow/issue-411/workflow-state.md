# Kaola-Workflow State

## Project
name: issue-411
status: active

## Current Position
phase: adaptive
phase_name: Adaptive
workflow_path: adaptive
runtime: claude
step: start
next_command: /kaola-workflow-plan-run issue-411
next_skill: kaola-workflow-plan-run issue-411
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
plan_hash: 9b43839f7e3c6ed3529a407ce93bfbd734768213bded18ff2aa4c31b72248144
decision: ask
risk: sensitivity=false blast_radius=true uncertain=false reasons=declared write set touches SHARED_INFRA
first_node_id: n1-fix-411-node
first_node_role: tdd-guide

## Last Updated
2026-06-11T20:10:52.509Z

## Sink
branch: workflow/issue-411
issue_number: 411
issue_numbers: 411,412,413
bundle_id: issue-411
closure_policy: all_or_nothing
sink: merge
run_posture: worktree
worktree_path: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-411
