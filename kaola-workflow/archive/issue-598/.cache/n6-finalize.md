evidence-binding: n6-finalize ff5311751a8b
## n6-finalize — finalize sink node (main-session-direct)

Compliance: main-session-direct (finalize sink is non-delegable).

Scope: CHANGELOG.md allowlist — the #598 ### Fixed entry authored here (chain-asserted doc written BEFORE chains).

Run shape note (durable): this run executed the FIRST production AUTO-TIER speculative open — n5-docs opened in an isolated leg via open-ready with NO consent flag (the #597 default), ran concurrently with the n4 gate, and pass-merged clean (group_passed, db62b9c1) after the gate's verdict: pass. The n1/n2 write antichain also co-opened in legs (the #593 relaxation) and merged clean (fc229372).

Finalize choreography executed by the main session after this node closes:
- CHANGELOG commit on workflow/issue-598
- four-chain validation via kaola-workflow-run-chains.js --project issue-598 (KAOLA_RUN_CHAINS_CONCURRENCY=serial)
- validator gates: --resume-check / --gate-verify / --barrier-check / --verdict-check
- gap sweep + doc-docking + finalization-summary.md
- contractor mechanical finalize (cmdFinalize --keep-worktree)
- sink: sink-merge --sink --issue 598
