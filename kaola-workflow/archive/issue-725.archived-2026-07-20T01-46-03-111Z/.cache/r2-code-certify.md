evidence-binding: r2-code-certify 2bce2139e21f

contract_version: 2
plan_schema_version: 2
behavior_contract_version: 2
review_context_hash: fcc324274c98dc74a582a3ad07bd190222c33b0b9208a1564df98226b3f57951
behavior_contract_hash: 42b6332c311ce07c511d67d3c7fb02cf874ab94872aaee87fadae2d0577fa789
resolved_profile_hash: 4f9e7c9aad33216895b1e618d06ad1bfb3beeea55af7094643af59ec927c8b6a
candidate_digest: d60a39a80d1b90115128818a753b74478f8f2965b505e6d58194dd2348f771ba
gate_mode: change_gate
gate_aggregation: sequence

upstream_read: r1-hook-assert-repair e1060655efe5

gate_claim: the epoch-2 repair makes all four edition chains green over the full accumulated Phase C candidate and introduces no new code defect across the four editions: the gitlab and gitea fresh-install hooks.json assertions no longer require a PreToolUse event, the script-sync drift-plant fixture plants onto a surviving event instead of the removed PreToolUse key, sync-opencode-edition.js HOOK_SCRIPTS no longer lists the two deleted hook basenames so the in-chain install-opencode.sh regeneration stops ENOENT-ing, and the codex walkthrough #409 managed-hook-command count matches the surviving two managed commands; every surviving hook, assertion, and behavior is preserved and only the five diagnosed surfaces changed
gate_surface: the full accumulated Phase C candidate vs run base 0a9f652a across all four editions — the epoch-1 guard-dedup + two-hook-deletion frontier plus the epoch-2 five-file assertion repair — reviewed against AC-C and the recorded four-chain-green evidence

domain_outcome: approved
verdict: pass
findings_blocking: 0
review_summary: no_blocking_findings
findings_none: true


## Re-execution evidence (single sequential four-chain run over the certified tree)

One invocation of `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`, run in background and polled to completion, exited `FOUR_CHAIN_EXIT=0`. All four chains ran in order with their terminal pass lines present: claude — "Workflow walkthrough simulation passed" and "test-generate-routing-surfaces: all 280 assertions passed."; codex — "Kaola-Workflow Codex contract validation passed", "test409StableHomeSurvivesDirDeletion (#409): PASSED", "Kaola-Workflow walkthrough simulation passed"; gitlab — "Kaola-Workflow GitLab contract validation passed", "GitLab workflow walkthrough simulation passed", "GitLab Codex workflow walkthrough simulation passed"; gitea — "Kaola-Workflow Gitea contract validation passed", "Gitea workflow walkthrough simulation passed", "Gitea Codex workflow walkthrough simulation passed". Full-log sweep for `AssertionError`, `ENOENT`, `npm error`, `throw err;`, `Node.js v`, `at Object.<anonymous>`, `^Error:` — zero hits.

All five epoch-1 reproductions are green in-chain over the certified tree: R1 and R2 via the forge test scripts shelled by the passing walkthroughs (`plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js:1643` runs test-gitlab-workflow-scripts.js before its pass line; gitea equivalent at :1723); R3 via the in-chain "validate-script-sync guard tests passed (51 assertions; 2 canonicalOnly exclusions machine-guarded)"; R4 via the in-chain "Install adaptive-config tests passed" (install-opencode.sh regeneration, no ENOENT anywhere in the log); R5 via "test409StableHomeSurvivesDirDeletion (#409): PASSED". The five n7 findings are all observed resolved.

## Repair-delta verification (byte-level, barrier baselines)

The barrier baselines are git trees: e1060655efe5acf88a71e15f6ccc82e85935a1f6 (r1 open, epoch-1 final candidate) and 2bce2139e21f09add533fa1c1fe54264f2ae6a26 (r2 open, post-repair). Their product diff (excluding kaola-workflow/issue-725/ orchestrator state) is exactly five files carrying seven one-line narrowings, all inside r1's declared write set (plan row, workflow-plan.md line 97): plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js (:2005 #409 gl count 4->2, :2063 event array drops PreToolUse), plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js (:1971 #409 gt count 4->2, :2027 requiredEvents drops PreToolUse), plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js (:736 #409 count 4->2 only), scripts/sync-opencode-edition.js (HOOK_SCRIPTS drops exactly the two deleted basenames, nothing else), scripts/test-validate-script-sync.js (:141-142 drift plant retargeted PreToolUse->SubagentStart with matching comment; planted id/matcher/fixture-comment intact). No other product path differs between the two trees. The worktree at certification time is byte-identical to tree 2bce2139 for all product paths, with zero untracked product files — the tree I re-executed is the bound candidate.

## Per-claim-element verification

1. gitlab/gitea fresh-install hooks.json assertions no longer require PreToolUse — PASS (repair delta above; both forge test files re-executed green in-chain).
2. script-sync drift-plant onto a surviving event — PASS (SubagentStart plant; RED-PROOF still reds every port; 51 assertions green in-chain).
3. sync-opencode HOOK_SCRIPTS narrowing stops the in-chain ENOENT — PASS (two-line removal only; test-install-adaptive-config green in-chain; no ENOENT in the log; no wider opencode/kimi edit — the repair delta touches no .opencode/, opencode.json, adapter, or kimi path).
4. codex walkthrough #409 count matches the surviving two managed commands — PASS (:736 narrowed; #409 PASSED in-chain; the canonical scripts/simulate-workflow-walkthrough.js is absent from the repair delta, i.e. untouched by the repair).
5. Every surviving hook, assertion, behavior preserved; only the five diagnosed surfaces changed — PASS. Surviving compact-context + subagent-dispatch-log hook scripts are byte-identical to base 0a9f652a in all editions; all six hooks.json parse to exactly ["SessionStart","SubagentStart"]; no PreToolUse re-added anywhere (repo grep: remaining hits are comments, docs describing the removal, the codex walkthrough's intended negative assertion at :249-250 that hooks.json must NOT carry PreToolUse, the plan-declared adaptive-schema comment x4, and the Phase-D-deferred additive kimi/opencode surfaces, none in the four chains).
6. All four chains green over the full accumulated candidate — PASS (re-execution evidence above). AC-C standing intact: the epoch-2 delta touches no docs, so the epoch-1-verified CHANGELOG/dedup/integrity elements are unperturbed.

## Context notes and non-blocking observations

The canonical review context carries review_phase discovery with prior_findings [] and repair_delta null, so this is a full-scope discovery review over the accumulated candidate (a superset of the closure delta); the epoch-1 finding resolutions are recorded in prose above, and no closure accounting rows or validation-runner receipts are owed (validation_obligations empty). Non-blocking, not admitted as findings: (a) scripts/test-validate-script-sync.js:133 section comment and the :159 assertion-message string still say "PreToolUse" in prose while the plant now targets SubagentStart — message/comment text only, no behavioral effect; (b) scripts/sync-kimi-edition.js, scripts/test-kimi-edition.js, and the kimi/opencode docs still reference the deleted hook basenames — plan-declared Phase D deferral, additive editions outside the four chains, re-confirmed unexercised by this green run.

review_attestation: full_review_completed
review_conclusion: The epoch-2 five-file repair is exactly the surviving-two-hook narrowing it claims — seven one-line edits proven byte-level via the barrier-baseline tree diff with zero stray product writes, no PreToolUse re-added, and the surviving hooks byte-identical to base — and a fresh single sequential four-chain re-execution over the certified tree exited 0 with every terminal pass line present and all five epoch-1 reproductions green, so the accumulated Phase C candidate is certified with zero findings.
certifier_kind: code
certifier_aggregation: sequence
certifier_gate_digest: 8c891bfaf7488ec5cbf627a4ed5c89a6540642f20a36023fc8408b33eda4c032
certifier_epoch_lineage_id: 9dd20b195b0efe673f16fe6a1264b0173ee3574c9ec6c49e344dbbc817cb3627
certifier_inherited_frontier_digest: 103c4d1707f6f85f1ebd2bd571f3311cfbaa8e8386dcca346f5229b6525b2394
certified_candidate_digest: 48619143aecb2ed96bdc2b9a0b0462bfdcf9f0ef42debcb075c60af99af8cd49
