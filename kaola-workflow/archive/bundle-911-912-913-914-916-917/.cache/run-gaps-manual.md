# Run gaps observed by the orchestrator — bundle-911-912-913-914-916-917

Gaps this run discovered that the scanner could not observe: each was found by reading or measuring
during the run, not by a step failing in a way the scanner sees.

gap: forge-roadmap-rules-divergence — the gitlab/gitea roadmap.js generators emit a different RULES_BLOCK than canonical (4 bullets vs 5, only 2 overlapping); original divergence, zero commits, invisible to validate-script-sync, and the rendered workflow-init surfaces disagree with the forge generators' own output
gap: forge-claim-dead-code — the gitlab/gitea claim.js ports carry persistExpansionRollupToSummary/parseExpansionRecords reading workflow-plan.md that canonical deleted (grep count 0 in canonical)
gap: false-mechanism-in-finding-message — canonical's archive_stage_failed asserts `git add` is all-or-nothing over its pathspec list; measured false, exit 1 AND ROADMAP.md staged
gap: api-doc-field-absent-on-forges — docs/api.md:330 documents archive_unstaged unconditionally; measured 1x canonical, 0x on both forge ports, while sibling residue_unstaged is 1/1/1
gap: forge-archive-staging-unscoped — the forge unscoped `git add -A kaola-workflow/` sweeps a FOREIGN project's live folder and archive band into `chore: archive <project>` past both staging guards at exit 0; a scoping gap no failure type can reach because it succeeds
gap: forge-branchless-unported — #711 branchless runs are implemented in canonical and absent from both forge ports (12 references vs 1); a forge `--branch TBD --sink` passes preflight and would then push/merge against a branch literally named TBD
gap: suite-reads-operator-git-config — test-sink-merge and both forge sink suites created bare remotes with no explicit initial branch, so they were RED at the v9.2.0 release commit on any box without a global init.defaultBranch; fixed in this run
gap: finding-type-count-drift — #916 added a seventh finalize finding type in the same bundle whose prose stated six; docs/api.md and the CHANGELOG were briefly false with every chain green, and nothing recounts types against prose
