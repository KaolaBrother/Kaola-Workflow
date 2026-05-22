# Review Fix 1 — HIGH: probe ordering in GitHub claimProject

## Finding addressed
HIGH: GitHub `claimProject` ran `probeIssueState` before the owned-folder check, causing a resume regression when remote is unreachable.

## Fix applied
Reordered `claimProject` in `scripts/kaola-workflow-claim.js` and `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`:
- `existing` folder check (activeByIssue/activeByProject) now runs BEFORE the probe block
- Matches GitLab/Gitea ordering

## Files changed
- `scripts/kaola-workflow-claim.js` — reordered lines ~327-337
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — byte-identical copy
- `scripts/simulate-workflow-walkthrough.js` — added `testClaimProjectOwnedFolderFailingRemote`

## RED evidence
```
Error: claimProject must return status:owned when local folder exists, even with failing gh; got: {"status":"target_unavailable",...}
```

## GREEN evidence
```
testClaimProjectOwnedFolderFailingRemote: PASSED
Workflow walkthrough simulation passed
```

## Validation
- `node scripts/simulate-workflow-walkthrough.js` → exit 0
- `node scripts/validate-script-sync.js` → OK: 9 common scripts in sync.
