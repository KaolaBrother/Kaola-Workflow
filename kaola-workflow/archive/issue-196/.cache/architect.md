# Code Architect — Issue #196: GitLab OFFLINE=1 audit-labels fix

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | Lines 111, 123, 137: insert `KAOLA_WORKFLOW_OFFLINE: '0', ` before `KAOLA_GLAB_MOCK_SCRIPT: mockScript` in each of the 3 env objects | P0 (sole change) |

Each line changes from:
```js
        env: Object.assign({}, process.env, { KAOLA_GLAB_MOCK_SCRIPT: mockScript })
```
to:
```js
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript })
```

Line 111 = sub-case A (audit-labels), line 123 = sub-case B (repair-labels dry-run), line 137 = sub-case C (repair-labels --execute).

## Files to Create

None.

## Design Decisions

- Keep `Object.assign({}, process.env, {...})` form — matches the existing walkthrough style; sinks.js uses spread but matching the local file keeps diff minimal.
- Insert `KAOLA_WORKFLOW_OFFLINE: '0'` before `KAOLA_GLAB_MOCK_SCRIPT` — order matches `test-gitlab-sinks.js:536` precedent.
- No codex file edit — `simulate-gitlab-codex-workflow-walkthrough.js` has no audit/repair invocations; passes under OFFLINE=1 already.

## Build Sequence

1. Patch lines 111, 123, 137 in `simulate-gitlab-workflow-walkthrough.js` (all 3 are independent, can be done in one edit session; all must be applied before validation passes).
2. Validate with `KAOLA_WORKFLOW_OFFLINE=1` command.

## Task List

### Task 1 — Patch 3 env objects in testAuditAndRepairLabels

- File: `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`
- Write Set: lines 111, 123, 137 of the above file
- Depends On: none
- Parallel Group: serial (only task)
- Action: MODIFY
- Implement: Add `KAOLA_WORKFLOW_OFFLINE: '0', ` before `KAOLA_GLAB_MOCK_SCRIPT: mockScript` in each of the 3 env objects
- Mirror: `test-gitlab-sinks.js:536` (GitLab-local precedent), `scripts/simulate-workflow-walkthrough.js:546` (GitHub)
- Validate:
  ```bash
  KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js; echo "exit=$?"
  ```
  Expect: `testAuditAndRepairLabels: PASSED`, `GitLab workflow walkthrough simulation passed`, `exit=0`

## Validation Commands

Discriminating (pre-fix FAILS, post-fix PASSES):
```bash
KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
```

Full final suite:
```bash
# 1. clean-env (no regression)
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
# 2. OFFLINE=1 GitLab (the fix)
KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
# 3. OFFLINE=1 codex (unaffected sibling stays green)
KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js
```

## Edge Cases

- All 3 sub-cases must be patched — fixing fewer than 3 still fails at the first un-patched sub-case.
- Codex walkthrough: no audit/repair invocations; verified passing under OFFLINE=1; no change needed.
- `test-gitlab-workflow-scripts.js`: deletes OFFLINE at module load (line 14), sets `OFFLINE: '0'` on every runner; not affected.
- `test-gitlab-sinks.js`: already has `KAOLA_WORKFLOW_OFFLINE: '0'` at line 536; not affected.
- Grep sweep `KAOLA_GLAB_MOCK_SCRIPT` without `KAOLA_WORKFLOW_OFFLINE` override returns only lines 111/123/137 — no other vulnerable env blocks.

## Out of Scope

- `kaola-gitlab-workflow-claim.js` — OFFLINE short-circuits correct production behavior
- `kaola-gitlab-forge.js` — same
- GitHub or Gitea walkthroughs — already compliant
- `validate-kaola-workflow-gitlab-contracts.js`
- README/docs
