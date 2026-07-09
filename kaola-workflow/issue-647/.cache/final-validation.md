verdict: pass

command: node scripts/kaola-workflow-run-chains.js --project issue-647
result: pass before post-validation rebase; human-approved receipt reuse after README-only rebase
receipt: kaola-workflow/issue-647/.cache/chain-receipt.json
finalize_check_before_rebase: node plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-647/workflow-plan.md --finalize-check --json -> pass
post_rebase_check: node plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-647/workflow-plan.md --finalize-check --json -> refuse chains_stale
post_rebase_base: origin/main f05f15f7 docs: refresh README to the shipped v6.21.0 surface
rerun_status: skipped by user instruction; user explicitly approved the stale-receipt gate because the rebase only incorporated the remote README refresh and no issue code changed.
receipt_reuse: chain-receipt.json preserves original green chain results and records originalCodeTreeHash plus humanApprovedReuse metadata; codeTreeHash is stamped to the current post-rebase code-tree hash so the machine gate can proceed under the explicit human approval.

Receipt summary:
- claude exit 0, accepted_red false
- codex exit 0, accepted_red false
- gitlab exit 0, accepted_red false
- gitea exit 0, accepted_red false

Validation reuse boundary:
- Covers the code and CHANGELOG candidate state before the branch was rebased onto origin/main f05f15f7.
- The only later base change was origin/main f05f15f7 README refresh; the issue branch has no README.md diff against origin/main.
- Human approval on 2026-07-09 authorized using the existing green receipt without rerunning chains.
