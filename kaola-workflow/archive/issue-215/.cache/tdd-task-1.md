# Task 1: Root walkthrough — add 3 tests

## File Modified
`scripts/simulate-workflow-walkthrough.js`

## Insertions
- 3 function definitions inserted after testClassifierFastScopeFenceCommentRed closing brace (~line 611)
- 3 registration calls inserted after testClassifierFastScopeFenceCommentRed() call (~line 4181)

## Functions Added
1. testClassifierFastScopeFenceHeadingRed — ## Scope with backtick fence containing ## Some Heading, Write Set below fence
2. testClassifierFastScopeFenceMixedMarkerRed — ## Scope with backtick fence containing ~~~ then ## Heading (mixed-marker family test)
3. testClassifierFastScopeFenceInFencePathRed — Write Set path inside fence (discriminator guard)

## RED Evidence (failing-first)
- Suite exits 1 (non-zero)
- testClassifierFastScopeFenceHeadingRed: Error: issue #215 T1a: a ## heading inside a fenced block must not truncate ## Scope; Write Set below it must still be counted, got green
- testClassifierFastScopeFenceMixedMarkerRed: isolated check confirms returns green (will fail when suite reaches it after T1a fix)

## GREEN Evidence (T1c)
- testClassifierFastScopeFenceInFencePathRed returns red in isolation — PASSED (discriminator guard confirmed)
- Current classifier already counts paths inside fenced blocks

## Status
COMPLETE (failing-first confirmed for T1a/T1b; T1c passes as expected)
