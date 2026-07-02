evidence-binding: n4-finalize 776090e028c8
## n4-finalize — finalize sink node (main-session-direct)

Compliance: main-session-direct (finalize sink is non-delegable).

Scope: CHANGELOG.md allowlist — the #599 ### Fixed entry was authored HERE (deferred from n3-docs because CHANGELOG.md is PROTECTED and would have disqualified n3's speculative eligibility; the plan assigned it to this node).

Finalize choreography executed by the main session after this node closes:
- CHANGELOG commit on workflow/issue-599 (chain-asserted doc written BEFORE chains)
- four-chain validation via kaola-workflow-run-chains.js --project issue-599 (KAOLA_RUN_CHAINS_CONCURRENCY=serial)
- validator gates: --resume-check / --gate-verify / --barrier-check / --verdict-check
- gap sweep + doc-docking + finalization-summary.md (records the in-run leg-base repair)
- contractor mechanical finalize (cmdFinalize --keep-worktree)
- sink: sink-merge --sink --issue 599

Live #596 exercise observed this run (recorded in issue #597 comment): speculative open (leg lg-n3-docs) -> gate_not_complete fence -> gate pass -> group_passed merge 23d4df98.
In-run repair (documented for the summary): an interim impl commit (67464e62) landed between leg provision and merge -> parent_dirty then write_set_overflow then leg_base_unreachable (all correctly fail-closed); recovered by reset-to-interim-commit + rebase-leg-onto-it + close-node retry (merge then passed clean). No unattributed writes at any point (the five script files were measured by n1-fix's own closed barrier).
