evidence-binding: n1-finalize-barrier 42551f908fc9
<!-- RED: paste RED here -->
RED: Added an additive `assert(...)` pin to both
`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` and
`plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` requiring the
finalize SKILL to contain `workflow_path: adaptive`, `validator_script`, `--resume-check`,
`--gate-verify`, `--barrier-check`, and `--verdict-check`. Ran against the UNFIXED SKILL content
(fast-branch only, no adaptive block):
`npm run test:kaola-workflow:gitlab` →
`Error: GitLab finalize skill must carry the adaptive prerequisite block (workflow_path: adaptive
+ the four-gate validator_script barrier) — #624` (thrown from the new assert at
validate-kaola-workflow-gitlab-contracts.js:19, called from the pin at line ~382).
`npm run test:kaola-workflow:gitea` →
`Error: Gitea finalize skill must carry the adaptive prerequisite block (workflow_path: adaptive
+ the four-gate validator_script barrier) — #624` (thrown from the new assert at
validate-kaola-workflow-gitea-contracts.js:19, called from the pin at line ~389).
Both chains failed exactly as expected (pre-port state), confirming the pin fails on unfixed content.

<!-- GREEN: paste GREEN here -->
GREEN: Ported the canonical adaptive prerequisite block (the `workflow_path: adaptive` branch +
the `validator_script` resolver + the `--resume-check`/`--gate-verify`/`--barrier-check`/
`--verdict-check` four-gate bash block, forge-neutral, modulo forge script-name nouns) from
`plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` (lines 15-70) into both
`plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` and
`plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md`, inserted after the
fast-branch paragraph and before `### Chain-Receipt Gate`. Also fixed the gate-count prose
("three gates — run all three" → "four gates — run all four") in `commands/kaola-workflow-finalize.md`,
`plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`, and
`plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md`. Re-ran all four chains
sequentially, all exit 0:
- `npm run test:kaola-workflow:claude` → exit 0, "Workflow walkthrough simulation passed" +
  "active-folders-field-parity tests passed (61 assertions)".
- `npm run test:kaola-workflow:codex` → exit 0.
- `npm run test:kaola-workflow:gitlab` → exit 0, "Kaola-Workflow GitLab contract validation passed"
  (new #624 pin green) + "GitLab workflow walkthrough simulation passed" +
  "GitLab Codex workflow walkthrough simulation passed" + "active-folders-field-parity tests
  passed (61 assertions)".
- `npm run test:kaola-workflow:gitea` → exit 0, "Kaola-Workflow Gitea contract validation passed"
  (new #624 pin green) + "Gitea workflow walkthrough simulation passed" +
  "Gitea Codex workflow walkthrough simulation passed" + "active-folders-field-parity tests
  passed (61 assertions)".
4/4 assertions green (the two new #624 pins plus the pre-existing #345 four-gate command pins in
both forge contract validators, all unaffected/still passing).
