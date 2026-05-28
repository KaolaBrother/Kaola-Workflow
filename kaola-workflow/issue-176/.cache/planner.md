# Planner Output: issue-176

## Files to Touch
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (1 file)

## Changes

### Add `runClaimAllowFailure` helper (after `runClaim`, ~line 28):
```js
function runClaimAllowFailure(args, cwd) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  if (result.error) throw result.error;
  const parsed = JSON.parse(result.stdout);
  return { parsed, status: result.status, stderr: result.stderr };
}
```

### Replace opening block of `main()` (lines 86-94) to:
1. Assert `target_unverified` for no-evidence case (exit 1)
2. Verify no folder was created
3. Seed `kaola-workflow/.roadmap/issue-163.md`
4. Run `runClaim` for successful acquisition (existing assertions unchanged)

## Acceptance Check Command
```
npm run test:kaola-workflow:codex && npm test
```

## Out of Scope
- No production code changes
- No changes to GitLab/Gitea simulations
- No CHANGELOG required for test to pass
