# Advisor Plan Output — issue-191

## Verdict: Endorse blueprint. 4 items to fold into plan/Phase 4.

## L5 Contradiction Resolved
Verified: uninstall.sh lines 54-94 ARE presence-guarded ([ -f ], [ -d ] checks). Architect was correct. Explorer was wrong.
CONSEQUENCE: FORGE sentinel alone (FORGE="" default + `if [[ -z "$FORGE" ]]; then FORGE=all; fi`) is the complete L5 fix. Do NOT add separate "dead-guard revival" logic — the guard (line 193) already works correctly.
Also required: Add contained behavioral test for L5 (mktemp HOME, seed fake ~/.claude/kaola-workflow-gitlab, run bash uninstall.sh, assert dirs vanish). bash -n alone is insufficient.

## L2 Test Assertion Spec
Test must assert the ACCEPTED behavior: row is preserved (guard-caller sees count>0), pipe is present in title, backslash may remain (round-trip through cmdMigrate produces `a \| b` — accepted, scoped out). Do NOT assert `a | b` exact round-trip — that would drive an unescape change that was explicitly scoped out.

## WS-A Byte-Sync Gate (Phase 4)
Agent assigned WS-A must grep for old patterns (`:\\s*` and `[^|]+?`) across ALL editions returning ZERO before declaring done. Enumerate every file by path in Phase 4 prompt — don't rely on "I think I got them all."

## Dogfooding Gate
Full npm test (all 4 editions) must be green BEFORE Phase 6 finalize executes. L3/L4 modify claim.js, active-folders.js, classifier.js — the exact scripts Phase 6 runs. A bug in these could corrupt #191's own closure.
