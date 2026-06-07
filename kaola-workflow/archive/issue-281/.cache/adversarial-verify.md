verdict: pass
findings_blocking: 0

## Claim Under Test

"Issue #281's parallel ready-set execution change is CORRECT, COMPLETE against the acceptance criteria (with the honest partials explicitly documented), and REGRESSION-FREE; four-edition parity holds; all tests pass — AND the previously-found A1 (orient AC#5 enforcement) is now fixed."

Issue: #281. Scoped surface: A1 re-verification (orient AC#5 typed refusal) + new gap hunt.

## Disproof Attempt

### A1 Verification (was: orient did not enumerate all in_progress rows)

Read `runOrient` in `scripts/kaola-workflow-adaptive-node.js` lines 345–453. The repair:

1. Replaces the old break-on-first loop with a no-break accumulator into `inProgressNodes[]` (lines 362–368, no `break`).
2. Reads `active-batch.json` via `readFile`/`cacheExists` seams (lines 382–394, fail-closed to `null` on missing/malformed).
3. Computes order-independent set equality between `manifestMemberIds` and `inProgressNodes` (lines 398–404).
4. Three-branch legality gate (lines 406–438):
   - `<=1 in_progress` → legacy single-node ok path (batch: null)
   - `>=1 in_progress` AND manifest member-set EQUALS in_progress set → valid batch (result: ok, batch object)
   - `>1 in_progress` AND (no manifest OR set mismatch) → `{result:'refuse', reason:'orphan_multi_in_progress'}` + exitCode 1

**Concrete adversarial execution** (run live against the repo):

Scenario: plan with `impl-alpha` and `impl-beta` both `in_progress`, no `active-batch.json`.

```
result: refuse
reason: orphan_multi_in_progress
inProgressNodes: [ 'impl-alpha', 'impl-beta' ]
batch: null
EXIT:0
```

A1 is definitively fixed. The old behavior (returning ok on the first in_progress row, never checking for others) is gone.

**Back-compat scenario**: single in_progress row, no manifest → `result: ok`, `inProgressNode: 'impl-alpha'`, `batch: null`. Additive fields `inProgressNodes` and `batch` present. Legacy callers unaffected.

**consentHalt/escalatedToFull/allDone**: tested via T20e; all-complete plan with no in_progress rows returns `result: ok`, `consentHalt: true`, `escalatedToFull: 'security'`, `allDone: true`, `inProgressNode: null`. Unchanged.

### Test Execution (real exit codes, not tail-pipe)

- `node scripts/test-adaptive-node.js` → exit 0, 135 assertions passed (was 104 before repair; +31 new T20a–T20e).
- `node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation passed".
- `npm test` (background job b891hke6r, output captured directly):
  - `adaptive-node tests passed (135 assertions)` — confirmed.
  - `parallel-batch tests passed (75 assertions)` — confirmed.
  - `next-action tests passed (65 assertions)` — confirmed.
  - All five walkthrough suites: "Workflow walkthrough simulation passed", "Kaola-Workflow walkthrough simulation passed", "GitLab workflow walkthrough simulation passed", "GitLab Codex workflow walkthrough simulation passed", "Gitea workflow walkthrough simulation passed".
  - `validate-script-sync.js`: "OK: 18 common scripts and 7 byte-identical file group in sync."
  - Zero FAILED lines in output.

### Four-Edition Parity

- `scripts/adaptive-node.js` ↔ `plugins/kaola-workflow/scripts/adaptive-node.js`: md5 match `08a34b24268ccd06cc6307581a2ece68` (byte-identical, covered by COMMON_SCRIPTS in validate-script-sync.js).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`: different md5 (expected — forge rename tokens differ), but grep-diff on all AC#5 logic lines (orphan_multi_in_progress, inProgressNodes, active-batch, memberSetEquals, runOrient) is EMPTY — logic identical, only forge-specific name constants differ.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`: same result.

### Hunted Surfaces (no new blocking gap found)

1. **Two in_progress, no manifest**: confirmed REFUSE (tested live above, T20c).
2. **Two in_progress, mismatched manifest**: confirmed REFUSE (T20d). Manifest with `{impl-core, review}` while ledger has `{impl-core, impl-other}` in_progress → refuse.
3. **Two in_progress, matching manifest**: confirmed OK with batch object (T20b).
4. **One in_progress, no manifest**: confirmed OK, back-compat (T20a, live execution).
5. **Manifest cacheExists=true but readFile throws**: `raw = null`, `manifest = null`, treated as no manifest. Safe.
6. **Malformed manifest JSON**: `safeJsonParse` returns `{}`, no `members` array → `manifest = null`. Fail-closed.
7. **Orient read-only invariant**: `writeFile` call throws in T20a/T20c/T20e fixtures; no assertion violation.
8. **Refuse exits with code 1**: line 894–896 in the CLI dispatcher: `if (result.result === 'refuse') { process.exitCode = 1; }`. Orient's refuse is surfaced as JSON to stdout + exit 1. Orchestrator can parse and route repair.
9. **R4 scenario (3-member batch, 1 sealed/complete)**: manifest has 3 members, `inProgressNodes` has 2 → sets unequal, `inProgressNodes.length > 1` → orphan refusal. This is the acknowledged R4 non-blocking follow-up (exact-equality vs subset predicate requires a coordinated two-gate fix). Confirmed real, confirmed acknowledged, NOT a new finding.

## Recorded Non-Blocking Follow-Ups (NOT re-refuted)

- **R1**: compliance-row dedup (cosmetic); unchanged.
- **R2**: open-batch atomicity (fails-closed); unchanged.
- **R3**: write-role join honest partial; documented.
- **R4**: partial-seal batch (3+ member granular-seal, one member sealed → complete while 2 remain in_progress) triggers orient's exact-equality gate as orphan. Fails closed. Correct fix requires coordinated subset predicate across both orient and crossCheckStatus — follow-up, not a repair-scope bug. Already recorded in G1 code-review (code-review.md:R4).

## Verdict

NOT-REFUTED (confidence: high)

A1 is genuinely fixed: `runOrient` now enumerates all in_progress rows, checks the active-batch manifest, and emits `orphan_multi_in_progress` when >1 in_progress with no or mismatched manifest. All tests pass (135 adaptive-node assertions, 75 parallel-batch assertions, full walkthrough suite). Four-edition parity confirmed. No new blocking gap found after exhaustive search.
