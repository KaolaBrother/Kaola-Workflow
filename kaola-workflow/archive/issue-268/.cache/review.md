verdict: pass
findings_blocking: 0

# review node — issue #268 (G-SEL-1b blank selector_source phantom-arm bypass)

## Verdict: PASS

The fix is correct, minimal, and strictly additive. All seven review-focus items
are satisfied. Empirically confirmed the gate closes the #268 gap. npm test exits 0.

## Focus-item findings

1. Strictly additive — CONFIRMED.
   The pre-check (validator line 548-555) only appends to `errors` when a
   `select`-shape arm has an empty `selectorSource`. It introduces no new pass
   path, relaxes no existing branch, and changes no existing rule. Pre-fix the
   blank-arm plan was `in-grammar`; post-fix it is `refuse`. Nothing that was
   refused before becomes accepted.

2. Files 1 and 2 byte-identical — CONFIRMED.
   `cmp scripts/kaola-workflow-plan-validator.js
   plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` => identical.
   sha256 of both = 8e8ec953bf286eb57c454ec7c61b4dbcb59aedd2b162f660f0b70d83876ab365.
   Byte-identity is also enforced by validate-script-sync.js:52
   (kaola-workflow-plan-validator.js is in its synced-scripts manifest). Ran
   `node scripts/validate-script-sync.js` directly =>
   "OK: 14 common scripts and 5 byte-identical file group in sync." (exit 0).

3. Files 3 and 4 carry the same logical fix at the same location — CONFIRMED.
   gitea (kaola-gitea-...) and gitlab (kaola-gitlab-...) editions both add the
   identical block at line 548, immediately before `const selectGroups = new Map()`
   at line 559 in each. Forge-specific ports, not byte-identical to 1/2 (correct).

4. Pre-check runs BEFORE selectGroups aggregation — CONFIRMED.
   Pre-check at line 548; selectGroups Map declared line 559 and populated
   line 576-577. The pre-check iterates raw `nodes`, so a blank arm is caught
   regardless of how the per-group `srcs` Set later resolves. This defeats the
   root cause: the original G-SEL-1b `srcs = new Set(members.map(...).filter(Boolean))`
   at line 634 drops the blank arm, yielding `srcs.size === 1`, which routes to
   the valid `else` branch (phantom-arm bypass).

5. Error string matches the issue spec exactly — CONFIRMED.
   Emitted: `G-SEL-1b: arm "<id>" in select group "<group>" has no selector_source declared`
   Verified runtime output: `G-SEL-1b: arm "arm-html" in select group "fix" has no selector_source declared`.

6. Test covers AC#1 and AC#2 — CONFIRMED.
   - AC#1 (blank arm -> refuse): new block in testAdaptivePatternLibrary asserts
     result === 'refuse' and the exact per-arm G-SEL-1b message for arm-html.
   - AC#2 (valid plan -> in-grammar): pre-existing test at
     simulate-workflow-walkthrough.js:6796-6816 builds the same plan shape with
     every arm naming selector_source: classify and asserts result === 'in-grammar'.
   The new negative test reuses that exact shape with only arm-html's source blanked,
   so it isolates the single variable under test.

7. npm test / walkthrough exits 0 — CONFIRMED (both commands run).
   - `node scripts/simulate-workflow-walkthrough.js` => "Workflow walkthrough
     simulation passed", EXIT=0; testAdaptivePatternLibrary PASSED.
   - `npm test` => EXIT=0 (full suite: GitHub canonical + GitLab + Gitea contract
     validators and walkthroughs, vendored-agent validation for 13 agents, and the
     byte-identity sync group all passed).

## Regression-test authenticity (empirical)

Ran the validator on the blank-arm plan with the pre-check block stripped
(in-place temp copy, removed after):
- PRE-FIX:  result=in-grammar, errors=[]   (phantom arm slips through — the #268 bug)
- POST-FIX: result=refuse, exact G-SEL-1b message present
This proves the new test is a true regression test, not a tautology, and that the
added block is the cause of the closure.

## Field-plumbing checks
- parseShape (line 99): `select(<g>)` -> { kind:'select', group:<g> }; field accessors
  `n.shape.kind` / `n.shape.group` are correct.
- selectorSource (line 140) normalizes the `—`/`-` sentinels and blanks to '', so
  `!n.selectorSource` correctly catches both a dash-sentinel cell and a truly empty
  cell.

## Issues found
None. No CRITICAL, HIGH, MEDIUM, or LOW findings.

## Non-finding observation (harmless, no action needed)
In the ALL-arms-blank case the new pre-check (line 552) fires per-arm AND the
existing line-635 check (`srcs.size === 0` -> "arms declare no selector_source")
also fires, so two distinct refusal messages appear. This is harmless: the plan
still refuses, every G-SEL test asserts with `.some(...)`, and additivity is not
violated (nothing previously accepted is now accepted). Noted only so a future
reader does not mistake the duplicate for a bug.
