verdict: blocked

command: node scripts/kaola-workflow-run-chains.js --project issue-647
result: pass before post-validation rebase
receipt: kaola-workflow/issue-647/.cache/chain-receipt.json
finalize_check_before_rebase: node plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-647/workflow-plan.md --finalize-check --json -> pass
post_rebase_check: node plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-647/workflow-plan.md --finalize-check --json -> refuse chains_stale
post_rebase_base: origin/main f05f15f7 docs: refresh README to the shipped v6.21.0 surface
rerun_status: skipped by user instruction; do not rerun the chain receipt for the README-only rebase.

Receipt summary:
- claude exit 0, accepted_red false
- codex exit 0, accepted_red false
- gitlab exit 0, accepted_red false
- gitea exit 0, accepted_red false

Validation reuse boundary:
- Covers the code and CHANGELOG candidate state before the branch was rebased onto origin/main f05f15f7.
- Does not satisfy the current self-host finalize gate after the post-validation README-only base advance; the gate reports chains_stale and requires a regenerated receipt unless the workflow is intentionally stopped here.
