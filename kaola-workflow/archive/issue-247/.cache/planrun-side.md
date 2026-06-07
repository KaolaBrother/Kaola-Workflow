node: planrun-side (implementer)
non_tdd_reason: prose/markdown normalization — no failing unit test for doc wording; behavior-preserving (docs-only, no script logic changed).

Normalized the plan-run SKILL's task→`in_progress` flip trigger from passive to active voice to byte-match the 3 command editions (which were already byte-identical and already canonical):
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md — "its role is dispatched (after `open-next`)" → "you dispatch its role (after `open-next`)"
- commands/kaola-workflow-plan-run.md — intentionally UNCHANGED (already correct; left untouched for #279 rebase-safety — #279 edits this file's repair-routing section)
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md — intentionally UNCHANGED (already correct)
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md — intentionally UNCHANGED (already correct)

All 4 plan-run editions now carry the identical dispatch trigger "Mark a node's task `in_progress` when you dispatch its role (after `open-next`) and `completed` once `close-and-open-next` returns `result: ok` (`n/a` → skipped)".

verification:
- grep -n "its role is dispatched" SKILL.md → no matches
- regression-green: node scripts/simulate-workflow-walkthrough.js → exit 0, "Workflow walkthrough simulation passed"
