evidence-binding: n1-planrun-prose f656f40c435c
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: prose/routing edit — adds a self-host vs consumer branch to §5 "All done" across 6 edition surfaces; correctness is asserted by route-reachability + contract validators, not a unit test; no natural failing unit test exists for prose routing changes.
<!-- regression-green|build-green|smoke-integration -->
regression-green: node scripts/test-route-reachability.js passed (152 assertions, exit 0) both before and after edits; all 6 PIN comments (frontier unit, leg-isolation-recipe, speculative-open, etc.) preserved in all surfaces.

## Summary

Files changed (6):
1. commands/kaola-workflow-plan-run.md (Claude root command) — §5 "All done": wrapped the existing bash block `kaola-workflow-run-chains.js --project {project}` under a **Self-host (npm)** heading and added the **Consumer (non-npm)** branch directing to `validation_command` + `final-validation.md`.
2. plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md (GitHub Codex SKILL) — same branch added in prose form.
3. plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md (GitLab Claude command) — same branch in prose form matching the file's existing "proceed to" phrasing.
4. plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md (GitLab Codex SKILL) — same branch in prose form matching the "delegate to" phrasing.
5. plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md (Gitea Claude command) — same branch in prose form.
6. plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md (Gitea Codex SKILL) — same branch in prose form.

Branch applied: detect repo type at §5; self-host (`package.json` declares `test:kaola-workflow:*`) → run `run-chains.js --project {project}` as before (existing `#546 G11` note verbatim); consumer (no such scripts) → do NOT invoke `run-chains.js` (returns `chains_config_missing`), instead run `validation_command` from plan `## Meta` and record `kaola-workflow/{project}/.cache/final-validation.md` with column-0 `verdict: pass`; finalize's `--finalize-check` auto-detects consumer mode and gates on `final-validation.md` (#475).
