evidence-binding: n5-finalize 81814c3cdb3b
## n5-finalize — finalize sink node (main-session-direct)

Compliance: main-session-direct (finalize sink is non-delegable).

Scope: CHANGELOG.md + kaola-workflow/issue-596/workflow-state.md allowlist (no additional CHANGELOG edit needed — n4-docs authored the #596 entry; both gates verified).

Finalize choreography executed by the main session after this node closes:
- impl commit on workflow/issue-596
- four-chain validation via kaola-workflow-run-chains.js --project issue-596 (KAOLA_RUN_CHAINS_CONCURRENCY=serial)
- validator gates: --resume-check / --gate-verify / --barrier-check / --verdict-check
- gap sweep + doc-docking + finalization-summary.md
- contractor mechanical finalize (cmdFinalize --keep-worktree)
- sink: sink-merge --sink --issue 596
- post-sink: file the LOW follow-up from n3-review (selectSpeculativeWriteGroup fail-open on validator subprocess error)
