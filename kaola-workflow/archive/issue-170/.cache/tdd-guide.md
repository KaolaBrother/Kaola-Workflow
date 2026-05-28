# TDD-Guide Output — issue-170

## Changes Made
File: plugins/kaola-workflow-gitlab/commands/workflow-next.md

1. Change 1 (AC2+AC3): New item 7 — glab issue view target-existence check + consumer-repo prose; old item 7 → item 8
2. Change 2 (AC1): Hoisted KAOLA_PROJECT, KAOLA_CLAIM, KAOLA_VERDICT, KAOLA_REASONING from STARTUP_OUT in Step 0b
3. Change 3 (AC4+AC5 site 1): Refactored claim:none prose to include diagnostics block + added target_unverified to typed-refusal list
4. Change 4: Replaced _KAOLA_PROJECT/_KAOLA_CLAIM re-extraction with single-line release using hoisted vars
5. Change 5 (AC4+AC5 site 2): Added target_unverified to Parallel decision enum + refusal diagnostics block in Required Output

## Verification Results
- grep -c "target_unverified" → 2 (PASS)
- grep -c "KAOLA_VERDICT" → 3 (PASS)
- grep -c "KAOLA_REASONING" → 3 (PASS)
- grep -c "active consumer repository" → 1 (PASS)
- grep -c "Startup refusal:" → 2 (PASS)
- simulate-workflow-walkthrough.js → 41 tests PASSED, exit 0
