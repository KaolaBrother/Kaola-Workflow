# Node: finalize (sink) — issue #255

Deliverable: `CHANGELOG.md` `## [Unreleased]` entry for #255 (script-owned checklist-backed adaptive
planner→first-node handoff). Written by the orchestrator (the `finalize` sink role is not a dispatchable
subagent). CHANGELOG.md is docs-exempt, so the finalize per-node barrier (declared write: CHANGELOG.md) passes.

n/a: RED/GREEN — finalize is the docs/state sink; no test cycle. Verification = whole-plan Phase-6 merge gate
(below) + full `npm test` green.

## Phase-6 whole-plan merge gate (verified read-only by orchestrator)
- `--gate-verify --json` → ok:true (G1: code-reviewer post-dominates all completed code nodes).
- `--verdict-check --json` → ok:true (review verdict pass, findings_blocking:0).
- `--barrier-check --json` → refuse, but ONLY on the 5 orchestrator-authorized out-of-lane #255 amendments
  (scripts/validate-workflow-contracts.js + plugins/kaola-workflow mirror, scripts/validate-kaola-workflow-contracts.js,
  + 2 forge handoff ports once staged); sensitiveHits:[]. Documented in workflow-state.md `## Plan Amendments`;
  judged + authorized by the orchestrator (frozen plan laned no validator/forge-handoff file).
- `npm test` → exit 0 across all four editions (claude/codex/gitlab/gitea).

## Remaining (git finalization — orchestrator + user-gated, outward-facing)
Commit the #255 change, archive kaola-workflow/issue-255/, regenerate ROADMAP, push, close issue #255.
Per base rules (commit/push only when asked; branch first on default branch) the git/close steps are confirmed
with the user before execution.
