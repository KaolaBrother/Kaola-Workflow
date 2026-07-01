evidence-binding: n1-fail-closed-contract cb17c4fd9ce1
RED: Added contract assertions for the phrase `fresh child-session effort proof` before updating plan-run dispatch prose. Expected failures:
- `node scripts/validate-workflow-contracts.js` failed because `commands/kaola-workflow-plan-run.md` lacked the phrase.
- `node scripts/validate-kaola-workflow-contracts.js` failed because `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md` lacked the phrase.
- `node scripts/test-route-reachability.js` failed for all six plan-run command/skill surfaces.

GREEN: Updated all six Codex plan-run command/skill surfaces to require a fresh child-session JSONL `turn_context.effort` proof for any non-null `dispatch.codex_reasoning_effort`, applying to both V2 and V1 tiered Codex dispatch, and to refuse with `codex_effort_override_unavailable` when proof is absent/stale/failing. Added matching assertions to root/Codex/GitLab/Gitea validators.

Validation:
- `node scripts/validate-workflow-contracts.js` -> passed.
- `node scripts/validate-kaola-workflow-contracts.js` -> passed.
- `node scripts/test-route-reachability.js` -> passed (185 assertions).
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` -> passed.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> passed.
- `node scripts/validate-script-sync.js` -> passed.
- `git diff --check` -> passed.
