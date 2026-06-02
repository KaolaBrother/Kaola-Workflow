# advisor — issue-218 plan gate

**Gate verdict: PASS.** No architect-revision needed — blueprint is implementable from the plan alone; build sequence dependency-safe (G1/G2 disjoint, RED→fix→GREEN correct, consumers verified fail-closed). One fact to settle before Phase 4 verification.

## Contradiction flagged (RESOLVED below)
- code-explorer §5: `simulate-gitlab-workflow-walkthrough.js:157` calls `run('test-gitlab-workflow-scripts.js')` → npm test transitively runs the new-test file.
- architect §6: "npm test does NOT run test-gitlab/gitea-workflow-scripts.js."
- These contradict. Matters because RED/GREEN must use the command that actually executes the new tests; running only npm test under the architect's claim would be a FALSE GREEN.

### RESOLUTION (verified in-tree)
code-explorer is RIGHT; architect §6 is WRONG.
- `package.json:38` `test:kaola-workflow:gitlab` → runs `simulate-gitlab-workflow-walkthrough.js` → `:157 run('test-gitlab-workflow-scripts.js')`.
- `package.json:39` `test:kaola-workflow:gitea` → runs `simulate-gitea-workflow-walkthrough.js` → `:245 run('test-gitea-workflow-scripts.js')`.
- `package.json:35` `test` runs both. → The new tests ARE in the `npm test` regression path. No CI-orphan; nothing to surface as a gap in Phase 6.
- Direct `node .../test-*-workflow-scripts.js` is still used (fast, isolated) for the RED checkpoint, but is redundant coverage, not the sole path.

## Four gate questions
1. Dependency-safe? YES. RED-first nuance (pre-fix must fail with state==='open', NOT 'unavailable') is the most valuable guard — pre-fix 'unavailable' = shim threw, catch fabricated it, bypassing parseJson/normalizeIssue = vacuous. Keep exactly.
2. Missing integration points? Only the wiring question (resolved). Probe-level test is logically sufficient (guard's 'unavailable' handling already proven by existing throw-case test); claim-level integration test genuinely optional — do NOT expand scope.
3. Implementable from plan alone? YES — diffs, shim contents, registration points, reason strings all concrete.
4. Edge cases/error paths? Covered. Residual keying correct; null issue → catch → still fail-closed. normalizeState maps 'opened'→'open' so the `=== 'open'` arm matches normalized values — implementer reads issue.state AFTER normalization (diff does).

## Cosmetic (adopted)
`'glab issue state unparseable'` is slightly inaccurate for the EMPTY case (empty ≠ unparseable). Advisor suggested `'… issue state unverified'` which reads true for both empty and non-JSON. ADOPTED: reason strings → `'glab issue state unverified'` / `'tea issue state unverified'`. Contract-safe (no gh/glab/forbidden tokens). Guard reads only `state`, so behavior identical; this only improves the human-readable reason.

## Locked
Option A is locked and correct — do not reopen. Write phase file, proceed to Phase 4.
