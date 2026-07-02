evidence-binding: n4-finalize 74d9e0fe3f8c
## n4-finalize — finalize sink node (main-session-direct)

Compliance: main-session-direct (finalize sink is non-delegable; the main session runs the finalize choreography).

Scope of this node's window: CHANGELOG.md (allowlist; no additional CHANGELOG edit was needed — n2-docs authored the #592 entry and the reviewer verified it).

Finalize choreography executed by the main session after this node closes:
- impl commit on workflow/issue-592 branch
- four-chain validation via kaola-workflow-run-chains.js --project issue-592 (KAOLA_RUN_CHAINS_CONCURRENCY=serial)
- validator gates: --resume-check / --gate-verify / --barrier-check / --verdict-check
- doc-docking + finalization-summary.md + gap sweep
- contractor mechanical finalize (cmdFinalize --keep-worktree) + sink-merge --sink --issue 592
