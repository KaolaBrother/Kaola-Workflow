# tdd-task-1 — Foundations (A1 gitea forge labels + A2 roadmapDir export + C3 forge-API test)

> tdd-guide dispatched with model=opus (Sonnet rate-limited).

## Modified files (exactly 3 in write set)
1. test-gitea-forge-helpers.js (TEST first)
2. kaola-gitea-forge.js (A1)
3. kaola-gitea-workflow-roadmap.js (A2)

## RED
`node plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`:
TypeError: Cannot read properties of undefined (reading 'issue_iid') at :100:103; EXIT 1.
Without --labels= push, built key didn't match response key → teaExec '' → []→[][0] undefined.

## GREEN (orchestrator re-verified)
- test-gitea-forge-helpers.js → "Gitea forge helper tests passed" EXIT 0.
- roadmapDir smoke → function.

## Orchestrator diff verification
- forge.js: `const csv=(options.labels||[]).join(','); if(csv) args.push('--labels='+csv);` after --state push, with comment. Single-token `=` form. ✓
- roadmap.js: `roadmapDir,` added to exports. ✓
- test: response key `'issues list --output json --limit 100 --state closed --labels=workflow:in-progress'` + assertion issue_iid===7. Byte-exact match with forge push form. ✓
No deviations; 6 insertions/0 deletions across the 3 write-set files. No commits.
