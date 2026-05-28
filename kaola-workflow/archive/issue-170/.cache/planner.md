# Planner Output — issue-170

## File to Touch (1 file)
plugins/kaola-workflow-gitlab/commands/workflow-next.md

## 5 Changes
1. Change 1 (AC2+AC3): Add new item 7 (target-existence check with glab, consumer-repo prose); renumber old item 7 → item 8
2. Change 2 (AC1): Hoist KAOLA_VERDICT, KAOLA_REASONING (plus KAOLA_PROJECT, KAOLA_CLAIM for full parity) from STARTUP_OUT in Step 0b
3. Change 3 (AC5+AC4 site 1): Add target_unverified to Step 0b typed-refusal enum + add diagnostics line on claim:none
4. Change 4: Remove underscore-prefixed _KAOLA_PROJECT/_KAOLA_CLAIM re-extractions in Git Freshness Block Recovery; use hoisted vars
5. Change 5 (AC5+AC4 site 2): Add target_unverified to Parallel-decision enum in Required Output + add refusal-diagnostics line

## Acceptance Checks
- grep -c "target_unverified" plugins/kaola-workflow-gitlab/commands/workflow-next.md  # expect 2
- grep -c "KAOLA_VERDICT" plugins/kaola-workflow-gitlab/commands/workflow-next.md  # expect ≥3
- grep -c "KAOLA_REASONING" plugins/kaola-workflow-gitlab/commands/workflow-next.md  # expect ≥3
- grep -c "active consumer repository" plugins/kaola-workflow-gitlab/commands/workflow-next.md  # expect 1
- grep -c "Startup refusal:" plugins/kaola-workflow-gitlab/commands/workflow-next.md  # expect 2
- node scripts/simulate-workflow-walkthrough.js  # exit 0

## Out of Scope
- No script changes
- No Gitea edition
- No changes to canonical Claude edition
