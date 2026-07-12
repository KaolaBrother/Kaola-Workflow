evidence-binding: n1-fix-assertion 7d81297cad4c
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: test-hardening — rewriting a vacuous assertion in an existing test to observe runRepairNode's real output; no production change, no separate failing unit precedes a test-file edit; verified by the claude chain.
<!-- regression-green|build-green|smoke-integration -->
regression-green: yes

## task
In `scripts/test-adaptive-node.js`, the #434-b repair-harness assertion at (former) line 8375-8376
asserted `reviewerEvidence.includes('verdict: fail') && reviewerEvidence.includes('findings_blocking: 1')`
— checking a local test-fixture literal against substrings it was literally constructed from two
lines above (`reviewerEvidence = 'evidence-binding: ... verdict: fail ... findings_blocking: 1 ...'`
at line 8336). This assertion could structurally never fail regardless of what `runRepairNode` did.

## verification_tier
regression-green

## write_set
- scripts/test-adaptive-node.js (only)

## fix
Replaced the vacuous self-referential assertion with an assertion on the OBSERVED return value of
the `runRepairNode(...)` call captured as `result` in the same #434-b block:

    assert(result.evidenceRemoved && !result.evidenceRemoved.includes('review.md'),
      '#434-b: result.evidenceRemoved must NOT include review.md — the singleton reviewer evidence' +
      ' (with its blocking verdict: fail / findings_blocking: 1 body) is retained as the repair' +
      ' brief for the reopened writer, got evidenceRemoved=' + JSON.stringify(result.evidenceRemoved));

This mirrors the discrimination style already used by the adjacent #664 test (line ~8460:
`assert(!removed664.includes('review.md'), ...)` on the singleton side, and line ~8551:
`assert(result665.evidenceRemoved && [...].every(n => result665.evidenceRemoved.includes(n)), ...)`
on the fan-out-purge side) — i.e. it asserts on the real production return value
(`result.evidenceRemoved`, populated by `runRepairNode` in
scripts/kaola-workflow-adaptive-node.js lines 3840-3870, which purges evidence ONLY for fan-out
adversarial-verifier gate groups, never for a singleton code-reviewer gate). The adjacent
`!removedBaselines.includes('review.md')` check (unlink-based) was left unchanged. The new
assertion genuinely discriminates: if a future change to `runRepairNode` ever starts pushing
`review.md` into `evidenceRemoved` for a singleton (non-fanout) reviewer gate, this assertion
fails — unlike the old one, which could never fail because it checked the fixture literal against
itself.

## verification_commands
1. `node scripts/test-adaptive-node.js` (leg copy, after edit) — exit 0, output ends
   `adaptive-node tests passed (1767 assertions)`. Ran twice concurrently to confirm stability
   (background task ids b5oxfpcf9, bi3x668lv), both exit 0 with the same assertion count.
2. Cross-check against the UNMODIFIED (git HEAD) copy of the same file, run from the same leg
   directory (temp copy `scripts/_orig-test-adaptive-node-check.js`, deleted immediately after):
   also exit 0, also ends `adaptive-node tests passed (1767 assertions)`. This confirms the
   unrelated `EISDIR ... kaola-workflow-task-mirror.js:143` stack traces seen mid-run (from an
   internal lane-simulation fixture unrelated to node #434-b) are PRE-EXISTING noise in the suite,
   reproduced identically on HEAD, not introduced by this edit.
3. `git status --short` in the leg after all checks — only `scripts/test-adaptive-node.js` shows
   modified; no stray files left behind.

## before_result
Baseline (git HEAD, unmodified `scripts/test-adaptive-node.js`): `node scripts/test-adaptive-node.js`
exits 0, prints `adaptive-node tests passed (1767 assertions)`. The #434-b block's final assertion
was the vacuous self-check described above (non-discriminating, but not failing).

## after_result
After the edit: `node scripts/test-adaptive-node.js` exits 0, prints
`adaptive-node tests passed (1767 assertions)` (same total assertion count — one assertion was
replaced in place, not added/removed). The #434-b block's final assertion now observes
`result.evidenceRemoved` from the real `runRepairNode` call and would fail if the singleton
reviewer's `review.md` were ever purged into `evidenceRemoved`.
