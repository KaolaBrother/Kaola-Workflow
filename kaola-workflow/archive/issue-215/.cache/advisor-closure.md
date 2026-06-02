# Advisor Closure Gate: issue-215

## Verdict: DO NOT CLOSE — fix the heading-locator regression first

## Finding
The MEDIUM security finding is not a normal deferrable finding. It is a regression introduced by the fix itself:
- Original sectionBody: heading-locator had NO fence tracking → ## Scope always found → pre-Scope unterminated fences harmless
- #215 fix: added fence tracking to BOTH loops → NEW: unterminated fence before ## Scope leaves inFence=true, ## Scope never matched → returns '' → false GREEN

This is the exact failure direction the issue exists to prevent. Filing a follow-up while shipping a known false-GREEN regression repeats the #213→#215 pattern.

## Required fix (before close)
Remove fence-detection from the heading-locator loop (first for loop). Keep it only in the body-collector loop (second for loop). This:
- Eliminates the regression
- Makes the function smaller
- Restores known-good behavior (## Scope is never inside a fence in real fast-summary.md)

The tests T1a/T1b/T1c will still pass because the body-collector is what they exercise.

## Additional test required
Add a pre-Scope unterminated fence regression test: a section before ## Scope that opens a fence and never closes it, then ## Scope with a Write Set path → assert RED (path still counted). Add to all 3 harnesses (same rationale as mixed-marker test).

## LOW comment fix
Rephrase "Run-length not tracked — workflow output never uses 4+ backtick fences" from fact to input-contract assumption in all 4 classifier copies.

## Path forward
1. Route fix to tdd-guide (revert locator half in 4 copies, add regression tests)
2. Re-run code-reviewer + security-reviewer
3. Then Phase 6 can close

## Issue #215 closure decision
HOLD — close after regression fix + re-review passes
