evidence-binding: n2-strictness-tests 41cdd8308e59
<!-- RED: paste RED here -->
RED: SYNTH-CROSS-PROJECT-LEAK (Gap 2, pre-narrow) — `FAIL: SYNTH-CROSS-PROJECT-LEAK: the cross-project leak survives the churn filter and surfaces in mDiff, got ["ax.js","by.js"]`. Landed the leak case (a file written into leg A at `kaola-workflow/other-project/leaked.md`, merged into M via the leg's own `git add -A`) against the CURRENT broad `!s.startsWith('kaola-workflow/')` filter first; the assertion that the leak must appear in `mDiff` failed because the broad filter silently swallowed the whole `kaola-workflow/` prefix, including the other-project leak — `node scripts/test-adaptive-node.js` exited non-zero: `adaptive-node tests FAILED (1 failures, 1641 passed)`.
<!-- GREEN: paste GREEN here -->
GREEN: after narrowing all 5 diff-tree churn filters (the 4 production-facing sites at old lines ~6378/6862/6970/7043 plus the new leak test itself) from `!s.startsWith('kaola-workflow/')` to `!isProjectWorkflowChurn(s, 'test-project')` — a new test-local helper mirroring production `isBarrierInvisible`'s project-scoped `kaola-workflow/{project}/**` band (defined once beside `gitOut`, reused at all 5 call sites) — SYNTH-CROSS-PROJECT-LEAK now passes: the leak (`kaola-workflow/other-project/leaked.md`) surfaces in `mDiff` while the active project's own `kaola-workflow/test-project/**` churn stays filtered. Full run: `node scripts/test-adaptive-node.js` → `adaptive-node tests passed (1642 assertions)`, exit 0, 0 FAIL lines (1637 baseline + 5 new assertions: 2 bare-RED/GREEN + 1 bare-change-type + 2 leak-test assertions). `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`, exit 0.

## Summary

Verdict: both gaps closed, test-only, Claude chain green.

### Gap 1 — bare colon-less token negative controls (T6b-bare / T6b-bare2 / T7e-bare)

Added beside the existing hollow-seed refusal controls (T6b-seed ~line 409-412 original, T7e-seed ~line 452-455 original) in `scripts/test-adaptive-node.js`:

- **T6b-bare** (tdd-guide): body `'RED\nGREEN: test passed\n'` (bare `RED`, no colon at all) → `checkEvidenceShape('tdd-guide', ...)` refuses with `missingTokenClass === 'RED'`.
- **T6b-bare2** (tdd-guide): body `'RED: test failed\nGREEN\n'` (bare `GREEN`, no colon at all) → refuses with `missingTokenClass === 'GREEN'`.
- **T7e-bare** (implementer): body `'non_tdd_reason: config-only\nbuild-green\n'` (bare `build-green` change-type token, no colon) → refuses with `missingTokenClass === 'change-type'`.

These pin the "partial-weakening hole": a future matcher that accepted a bare token-name-only line while still refusing an empty `TOKEN: ` value would incorrectly pass a hollow-in-spirit evidence body. Since `checkEvidenceShape`'s existing column-0 regexes (`/^RED:[ \t]*(\S.*)$/m`, `/^GREEN:[ \t]*(\S.*)$/m`, `/^(?:regression-green|build-green|smoke-integration):[ \t]*(\S.*)$/m`) already require the literal colon, production code (`kaola-workflow-adaptive-node.js` ~lines 1072-1160) needed NO change — these are regression/negative controls guarding CURRENT-correct behavior, confirmed by an immediate green run after adding them (no red step applicable/needed here; the red-first discipline was applied to Gap 2 instead, per the task's evidence-contract framing).

### Gap 2 — project-scoped merge-diff churn filter + cross-project-leak test (SYNTH-CROSS-PROJECT-LEAK)

Narrowed the four merge-diff equality filters (test-local helpers inside `scripts/test-adaptive-node.js`, all comparing `git diff-tree` output against an expected declared-file union — NOT production code; production `isBarrierInvisible` in `kaola-workflow-plan-validator.js` ~lines 249-262 was read-only reference and is untouched) from the blanket `!s.startsWith('kaola-workflow/')` to a project-scoped `!isProjectWorkflowChurn(s, 'test-project')`, where:

```js
function isProjectWorkflowChurn(s, project) {
  return s === 'kaola-workflow/' + project || s.startsWith('kaola-workflow/' + project + '/');
}
```

mirroring production `isBarrierInvisible`'s `kaola-workflow/{project}/**` band shape. Applied at all 5 filter call sites (the pre-existing SYNTH-DISJOINT-END-TO-END, #500-POSITIVE-E2E, #588-3LEG-OCTOPUS-END-TO-END, #588-WIDE-DRAIN tests, plus the new SYNTH-CROSS-PROJECT-LEAK test).

Added **SYNTH-CROSS-PROJECT-LEAK**, placed immediately after SYNTH-DISJOINT-END-TO-END: provisions a 2-leg lane group (`provisionedRepo()`), writes the two legs' declared files (`ax.js`, `by.js`), then plants a synthetic leak at `kaola-workflow/other-project/leaked.md` inside leg A — this path is barrier-invisible at the leg-barrier / write-set-overflow check (production `isWorkflowArtifactPath` in `kaola-workflow-plan-validator.js` exempts the WHOLE `kaola-workflow/` prefix, not just the active project's band, except under `kaola-workflow/archive/<other>/`), so it is NOT caught there and is picked up by the leg's own `git add -A` and lands in the octopus merge commit M like ordinary churn. After closing both legs (A deferred, B `group_passed` + `synthesized`), the test asserts the narrowed filter's `mDiff` (1) includes `kaola-workflow/other-project/leaked.md` (the leak is caught, not silently swallowed) and (2) still excludes anything under `kaola-workflow/test-project/**` (the active project's own churn stays legitimately filtered).

RED-first discipline followed exactly as directed: the leak test was first landed against the UNNARROWED (still-broad) filter and run — it failed with `mDiff` = `["ax.js","by.js"]` (the leak completely absent), proving the broad filter's blast radius (it ignores the ENTIRE `kaola-workflow/` prefix, hiding a genuine cross-project leak). Only after observing that failure were all 5 filter sites narrowed to the project-scoped helper, at which point the same test flipped green while every pre-existing SYNTH-*/#500-*/#588-* test (which never plant a leak) also stayed green — the narrowing does not regress the legitimate same-project churn exemption (evidence files, running-set.json, ledger status updates under `kaola-workflow/test-project/**` are still filtered out everywhere).

### Files touched

- `scripts/test-adaptive-node.js` — ONLY file changed (the declared write set). `git diff --stat` on `scripts/kaola-workflow-adaptive-node.js` and `scripts/kaola-workflow-plan-validator.js` is empty (0 lines) — `checkEvidenceShape` and `isBarrierInvisible` confirmed byte-unchanged.
- Evidence file: `kaola-workflow/bundle-651-652/.cache/n2-strictness-tests.md` (this file).

### Validation

- `node scripts/test-adaptive-node.js` → GREEN, `adaptive-node tests passed (1642 assertions)`, exit 0.
- `node scripts/simulate-workflow-walkthrough.js` → GREEN, `Workflow walkthrough simulation passed`, exit 0.
- Claude chain only (test-only change to `scripts/test-adaptive-node.js`; no edition trees touched) — no four-chain (`npm test`) obligation per the node brief.
