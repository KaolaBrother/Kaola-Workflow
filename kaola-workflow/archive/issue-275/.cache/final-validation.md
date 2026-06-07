# Final Validation — issue-275

| Command | Result | Evidence |
|---------|--------|----------|
| `npm test` (worktree) | PASS | Green across all four editions: claude, codex, GitLab, Gitea. Includes `validate-script-sync.js` byte-identity (the two `kaola-workflow-claim.js` copies), `validate-vendored-agents.js` (13 agents), the contract validators, and all six simulate-*-walkthrough suites. |
| `node scripts/simulate-workflow-walkthrough.js` (worktree) | PASS | "Workflow walkthrough simulation passed" — includes the 3 new #275 regressions (testClearAdvisoryClaimDeletesMarkerComment / DoesNotDeleteOtherProjectMarker / OfflineSkipsDelete) plus all adaptive/worktree tests. |
| Adaptive barrier gates (4) | PASS | `resume=0 gate=0 barrier=0 verdict=0`; `--barrier-check` → `{"result":"pass","sensitiveHits":[],"outOfAllow":[]}`. |

All required validation passed against the final candidate state. No failures; no Final Validation Failure Ledger rows.
