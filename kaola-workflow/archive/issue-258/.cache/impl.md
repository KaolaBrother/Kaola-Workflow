# Node impl — #258 verdict-check resume surface (tdd-guide)

verdict: pass
findings_blocking: 0

RED: Added sub-test to testAdaptiveGateBarrierEnforcement (scripts/simulate-workflow-walkthrough.js): a frozen plan with an all-complete ledger incl. a COMPLETE code-reviewer node 'rv' and NO .cache/rv.md. Asserted ## Pending Gates contains "verdict gate rv". Before impl: FAILED — routeAdaptive had no verifyVerdictBlock call, ## Pending Gates was empty for the verdict gap.

GREEN: Added the verdict surface (cacheDir + readCache/globCache + verifyVerdictBlock(content,{readCache,globCache}); push verdict.failures into existing pendingGates as "verdict gate <id> (<role>)"; non-blocking — return unchanged) to all 4 editions. `node scripts/simulate-workflow-walkthrough.js` now exits 0 ("Workflow walkthrough simulation passed"). Full `npm test` exits 0 incl. validate-script-sync "OK: 15 common scripts and 5 byte-identical file group in sync".

VERIFICATION:
- Actual git writes = exactly the 5 declared files (+ exempt kaola-workflow/issue-258/ artifact).
- diff root vs plugins/kaola-workflow byte-identical: IDENTICAL.
- verifyVerdictBlock present in all 4 editions.
- root/claude = template-literal style; gitea/gitlab = string-concat style w/ renamed plan-validator require.
- gitea + gitlab walkthroughs exit 0 (no regression).
- Non-blocking preserved: routeAdaptive still returns nextCommand=/kaola-workflow-plan-run.

files_changed:
- scripts/kaola-workflow-repair-state.js
- plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js
- scripts/simulate-workflow-walkthrough.js
