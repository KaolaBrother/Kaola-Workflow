node: adapt-side (implementer)
non_tdd_reason: prose/markdown edit to authoritative command + skill text — no failing unit test exists for documentation wording; behavior-preserving doc fix.

Normalized the task→`in_progress` flip trigger to the canonical DISPATCH clause across the 4 adapt-side files:
- commands/kaola-workflow-adapt.md
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md (was vague — pinned)
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md

Canonical clause: the executor flips `in_progress` when it dispatches that node's role (after `open-next`) and `completed` after the commit step closes it (`n/a` nodes → skipped). The 3 command editions now share a byte-identical clause (bare `open-next`, edition script name dropped). Only the `in_progress` trigger changed; `completed` phrasing untouched; no .js scripts touched.

verification:
- grep -rn "opens that node" (3 command files) → no matches
- grep -rn "flips .*per node" SKILL.md → no matches
- regression-green: node scripts/simulate-workflow-walkthrough.js → exit 0, "Workflow walkthrough simulation passed"
