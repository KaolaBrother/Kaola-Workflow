# Planner Output — issue-171

## File to Touch (1 file)
plugins/kaola-workflow-gitea/commands/workflow-next.md

## 5 Changes (same pattern as #170, tea-specific)
1. Change 1 (AC2+AC3): Insert item 7 target-existence check using `tea issues view "$KAOLA_TARGET_ISSUE" --output json`; consumer-repo prose; renumber old item 7 → item 8
2. Change 2 (AC1): Hoist KAOLA_PROJECT, KAOLA_CLAIM, KAOLA_VERDICT, KAOLA_REASONING in Step 0b
3. Change 3 (AC4+AC5 site 1): Add diagnostics block on claim:none + target_unverified to typed-refusal enum; preserve watch-pr/PR terminology (not MR)
4. Change 4: Remove _KAOLA_PROJECT/_KAOLA_CLAIM re-extractions; use hoisted vars in Git Freshness Block Recovery
5. Change 5 (AC4+AC5 site 2): Add target_unverified to Parallel decision enum; add diagnostics block trailer in Required Output

## Key Gitea difference vs GitLab
- `tea issues view` (PLURAL) not `glab issue view`
- PR terminology (not MR), watch-pr (not watch-mr)

## Acceptance Checks
- grep -c "target_unverified" → 2
- grep -c "KAOLA_VERDICT" → ≥3
- grep -c "Startup refusal:" → 2
- grep -c "active consumer repository" → 1
- node scripts/simulate-workflow-walkthrough.js → exit 0
