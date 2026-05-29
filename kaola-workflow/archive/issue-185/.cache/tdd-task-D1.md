# TDD Task D1 — docs/api.md update

## Status: complete

## Changes made
`docs/api.md` line ~94: appended "Values above 600000ms (10 minutes) are clamped to 600000ms; this cap prevents excessively large values from silently disabling the hang protection (issue #185)." to the existing fallback description.

## Validation
`npm test`: all 4 suites GREEN (docs not syntax-checked but no test regressions)
