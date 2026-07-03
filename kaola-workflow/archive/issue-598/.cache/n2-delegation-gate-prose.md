evidence-binding: n2-delegation-gate-prose de46478ccdab
<!-- RED: paste RED here -->
RED (two independently-reproduced signatures, both captured live before/around the prose edit):
(1) AC3, before any prose edit — `node scripts/validate-kaola-workflow-contracts.js` →
`Error: plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md must include:
~/.codex/agents/kaola-workflow/`. Same class reproduced in the other two editions before their
prose was edited: gitlab → `Error: plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
must name the global role-profile detection path`; gitea → the identical gitea-path error.
(2) AC4, isolated AFTER the AC3 fix landed by reverting only the 6 plan-run surfaces
(`git checkout --` on the 3 commands + 3 SKILL.md files, keeping the already-green next/adapt
edits + all 3 validators) and re-running all 3 validators: github/codex →
`Error: plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md must include:
## Gate-Role Degradation Notice`; gitlab → `Error: plugins/kaola-workflow-gitlab/commands/
kaola-workflow-plan-run.md must include: ## Gate-Role Degradation Notice`; gitea → the identical
gitea-path error. All 3 processes exited 1.

<!-- GREEN: paste GREEN here -->
GREEN: after restoring the 6 plan-run surfaces from the pre-revert copy (identical byte-for-byte
to the original edit — confirmed via `git diff --stat` before/after matching) all 3 validators pass:
`node scripts/validate-kaola-workflow-contracts.js` → `Kaola-Workflow Codex contract validation
passed` (exit 0); `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
→ `Kaola-Workflow GitLab contract validation passed` (exit 0); `node
plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → `Kaola-Workflow
Gitea contract validation passed` (exit 0) — 12 new assertIncludes needles (2 AC3 + up to 4 AC4 x2
surfaces per edition) now all resolve. `node scripts/test-route-reachability.js` → `Route-reachability
test passed (185 assertions)` (unchanged count — no PIN/CARD/`--speculative-consent`/
`--write-overlap-consent` literal disturbed). `node scripts/validate-workflow-contracts.js` →
`Workflow contract validation passed` (exit 0, unaffected — no root Claude-edition surface other
than the plan-run command was touched, and that file's needles live only in the validator this
node owns). 12/12 prose surfaces provenance-clean (zero `#NNN`/`D-NNN-NN`/`INV-NN`/ADR/PR·MR·AC#
matches, `grep -nE` over each file). `git status --short` in the leg shows exactly the 15 declared
files, nothing else; `node -c` syntax-clean on all 3 edited validator .js files.
