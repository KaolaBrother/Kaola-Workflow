evidence-binding: n3-runtime-prose 1d183bf16af1

assigned_task: n3-runtime-prose
goal: Add provenance-free runtime prose for stamp-last self-host receipts, validation-invisible non-test-consumed docs/workflow state, chains_stale full-restamp guidance, and consumer final-validation citation fields across plan-run/finalize command and skill mirrors.
non_tdd_reason: agent-facing prose and prompt wiring; existing routing/contract checks provide regression coverage
verification_tier: regression-green
upstream_read: n1-explore 51876192226e

write_set:
- templates/routing/plan-run.skeleton.md
- templates/routing/slots.js
- commands/kaola-workflow-plan-run.md
- commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md

files_changed:
- commands/kaola-workflow-finalize.md
- commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- templates/routing/plan-run.skeleton.md
- templates/routing/slots.js

before_verification:
- node scripts/generate-routing-surfaces.js --check -> exit 0; all 12 surfaces byte-match the skeleton.
- node scripts/test-route-reachability.js -> exit 0; Route-reachability test passed (333 assertions).

after_verification:
- node scripts/generate-routing-surfaces.js --check -> exit 0; all 12 surfaces byte-match the skeleton.
- node scripts/test-route-reachability.js -> exit 0; Route-reachability test passed (333 assertions).
- git diff --check -> exit 0.
- node scripts/validate-workflow-contracts.js -> exit 0; Workflow contract validation passed.
- node scripts/validate-kaola-workflow-contracts.js -> exit 0; Kaola-Workflow Codex contract validation passed.
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js -> exit 0; Kaola-Workflow GitLab contract validation passed.
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js -> exit 0; Kaola-Workflow Gitea contract validation passed.
- node scripts/simulate-workflow-walkthrough.js -> exit 0; Workflow walkthrough simulation passed.
- npm run test:kaola-workflow:claude -> exit 130; optional broad chain was interrupted at the parent wait-budget request after passing through adaptive-handoff tests. npm run test:kaola-workflow:codex/gitlab/gitea were not started.

regression-green: node scripts/generate-routing-surfaces.js --check exit 0; node scripts/test-route-reachability.js exit 0

notes:
- Plan-run outputs were generated via node scripts/generate-routing-surfaces.js --write.
- Added prose was scanned for issue refs, decision ids, invariant tags, and ADR citations; no added-line matches.
- Remaining broader repo-policy work if required by the parent: complete the sequential npm package chains after the interrupted Claude chain, then run Codex, GitLab, and Gitea package chains.
