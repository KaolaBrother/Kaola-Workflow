evidence-binding: n2-code-certify 4705633604ca
contract_version: 2
review_context_hash: 14852bd8a0838d81ef9d985b6566673847835097615afef09858aa83653bd6dc
behavior_contract_hash: 42b6332c311ce07c511d67d3c7fb02cf874ab94872aaee87fadae2d0577fa789
resolved_profile_hash: 4f9e7c9aad33216895b1e618d06ad1bfb3beeea55af7094643af59ec927c8b6a
candidate_digest: da5911c85855c6dd0ea6dc324a8c4426603cfda6eaee47828023b3448ae63037
gate_mode: change_gate
gate_aggregation: sequence
upstream_read: n1-hook-pin-repair fb4376cd9880
gate_claim: the accumulated Phase D candidate (epoch-1 diff plus this epoch's repair) is green over the recorded validation command across all four npm chains plus the opencode and kimi suites — R1 (the installer-rendering blank-line pin) is resolved WITHOUT un-trimming the finalize Validation Delegation Policy prose, R2 (the kimi sync FATAL on the retired pre-commit hook) and R3 (the opencode hooks-template retired-hook resolution) are cleared by completing the Phase-C pre-commit-hook retirement in the additive editions, and AC-D still holds (trim targets met or one-line miss, six-surface contracts and route-reachability green, no provenance token in any prompt surface, the validate-workflow-contracts byte-twin identical, and the #736 self-dev guard intact)
gate_surface: the full accumulated candidate vs run base 1491c7e5 across all four editions plus the opencode/kimi suites, focused on the epoch-2 repair diff and the recorded validation command being green end to end
domain_outcome: approved
verdict: pass
findings_blocking: 0
review_summary: receipt binds to the candidate (digest exact-match, all four chains exit 0), R1/R2/R3 cleared without un-trimming, all AC-D cheap checks and the three beyond-brief surprises verified principled
review_attestation: full_review_completed
findings_none: full review of the accumulated Phase D candidate over its recorded validation receipt plus every cheap AC-D check yielded zero admitted candidate-caused blockers; the epoch-2 repair diff is principled and regression-free

## Review narrative

Reuse boundary (why I did not re-run the ~24-min four-chain suite): I recomputed computeLandableTreeDigest(cwd) myself and got da5911c85855c6dd0ea6dc324a8c4426603cfda6eaee47828023b3448ae63037, byte-identical to the gate candidate_digest. That proves the working tree is unchanged since the recorded run, so the receipt at kaola-workflow/issue-725/.cache/chain-receipt.json binds to exactly this candidate. Reading that receipt: scope.decision "all-four" (reason edition_coupling), base 1491c7e5, headSha a94ea0b7, codeTreeHash 9696b909…, workTreeHash ee88d62e…, and all four chains report exitCode 0 with accepted_red false / timed_out false (claude 1155s, codex 18.6s, gitlab 141s, gitea 144s); the preamble's five checks (validate-script-sync, vendored-agents, active-folders-parity, generate-routing-surfaces --check, edition-sync --check) all exit 0. Additive suites are cited from the dispatch (opencode 384 assertions exit 0, kimi 412 assertions exit 0) and corroborated by the n1 evidence's captured $?. Re-running the chains would be the exact redundant work this epic removes, so I did not.

Review context: validation_obligations is [] (confirmed by reading the context JSON), review_phase discovery, prior_findings [] — no pinned obligation to discharge.

Cheap AC-D checks, each with observed output:
- (a) R1 fixed by re-pointing, not un-trimming: grep "Validation Delegation Policy" commands/kaola-workflow-finalize.md returns nothing (heading stays trimmed out); grep "^## Steps$" matches line 202. I confirmed test-install-model-rendering.js now pins '\n\n## Steps\n\n', a heading that survives install rendering — and that pin ran green as a step in the claude chain (test-install-model-rendering.js exitCode 0, 20516ms).
- (b) byte-twin: cmp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js exit 0 (identical).
- (c) #736 self-dev guard: present (1 hit) in all four adaptive-node editions (canonical + plugins/kaola-workflow + gitlab + gitea); in the canonical it sits at line 815, before the #708 opencode return 'opencode' pattern at line 829/835, so a self-dev checkout named kaola-workflow is caught before the opencode swallow. validate-script-sync (green in the claude chain) enforces the cross-edition byte-sync.
- (d) mirror-before-dispatch line: present on all six plan-run surfaces (3 hits in each of the 3 forge commands, 4 hits in each of the 3 SKILL packs).
- (e) provenance sweep: across the 7 non-CHANGELOG repair files the only diff-added provenance token is #725 in scripts/test-opencode-edition.js, and it is a code comment (// A20 (mirror T10) — RETIRED (#725 Phase D) …) in a test file — not an agent-facing prompt surface (agent def / command / skill), so the provenance rule does not apply. CHANGELOG carries the repair provenance as intended.

Three beyond-brief surprises — each verified principled and regression-free:
1. Kimi write-lane retirement: sync-kimi-edition.js HOOK_SCRIPTS now lists only kaola-workflow-subagent-dispatch-log.sh, and renderKimiHooksToml() emits exactly two [[hooks]] blocks — SubagentStart (dispatch-log) and PostCompact (compact-context). These map one-to-one to canonical hooks/hooks.json's two surviving entries (SubagentStart dispatch-log + SessionStart/compact → compact-context); the PostCompact-vs-SessionStart naming is Kimi's documented semantic counterpart, not a mismatch. No pre-commit or write-lane reference remains. The kimi suite (412 assertions) exercises the byte-copy count and re-install parity.
2. Opencode dead-branch removal: templates/opencode/plugins/kaola-workflow-hooks.js HOOK map has no preCommit key and the if (tool === "bash") dispatch branch is gone entirely — only edit/write and task branches remain. I read runHook (line 70-83): when a script is not deployed, hookPath returns null and runHook returns {status:0} (fail-open, line 72), so the surviving write-lane call on edit/write can never reach status === 2 and is genuinely inert — matching the n1 claim and unchanged pre-existing behavior. Removing the whole branch is the correct fix, since leaving HOOK.preCommit undefined would have made path.join(root, ".opencode","hooks", undefined) throw a TypeError on every bash tool call.
3. Kimi K2 model sentence: the ## Agent Model Badge strip in sync-kimi-edition.js now inserts "Never pass a per-call model override; sub-agents inherit the session model." in the section's place (line 274), restoring the inherit-model guidance that a sibling Phase-D diet had collapsed into the badge section. test-kimi-edition.js K2 asserts that exact sentence's presence (line 150) plus the absence of any model="{…}" placeholder / "MUST pass model=" instruction (lines 137-140); the suite is green, and the now-orphaned standalone regexes are harmless no-ops.

The candidate is fully green over its recorded validation, R1/R2/R3 are cleared by the intended mechanisms (re-point, not un-trim; complete the Phase-C hook retirement in the additive editions), every AC-D invariant holds, and the three diffs beyond the literal brief are principled and regression-free. Recording verdict pass, findings_blocking 0.

review_conclusion: Phase D epoch-2 repair certified green with zero blockers, receipt digest-bound to this exact candidate and every cheap AC-D invariant plus all three beyond-brief surprises independently verified correct.
certifier_kind: code
certifier_aggregation: sequence
certifier_gate_digest: dd4108f34386bd9ffe4fcf7fc299480856f7d78f28f13b89ba402a253d860464
certifier_epoch_lineage_id: 38b676b0455daf24e54be04c4959f0a7ab3b353454db2876849df081cb4407bb
certifier_inherited_frontier_digest: ff81bb20dd3df09d4aed717e1f48d1cfc7c165827600ec01cd258b90c78660bd
certified_candidate_digest: 9696b909a2034a2e1be4fce277bd8aafc97c04e0b2f6329337782a94e683d82b
