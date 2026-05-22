# tdd-task-5 — test-install-model-rendering.js: rendered-sonnet assertions

## Files Modified
- scripts/test-install-model-rendering.js

## Change
Added 4 assertions after assert(phase6.includes('model="haiku",'), ...) line:
- phase5 build-error-resolver renders as sonnet
- phase6 build-error-resolver renders as sonnet
- phase5 tdd-guide renders as sonnet (in new routed-fix block)
- phase6 tdd-guide renders as sonnet (in new routed-fix block)

## RED Evidence
N/A — assertions added after Wave 1 edits; install.sh substitutes placeholders correctly.

## GREEN Evidence
node scripts/test-install-model-rendering.js → "Install model rendering tests passed"

## Deviations
None. Assertions inserted between the haiku assertion (line 42) and the fast/opus assertion (line 59), not after all existing assertions.
