# Advisor: Ideation Gate — issue-109

## Verdict: Approach 1 (Pattern B parity) confirmed. Proceed.

## Rationale
- `PICK_NEXT_PROJECT` at line 50 establishes local naming; `$KAOLA_PROJECT` at line 139 is a true orphan (regression-from-drift bug, not naming inconsistency)
- GitLab sibling has identical context (`--runtime codex`, same `claim_script` discovery), so byte-parity is the cheapest verifiable invariant
- Combined guard `[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ]` satisfies AC #2 and AC #3 in one expression

## Pre-Phase-3 Verifications (lock write-set precision)
1. Read SKILL.md directly to confirm exact line positions (50, 113–119, 139) — planner relied on explorer's read
2. Check JS string style in `validate-kaola-workflow-contracts.js` lines 86–89 — verify single-quote vs backtick style for assertIncludes calls
3. Add a third assertion for `'--reason git-freshness-block'` — guards against someone removing the recovery step while leaving extraction in place

## Out-of-Scope Confirmations
- GitLab sibling: do NOT touch (already correct)
- Claude command: do NOT touch (already correct)
- PICK_NEXT_PROJECT rename: out of scope
- Fast-forward retry (Pattern A Claude command feature): do NOT add — Pattern B sibling parity beats Claude parity for this file
- Empty-string release semantics investigation: skip — contract assertion is the line of defense

## Risk: Low. Complexity: S. No missed approaches.
