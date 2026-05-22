# tdd-task-2 — Fix README.md line 534

## Status: GREEN

## Modified File
`README.md` (line 534)

## Changes Applied
- Command column: `[--archive\|--export\|--force]` → `[--archive] [--export] [--force]`
- Description column: Appended " No strategy flag = dirty worktrees are skipped. When multiple strategy flags given, precedence is: archive > export > force."

## RED Evidence
N/A — documentation-only edit, no testable behavior change.

## GREEN Evidence
Visual confirmation: pipe syntax removed, independent brackets present, precedence note appended, markdown table structure intact.

## Deviations
None.
