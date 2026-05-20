# Advisor — Plan Gate: issue-122

## Verdict
Blueprint is sound. One refinement required before Phase 4: strengthen test oracle for Test 1 (and Test 3 / GitLab mirrors) from boolean `mergeCalled` to full call-args capture.

## Finding: Weak Test Oracle
The planned `mergeCalled === true/false` boolean only verifies that forge was called, not WHAT was passed. Someone could change `squash: true → false` and all tests still pass. This is not acceptable given the feature requirement is specifically `autoMerge: true, squash: true, removeSourceBranch: true`.

## Required Refinement

**Test 1 (and Test 3) — Gitea oracle:**
```js
let forgeArgs = null;
withForge({ mergePullRequest: (...args) => { forgeArgs = args; } }, () => {
  sinkPr.maybeAutoMergeFromConfig({ pr_number: 1 }, 'group/project', { pr_auto_merge: true });
});
assert.ok(forgeArgs !== null, 'mergePullRequest called');
assert.strictEqual(forgeArgs[0], 'group/project');
assert.strictEqual(forgeArgs[1], 1);
assert.strictEqual(forgeArgs[2].autoMerge, true);
assert.strictEqual(forgeArgs[2].squash, true);
assert.strictEqual(forgeArgs[2].removeSourceBranch, true);
```

Note: `forge.mergePullRequest(project, prNumber, opts)` — args[0]=project, args[1]=prNumber, args[2]=opts. The wrapper passes `sha: undefined` in opts — use property assertions, not deepStrictEqual, to avoid sha: undefined causing false failures.

**Test 1 (and Test 3) — GitLab oracle:**
```js
let forgeArgs = null;
withForge({ mergeMergeRequest: (...args) => { forgeArgs = args; } }, () => {
  sinkMr.maybeAutoMergeFromConfig({ mr_iid: 1 }, { mr_auto_merge: true });
});
assert.ok(forgeArgs !== null, 'mergeMergeRequest called');
assert.strictEqual(forgeArgs[0], 1);
assert.strictEqual(forgeArgs[1].autoMerge, true);
assert.strictEqual(forgeArgs[1].squash, true);
assert.strictEqual(forgeArgs[1].removeSourceBranch, true);
```

Note: `forge.mergeMergeRequest(mrIid, opts)` — args[0]=mrIid, args[1]=opts.

**Test 2 (negative / config-false skip):** Boolean check is fine — no call to inspect.

## Architect Revision
Not required. Fold the oracle refinement into phase3-plan.md directly.

## Build Sequence
Dependency-safe. ✓

## Missing Files or Integration Points
None. ✓

## Implementable From Plan Alone?
Yes, after oracle refinement is folded in. ✓

## Edge Cases / Error Paths
Covered: merge-throws → non-fatal stderr warning. Config file missing → defaults. JSON parse failure → defaults. Non-object config → defaults. OFFLINE skips both paths. ✓
