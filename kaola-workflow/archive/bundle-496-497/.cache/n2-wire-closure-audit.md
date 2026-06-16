evidence-binding: n2-wire-closure-audit a132fdb00e1e
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: prose/wiring change across the finalize COMMAND + SKILL surfaces (forge-neutral) plus a route-reachability contract assertion — no natural failing UNIT test; correctness is enforced by the machine-checked reachability contract + the code-reviewer gate.
<!-- regression-green|build-green|smoke-integration -->
regression-green: all 4 chains (claude/codex/gitlab/gitea) green before (baseline: route-reachability 50 assertions) and after (62 assertions with new T6). Contract validators pass (validate-kaola-workflow-contracts.js, validate-workflow-contracts.js, validate-script-sync.js). Fail-closed proof: pin removed from commands/kaola-workflow-finalize.md → T6 FAIL exit 1; restored → 62 pass exit 0. CLI flag fix: closure-audit.js has no --project or --json flags; fixed all 6 surfaces before final chains.

## verification_tier
regression-green

## write_set
- commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- scripts/test-route-reachability.js

## verification_commands
- node scripts/test-route-reachability.js  → exit 0, 62 assertions
- node scripts/validate-kaola-workflow-contracts.js  → exit 0 (Kaola-Workflow Codex contract validation passed)
- node scripts/validate-workflow-contracts.js  → exit 0 (Workflow contract validation passed)
- node scripts/validate-script-sync.js  → exit 0 (OK: 26 common scripts)
- npm run test:kaola-workflow:claude  → exit 0 (Workflow walkthrough simulation passed)
- npm run test:kaola-workflow:codex  → exit 0 (Kaola-Workflow walkthrough simulation passed)
- npm run test:kaola-workflow:gitlab  → exit 0 (GitLab Codex workflow walkthrough simulation passed)
- npm run test:kaola-workflow:gitea  → exit 0 (Gitea Codex workflow walkthrough simulation passed)

## before_result
node scripts/test-route-reachability.js  → exit 0, 50 assertions (no T6 existed)
All 4 chains green.

## after_result
node scripts/test-route-reachability.js  → exit 0, 62 assertions (T6 adds 12: 6 surfaces x 2 asserts)
All 4 chains green.

## fail-closed proof
Temporarily replaced <!-- PIN: closure-audit --> with <!-- TEMPORARILY REMOVED --> in commands/kaola-workflow-finalize.md:
  FAIL: T6: commands/kaola-workflow-finalize.md must contain <!-- PIN: closure-audit --> comment
  Route-reachability test FAILED: 1 failure(s), 61 passed. Exit 1
Restored the pin:
  Route-reachability test passed (62 assertions). Exit 0

## CLI flag accuracy note
Verified scripts/kaola-workflow-closure-audit.js parseArgs(): only --execute is accepted (no --project, no --json).
JSON is always the output format. Fixed all 6 surfaces to remove --project {project} --json from invocation examples.
