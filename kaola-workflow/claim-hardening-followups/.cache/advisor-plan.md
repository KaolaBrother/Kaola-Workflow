# Advisor Plan Gate: claim-hardening-followups

## Verdict

APPROVED. Build sequence is dependency-safe. Nothing missing from the blueprint.
A developer could implement this without further consultation.

## Pre-Flight Checks for Phase 4

1. **Item 4 spawnSync import**: `spawnSync` must be destructured from `child_process`
   at line 5 of `simulate-workflow-walkthrough.js`. Verify with grep before editing.
   If missing for any reason, add to the existing destructure — do not add a separate require.

2. **Item 2 failure routing**: If `assert(entry8d != null, ...)` fails after the tightening,
   the fix is in `cmdStatus` (it should be surfacing the entry), NOT reverting to the loose
   disjunctive assert. The disjunction was hiding a real contract gap; tightening it is the
   point. Route to tdd-guide; do not repair inline; do not revert the assertion.

3. **Guard 1 interpretation confirmed correct**: Baseline run BEFORE any changes confirms
   starting GREEN. Re-run after Items 3+1 (group A) is the actual "Guard 1" satisfaction
   for Item 2. The original advisor-ideation phrasing was ambiguous; the resolution in
   architect.md matches the intent.

## Edge Cases Handled Correctly

- Item 1 function-form mirrors line 387 idiom — categorically eliminates `$&`/`$1` expansion.
  No new test needed; Test 8E exercises the "Sink already exists" path.
- Item 4 preserves throw-on-nonzero semantics via explicit `r.status !== 0` check; no behavior
  change, only stderr surfacing.
- Out-of-scope list correctly excludes line 19 (`$&` regex escape — intentional, not a
  replacement-string risk) and lines 147-148 (ISO timestamps, never contain `$`).

## Commit Strategy Confirmed

One commit at Phase 6:
`fix: claim-hardening follow-ups (updateSinkLease + test hygiene)` (closes #11)

## Date
2026-05-15T04:30:00Z
