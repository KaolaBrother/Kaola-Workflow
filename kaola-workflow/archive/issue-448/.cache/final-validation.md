# Final Validation — issue-448

## Cross-edition four-chain gate (#307)
This is a cross-edition diff (touches agents/workflow-planner.md + the 3 plugin workflow-planner.toml twins + scripts/test-agent-profile-parity.js). Via `node scripts/kaola-workflow-run-chains.js` (spawnSync per chain, real exit codes), result: pass, failed: []:
- claude  → exitCode 0
- codex   → exitCode 0
- gitlab  → exitCode 0
- gitea   → exitCode 0

(First run was RED on gitlab+gitea: `assertNoForbidden` flagged the literal canonical path `plugins/kaola-workflow/scripts/` in the byte-identical tomls. Fixed by referencing the codex walkthrough by basename `simulate-kaola-workflow-walkthrough.js` without the forbidden path prefix; re-run all four green.)

## Targeted checks
- `node scripts/test-agent-profile-parity.js` → 9 assertions pass (new FEATURE_TOKEN `simulate-kaola-workflow-walkthrough.js` present in md + all 3 tomls).
- `node scripts/validate-script-sync.js` → OK (3 planner tomls byte-identical).
- gitlab/gitea `--forbidden-only` on the tomls → pass.

## Verdict
ALL GREEN — four-chain cross-edition (#307) pass.
