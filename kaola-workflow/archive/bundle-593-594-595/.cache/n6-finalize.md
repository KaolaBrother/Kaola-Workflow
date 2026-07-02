evidence-binding: n6-finalize b4d152b2a7b8
## n6-finalize — finalize sink node (main-session-direct)

Compliance: main-session-direct (finalize sink is non-delegable).

Scope: CHANGELOG.md allowlist (no additional edit needed — n4-docs authored all three entries; gate-verified).

Finalize choreography executed by the main session after this node closes:
- impl commit on workflow/bundle-593-594-595
- four-chain validation via kaola-workflow-run-chains.js --project bundle-593-594-595 (KAOLA_RUN_CHAINS_CONCURRENCY=serial)
- validator gates: --resume-check / --gate-verify / --barrier-check / --verdict-check
- gap sweep + doc-docking + finalization-summary.md
- contractor mechanical finalize (cmdFinalize --keep-worktree)
- bundle sink: sink-merge --sink --issue 593 --issue-numbers 593,594,595 (all-or-nothing closure of all three members via the closure path shipped for the sink gate fix)
