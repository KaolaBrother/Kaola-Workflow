# TDD-Guide Output — issue-171

## Changes Made
File: plugins/kaola-workflow-gitea/commands/workflow-next.md

1. Change 1 (AC2+AC3): New item 7 — tea issues view target-existence check + consumer-repo prose; old item 7 → item 8
2. Change 2 (AC1): Hoisted KAOLA_PROJECT, KAOLA_CLAIM, KAOLA_VERDICT, KAOLA_REASONING
3. Change 3 (AC4+AC5 site 1): Diagnostics block + target_unverified; watch-pr/PR preserved
4. Change 4: Removed _KAOLA_PROJECT/_KAOLA_CLAIM re-extractions
5. Change 5 (AC4+AC5 site 2): target_unverified in Parallel decision enum + diagnostics trailer

## Verification
- target_unverified: 2 ✓
- KAOLA_VERDICT: 3 ✓
- Startup refusal:: 2 ✓
- active consumer repository: 1 ✓
- tea issues view: 2 ✓
- watch-mr|merge request: 0 ✓
- simulate-workflow-walkthrough.js: 41 tests PASSED, exit 0
