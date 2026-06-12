evidence-binding: n2-contractor-guard e1c0f4845b41
non_tdd_reason: glue/prose — shell-block edit + byte-mirror parity across 4 edition files; no natural failing unit test (behavior validated by scenario D in test-bash-block-guards.js added in n1; cross-edition parity asserted by contract validators)
verification_tier: regression-green

## task
Add a workflow-plan.md presence-check to the Step-8a ledger-compare guard in contractor.md and mirror the change across all three contractor.toml edition files. When workflow-plan.md is absent (full/fast-path project), the guard emits `ledger_compare_skipped: no_plan` and continues rather than failing.

## non_tdd_reason
glue/prose — this is a shell-block edit (presence-check wrapping existing ledger-compare logic) plus byte-mirror parity propagation across 4 edition files. No natural failing unit test exists: the behavioral guard is validated by the scenario D fixture already added in n1 (test-bash-block-guards.js), and cross-edition parity is machine-enforced by the contract validators in the four chains.

## write_set
- agents/contractor.md
- plugins/kaola-workflow/agents/contractor.toml
- plugins/kaola-workflow-gitlab/agents/contractor.toml
- plugins/kaola-workflow-gitea/agents/contractor.toml

## change_summary
contractor.md (Step 8a shell block, lines ~135-141):
- Added `PLAN_PATH="kaola-workflow/{project}/workflow-plan.md"` variable
- Replaced bare `if [ -n "$LEDGER_COMPARE_JS" ] && ! node ...` with a `[ -f "$PLAN_PATH" ]` outer check
- When plan is present: runs ledger-compare as before (using $PLAN_PATH for --source)
- When plan is absent: emits `ledger_compare_skipped: no_plan` and continues

All three contractor.toml files (Step 8a prose bullet):
- Added one sentence: "If workflow-plan.md is absent (full/fast-path project with no adaptive plan), skip the ledger-compare and emit `ledger_compare_skipped: no_plan` — do not fail."
- Sentence inserted after the guard-refusal sentence, before "This step must run after all Finalization artifact writes."

## verification_commands

### Baseline (before changes)
node scripts/simulate-workflow-walkthrough.js
exit: 0 — "Workflow walkthrough simulation passed"

### Forbidden-token checks
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js \
  --forbidden-only plugins/kaola-workflow-gitlab/agents/contractor.toml
exit: 0 — "Kaola-Workflow GitLab forbidden-only check passed (1 file(s))"

node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js \
  --forbidden-only plugins/kaola-workflow-gitea/agents/contractor.toml
exit: 0 — "Kaola-Workflow Gitea forbidden-only check passed (1 file(s))"

### Four-chain regression
npm run test:kaola-workflow:claude  — exit 0 — "Workflow walkthrough simulation passed"
npm run test:kaola-workflow:codex   — exit 0 — "Kaola-Workflow walkthrough simulation passed"
npm run test:kaola-workflow:gitlab  — exit 0 — "GitLab workflow walkthrough simulation passed" + "GitLab Codex workflow walkthrough simulation passed"
npm run test:kaola-workflow:gitea   — exit 0 — "Gitea workflow walkthrough simulation passed" + "Gitea Codex workflow walkthrough simulation passed"

## before_result
node scripts/simulate-workflow-walkthrough.js: exit 0 — "Workflow walkthrough simulation passed"

## after_result
All four chains green (exit 0); forbidden-token checks pass on both forge editions; no new failures introduced.
