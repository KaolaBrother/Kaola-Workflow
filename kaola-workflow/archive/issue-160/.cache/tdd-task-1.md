# tdd-task-1 — Fix docs/api.md

## Status: GREEN

## Modified File
`docs/api.md`

## Changes Applied
1. Edit 1a (lines 327-329): Removed "Mutually exclusive" sentences from --archive, --export, --force bullets.
2. After --keep-branch (line 330): Added new paragraph describing skip-dirty default and archive > export > force precedence.
3. Edit 1b (line 339): Replaced "With `--archive` (default if no other strategy specified)" with two bullets: "No strategy flag: dirty worktrees are skipped and reported in `skipped_dirty`" and "With `--archive`: Changes are stashed".
4. Edit 1c (lines 354-378): Replaced single fabricated JSON block (strategy, execute, keep_branch, summary, details) with two accurate labeled blocks (dry-run shape and execute shape). Header changed from "when `--json` is appended" to unconditional "**JSON output:**".

## RED Evidence
N/A — documentation-only edit, no testable behavior change.

## GREEN Evidence
All 5 visual checks passed:
- "Mutually exclusive" removed from flag bullets
- Precedence paragraph added after --keep-branch
- "default if no other strategy" removed from line 339 area
- Fabricated fields (strategy, execute, keep_branch, summary, details) gone
- Two separate JSON blocks present (dry-run + execute shapes)

## Deviations
None.
