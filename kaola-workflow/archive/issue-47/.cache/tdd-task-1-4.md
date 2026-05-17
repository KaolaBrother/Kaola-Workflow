# TDD Agent Output: Tasks 1-4

## Files Modified
- `scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- `scripts/simulate-workflow-walkthrough.js`
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`

## RED Evidence
After Task 1 (claim script changed, tests not yet updated):
```
Error: Command failed: node scripts/kaola-workflow-claim.js bootstrap --session sess-6g --runtime codex
bootstrap: --target-issue <N> is required; agent must select an issue explicitly
```
Test 6G failed immediately — new `!args.targetIssue` guard fires and exits 1.

## GREEN Evidence
After all 4 tasks:
```
Workflow walkthrough simulation passed
```
`node scripts/validate-script-sync.js` → `OK: 7 common scripts in sync.`

Both verified by orchestrator.

## Changes Summary
- Deleted `runBootstrapClaimFirstAvailable` function entirely
- Rewrote `cmdBootstrap` with explicit-target contract (no-target guard + claimExplicitTarget)
- Added `claim: 'owned'` to owned-path output
- Tests 6G/8I-a/b/c/12D/13A/13B rewritten for explicit-target bootstrap
- 8I-c added (no-target test)
- 13A rewritten as true parallel race (two processes target 901 concurrently)
- 13B rewritten with explicit `--target-issue 911`/`912` per session
