evidence-binding: n5-finalize 78f55b3b3523

# Finalization — bundle-506-507 (#506 + #507)

## Cross-edition gate (#307) — ALL FOUR CHAINS GREEN (exit 0)
- claude: exit=0 — "Workflow walkthrough simulation passed"
- codex:  exit=0 — "Kaola-Workflow walkthrough simulation passed"
- gitlab: exit=0 — "GitLab Codex workflow walkthrough simulation passed"
- gitea:  exit=0 — "Gitea Codex workflow walkthrough simulation passed"

## Node outcomes
- n1-sink-merge-fix (#506): outer `git worktree list` probe fail-closed (×4 editions); RED→GREEN; barrier passed.
- n2-classifier-fix (#507): boundary-2 transient fetch fault classified+retried→indeterminate→escalate; clean_nonzero stays determinate (×4 editions); RED→GREEN; barrier passed.
- n3-review: G1 code-review PASS, findings_blocking: 0 (2 non-blocking follow-ups: R1 forge parseJson cross-edition parity, R4 forge claim-flow determinate-coverage — to be filed).
- n4-docs: CHANGELOG.md [Unreleased]/Fixed — #506 + #507 entries added.

## Write-set discipline
15 files modified, all within the two declared write-sets + CHANGELOG. Zero forbidden files (kaola-workflow-adaptive-node.js / commands/kaola-workflow-plan-run.md / claim.js untouched) — parallel-safe with the concurrent #500 machine.
