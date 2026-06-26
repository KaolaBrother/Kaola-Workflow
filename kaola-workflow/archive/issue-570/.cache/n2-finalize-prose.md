evidence-binding: n2-finalize-prose 45b1a22143b3

non_tdd_reason: prose/routing edit — gates the pre-contractor `run-chains.js` invocation across 6 finalize surfaces (3 Claude commands + 3 Codex SKILLs) by repo kind; correctness is asserted by the route-reachability pin checker and the workflow contract validator, not a unit test.

verification_tier: regression-green

regression-green:
  before:
    node scripts/test-route-reachability.js  EXIT:0  (152 assertions)
    node scripts/validate-workflow-contracts.js  EXIT:0
  after:
    node scripts/test-route-reachability.js  EXIT:0  (152 assertions)
    node scripts/validate-workflow-contracts.js  EXIT:0

## Summary

Files changed (6):

1. commands/kaola-workflow-finalize.md (Claude root command)
2. plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md (GitHub Codex SKILL)
3. plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md (GitLab command)
4. plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md (GitLab Codex SKILL)
5. plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md (Gitea command)
6. plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md (Gitea Codex SKILL)

Branch applied at the "Before dispatching/delegating to the contractor" operational step in
each file's Mechanical Finalization section:

- Self-host (npm) — `package.json` declares `test:kaola-workflow:*` scripts → run
  `kaola-workflow-run-chains.js` (main session) to produce `.cache/chain-receipt.json`;
  contractor verifies; `cmdFinalize` gates fail-closed. Unchanged from prior behavior.
- Consumer (non-npm) — no `test:kaola-workflow:*` scripts → do NOT invoke
  `kaola-workflow-run-chains.js` (returns only `chains_config_missing`). Gate is the
  agent's own `.cache/final-validation.md` (column-0 `verdict: pass`), produced from
  the plan's `validation_command`; `--finalize-check` auto-detects consumer mode (#475).

All existing PINs (`<!-- PIN: closure-audit -->`, `<!-- PIN: fast-compliance-backstop -->`)
preserved verbatim. `final-validation.md` references preserved in every file. No script
logic changed; no resolver patterns altered.
