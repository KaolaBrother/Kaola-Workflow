# Documentation Docking — issue-81

## Changed Code/Config/Test/Workflow Files Reviewed
- `scripts/kaola-workflow-claim.js` — removed sole-active branch; added worktree_path hoist
- `scripts/simulate-workflow-walkthrough.js` — four new regression tests
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — plugin mirror sync (same fix)
- `commands/workflow-next.md` — step 5 rewritten
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md` — step 5 rewritten
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` — step 5 rewritten
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` — step 5 rewritten
- `CHANGELOG.md` — [Unreleased] entry added
- `README.md` — sole-active no-target paragraph updated with one-liner

## Documents Checked
- README.md: ✓ updated — sole-active contract + one-liner
- CHANGELOG.md: ✓ updated — comprehensive entry
- docs/api.md: N/A — no startup contract documentation present
- docs/architecture.md: N/A — no structural system change
- docs/conventions.md: N/A — no new conventions
- docs/workflow-state-contract.md: N/A — state contract unchanged
- docs/decisions/: N/A — decision already recorded in CLAUDE.md + phase artifacts
- .env.example: N/A — no new env vars
- CLAUDE.md: N/A — lines 21-22 confirmed correct as-is (advisor decision recorded in phase3-plan.md)

## Gaps Found and Fixed
None. All public behavior changes (startup contract, sole-active resume flow) are documented in:
1. The four command/skill docs (agent-facing, with one-liner)
2. README.md (user-facing overview)
3. CHANGELOG.md (release record)

## Phase 1 Acceptance Criteria vs Delivered
| Criterion | Delivered |
|-----------|-----------|
| Sole-active branch removed | ✓ Both scripts/kaola-workflow-claim.js and plugin mirror |
| `verdict: no_target` for all no-target paths | ✓ Confirmed by T1/T2/T3 |
| Shape parity: worktree_path at top level | ✓ Confirmed by T4 round-trip |
| Agent-side resume documented with one-liner | ✓ All 4 command/skill docs |
| Four regression tests | ✓ T1/T2/T3/T4 in walkthrough |

## Final Verdict
DOCKED
