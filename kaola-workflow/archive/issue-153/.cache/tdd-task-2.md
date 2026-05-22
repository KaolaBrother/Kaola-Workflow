# tdd-task-2 — F3 block drop-guard ×3 validators + mirror (plan T3+T4+T5)
agent a505e7380a40bee75, model=sonnet, 2026-05-22.

## Files modified (within write set)
- scripts/validate-workflow-contracts.js: added `assertEveryDispatchHasModel` helper (after assertBefore)
  + invocation in phaseCommands loop after `assertIncludes(file,'model="{')`.
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js: byte-identical mirror via cp.
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js: same helper (after
  assertConcept) + invocation in commandFiles.filter loop.
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js: same.

## TDD negative-test (RED)
Deleted `model="{PLANNER_MODEL}",` from commands/kaola-workflow-phase2.md:90 →
`node scripts/validate-workflow-contracts.js` → "Error: commands/kaola-workflow-phase2.md has an Agent(
dispatch block at line 88 missing a model="{..._MODEL}" line", exit 1. Guard fired.
Restored via `git checkout commands/kaola-workflow-phase2.md` → re-run → "Workflow contract validation
passed", exit 0. Orchestrator confirmed commands/ tree clean (git diff --stat commands/ empty).

## Validation results (all orchestrator-reconfirmed)
- node scripts/validate-workflow-contracts.js → passed
- node scripts/validate-script-sync.js → "OK: 9 common scripts in sync." exit 0
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js → passed
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js → passed
- cmp mirror vs canonical → byte-identical

## NOTABLE FINDING (orchestrator caught; agent summary omitted it)
At HEAD, plugins/kaola-workflow/scripts/validate-workflow-contracts.js (249 lines) was ALREADY 20 lines
BEHIND canonical scripts/validate-workflow-contracts.js (269 lines): the mirror was MISSING the
issue-152 "routed-fix Agent blocks" validation block (commit d22e60c updated canonical but not the mirror
→ latent validate-script-sync violation on main). Bringing the mirror byte-identical to canonical (required
to add our F3 guard AND to pass validate-script-sync) necessarily backfilled that block. This is correct and
unavoidable. Since validate-script-sync now passes after fixing ONLY validate-workflow-contracts.js, that was
the ONLY drifted common script at HEAD. → DOCUMENT in PR: this PR incidentally resolves a pre-existing #152
script-sync drift; the plugin-mirror diff is larger than the canonical diff for this reason.

## Diff verified by orchestrator: all 4 validators carry the guard + invocation; within write set.
