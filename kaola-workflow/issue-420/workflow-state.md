# Kaola-Workflow State

## Project
name: issue-420
status: active

## Current Position
phase: adaptive
phase_name: Adaptive
workflow_path: adaptive
runtime: claude
step: start
next_command: /kaola-workflow-plan-run issue-420
next_skill: kaola-workflow-plan-run issue-420
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
plan_hash: c43e1560307bff5cc667870b0b88bc7c38f022a84fa2dff5a2cc1164e55bdf26
decision: auto-run
risk: sensitivity=false blast_radius=false uncertain=false reasons=—
first_node_id: n1-survey
first_node_role: doc-updater

## Last Updated
2026-06-12T03:44:17.265Z

## Sink
branch: workflow/issue-420
issue_number: 420
sink: merge
run_posture: worktree
worktree_path: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-420
