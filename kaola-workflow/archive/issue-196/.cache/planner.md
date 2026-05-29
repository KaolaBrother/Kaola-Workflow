# Planner — Issue #196: GitLab OFFLINE=1 audit-labels fix

## Contract (settled by code)

GitHub (`:546`), Gitea (`:112`), and GitLab-sinks (`test-gitlab-sinks.js:536`) all already
override `KAOLA_WORKFLOW_OFFLINE: '0'` for mock-online subprocess calls. Contract is: full suite
passes under OFFLINE=1. Only `testAuditAndRepairLabels` in the GitLab walkthrough violates it.

## Scope Correction (all 3 sub-cases fail, not 1)

`kaola-gitlab-workflow-claim.js:1053` (audit-labels) and `:1061` (repair-labels) both short-circuit.
Under inherited OFFLINE=1:
- Sub-case A (`audit-labels`): `stale.length === 1` fails — gets `[]`
- Sub-case B (`repair-labels` dry-run): `dry_run === true` fails — gets `false`
- Sub-case C (`repair-labels --execute`): `removed.length === 1` fails — gets `[]`

All three `spawnSync` calls at lines 109-111, 121-123, 135-137 need the fix.

## Approach A: Minimal inline patch — RECOMMENDED

Add `KAOLA_WORKFLOW_OFFLINE: '0'` to all three `Object.assign` env objects.

- **Complexity**: Small (3 one-token additions, ~3 lines touched)
- **Pros**: Surgical; matches `test-gitlab-sinks.js:536` GitLab-local precedent exactly; satisfies behavioral alignment AC
- **Cons**: Repeats env literal 3 times (mild DRY cost)
- **Risks**: Patching fewer than all 3 leaves B/C red — mitigated: walkthrough will catch it
- **Architectural fit**: Strong — matches CLAUDE.md surgical-change mandate

## Approach B: Extract `_runClaimOnline` helper — REJECTED

- Gitea's helper sets up git-repo + PATH-shim (`_initGitRepo`, `_teaMockEnv`); GitLab uses env-var injection only. Not a 1:1 port.
- Medium complexity with no behavioral gain over A
- Violates CLAUDE.md "no speculative abstractions"
- "Aligned" AC is behavioral, not structural

## Approach C: Documentation-only — REJECTED

Leaves OFFLINE=1 npm test red for GitLab. Contradicts what GitHub/Gitea/GitLab-sinks already implement. Non-starter.

## Recommendation: Approach A

Patch the 3 env objects in `testAuditAndRepairLabels`:
```js
env: Object.assign({}, process.env, {
  KAOLA_WORKFLOW_OFFLINE: '0',
  KAOLA_GLAB_MOCK_SCRIPT: mockScript
})
```

## Explicitly NOT to build

- No `_runClaimOnline` helper for GitLab
- No changes to `kaola-gitlab-workflow-claim.js` OFFLINE short-circuits (correct production behavior)
- No changes to GitHub or Gitea walkthroughs (already compliant)
- No README/docs describing a partial suite

## Verification

```bash
KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
KAOLA_WORKFLOW_OFFLINE=1 npm test
```

## Key Files

- `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` — patch here (lines 109-111, 121-123, 135-137)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js:536` — GitLab-local precedent
- `scripts/simulate-workflow-walkthrough.js:537` — GitHub reference pattern
- `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js:107` — Gitea reference (different structure)

## Missing Facts

- Gitea OFFLINE=1 behavior: code says already fixed; not empirically verified. Does not block A.
