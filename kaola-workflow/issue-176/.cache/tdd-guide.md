# tdd-guide Output: issue-176

## Changes Made
File: `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`

1. Added `runClaimRaw` helper after `runClaim` — returns `{ parsed, exitStatus, stderr }` without asserting exit 0.
2. Replaced opening block of `main()` to:
   - Assert `target_unverified` (exit 1) for no-evidence OFFLINE startup
   - Assert no folder was created
   - Seed `kaola-workflow/.roadmap/issue-163.md` 
   - Then run existing `runClaim` for successful acquisition
   - All downstream assertions unchanged

## Test Output
```
npm run test:kaola-workflow:codex
> Kaola-Workflow walkthrough simulation passed (exit 0)

npm test
> All 4 legs passed (claude, codex, gitlab, gitea) (exit 0)
```
