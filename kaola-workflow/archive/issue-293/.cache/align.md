# Node `align` (tdd-guide) — issue #293

Aligned `crossCheckStatus` (kaola-workflow-parallel-batch.js) to `runOrient`'s AC#5 legality
semantics for the single-`in_progress` + non-matching-manifest case. One-predicate hoist; the
mutation-driving `runOrient` gate (adaptive-node.js) was already correct and is NOT modified.

## RED
Before the fix, `node scripts/test-parallel-batch.js` FAILED on the new #293 assertions:
```
FAIL: #293: single in_progress with all-sealed manifest → valid:true (legacy single-node path)
FAIL: #293: single in_progress with all-sealed manifest → orphan:false (NOT orphan_member_set_mismatch)
FAIL: #293: single in_progress with all-sealed manifest → reason:single_in_progress
parallel-batch tests FAILED (3 failures, 117 passed) EXIT=1
```

## GREEN
After hoisting the `ip.length <= 1` short-circuit above the manifest branch (in BOTH byte-identical
copies), all suites pass (real exit codes captured directly, not via a piped `| tail`):
```
validate-script-sync.js           → OK: 18 common scripts and 7 byte-identical file group in sync. EXIT=0
test-parallel-batch.js            → parallel-batch tests passed (120 assertions)
test-adaptive-node.js             → adaptive-node tests passed (140 assertions)
simulate-workflow-walkthrough.js  → Workflow walkthrough simulation passed
```

## Change summary
- `scripts/kaola-workflow-parallel-batch.js` — hoisted `if (ip.length <= 1) return legacy single-node`
  ABOVE the `if (!manifest)` branch in `crossCheckStatus`; a single `in_progress` row is now legal
  regardless of manifest. Genuine multi-`in_progress` mismatch still reports orphan (P6a–P6d, R4
  T799/T802 unaffected).
- `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` — EXACT same edit; `diff` against
  the base copy exits 0 (byte-identical, validate-script-sync green).
- `scripts/fixtures-orphan-legality.js` — NEW shared INPUT fixture (manifest `[{id:'a',sealed:true}]`,
  `inProgressIds=['a']`, expectations). Imported by BOTH test files — the anti-drift mechanism.
- `scripts/test-parallel-batch.js` — #293 RED→GREEN assertions on `crossCheckStatus` via the fixture.
- `scripts/test-adaptive-node.js` — #293 characterization lock on `runOrient` (result:ok, batch:null)
  via the SAME fixture (green today, stays green).

adaptive-node.js production code unchanged (only its test file gained a characterization assertion).
