evidence-binding: n6-finalize ebdf6c40d098
## n6-finalize — finalize sink node (main-session-direct)

Compliance: main-session-direct (finalize sink is non-delegable).

Scope: CHANGELOG.md allowlist — the #597 ### Changed entry authored here (chain-asserted doc written BEFORE chains).

Finalize choreography executed by the main session after this node closes:
- CHANGELOG commit on workflow/issue-597
- four-chain validation via kaola-workflow-run-chains.js --project issue-597 (KAOLA_RUN_CHAINS_CONCURRENCY=serial)
- validator gates: --resume-check / --gate-verify / --barrier-check / --verdict-check
- gap sweep + doc-docking + finalization-summary.md (records the three Trivial Inline Edit Exception fixes: next-action.js:269 comment [n4 R1], gate_not_complete hint, schema.js:367 + test-next-action.js:506 comments [n5 R1/R2] — all in closed nodes' declared sets, all regenerated x4 where applicable, suites re-verified)
- contractor mechanical finalize (cmdFinalize --keep-worktree)
- sink: sink-merge --sink --issue 597
