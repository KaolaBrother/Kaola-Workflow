# TDD Task 5 — Docs: api.md

## Result: COMPLETE

## RED Evidence
`grep -c "kaola-gitlab-workflow-claim.js stale-worktree-check" docs/api.md` returned 0.

## Changes Made
File: `docs/api.md`
- Lines 209-221 inserted: GL and GT invocation examples after the GitHub example in the stale-worktree-check section. Added forge-specific prefix note.

## GREEN Evidence
`grep -c "stale-worktree-check" docs/api.md` returned 4 (heading + GitHub + GL + GT).

## Deviations
None. Matched existing heading depth (###), bold label style, fenced bash blocks.
