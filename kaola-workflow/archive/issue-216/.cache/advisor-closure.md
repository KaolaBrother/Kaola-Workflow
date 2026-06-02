# Advisor — issue-216 Closure Gate

## Closure decision

**#216 closes.** The LOW ANSI/newline-in-stderr item is a pre-existing pattern outside #216's scope. It is not a partial implementation, conflict, or user-decision item. Record as follow-up note in summary; do not open a follow-up issue unless the user asks.

## Pre-commit tasks given

1. Stage explicitly by file name — never `-A` or `git add kaola-workflow/` — to avoid sweeping in `kaola-workflow/archive/issue-219/phase6-summary.md`. The staging guard excludes archive/ paths.
2. Prove aheadCount assertion goes RED: confirmed — skip-reset version → `Error: local main must be at origin/main, got ahead=1`.
3. Document standard-finalize / untracked-archive path in summary: in the untracked-archive path, `reset --hard` doesn't touch untracked files, so the archive survives AND main is clean — both invariants hold; `wasArchived` still fires because `fs.renameSync` moved the live dir before sink-merge starts.
