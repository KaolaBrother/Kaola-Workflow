evidence-binding: r3-security-certify c46c6860bd4c

contract_version: 2
plan_schema_version: 2
behavior_contract_version: 2
review_context_hash: 408b95154205cb7d4841959f5b06acea87d4bfa79e5523d68e3ed46332e2954d
behavior_contract_hash: 1c9771f6f29f9a130b65aaf491dff9cf1691402dbdce489254a6248361026584
resolved_profile_hash: a6f7566a03d5ccdc8d890da743b41915e2d18ff36e30e7058bfdd41459cf041d
candidate_digest: d60a39a80d1b90115128818a753b74478f8f2965b505e6d58194dd2348f771ba
gate_mode: change_gate
gate_aggregation: sequence

upstream_read: r2-code-certify 2bce2139e21f

gate_claim: the full accumulated Phase C candidate introduces no security regression against the inherited security frontier: deleting the two advisory guard hooks removes only best-effort advisory guidance with no enforced security boundary while the fail-closed barriers, gate-role post-dominance, and per-mutation plan-integrity check remain the real controls, and the epoch-2 repair only narrows test assertions and one generation hook list with no change to any security-relevant runtime path and no exposed secret, credential, or trust surface
gate_surface: the full accumulated Phase C candidate vs run base 0a9f652a, security dimension — the inherited security frontier plus the epoch-2 repair, reviewed for any weakened enforcement, exposed secret, or trust-boundary regression

domain_outcome: approved
verdict: pass
findings_blocking: 0
review_summary: no_blocking_findings
findings_none: true

## Review basis and candidate binding

HEAD equals run base 0a9f652a79c57165281c9ad40c65f11a9a5a3f0e, so the accumulated Phase C candidate is the uncommitted worktree state vs HEAD: 46 product files (226 insertions, 1791 deletions), with the orchestrator state dir kaola-workflow/issue-725/ the only untracked path. The worktree product tree at certification time has ZERO paths differing from the r2-open barrier baseline tree 2bce2139e21f09add533fa1c1fe54264f2ae6a26 (git diff against that tree, kaola-workflow/issue-725/ excluded, returns empty) — this certification covers the same bytes r2-code-certify certified. Read before reviewing: the canonical review context (validation_obligations empty — no validation-runner receipts owed; review_phase discovery, prior_findings empty, repair_delta null), r2-code-certify (nonce 2bce2139e21f, recorded above), r1-hook-assert-repair (evidence-binding e1060655efe5), and the epoch-1 n5-hook-deletion evidence (evidence-binding bc92adfeddf3) from the epochs archive at kaola-workflow/issue-725/.cache/epochs/1/files/.cache/n5-hook-deletion.md.

## Advisory-hook deletion weakens no enforced control

Both deleted hook scripts were read in full at base 0a9f652a. hooks/kaola-workflow-pre-commit.sh is commit-hygiene guidance only: it blocks (exit 2) solely a commit staging MULTIPLE kaola-workflow project folders, is fail-open on every unparseable or unrecognized input by design, and touches no auth, secret, or trust surface. hooks/kaola-workflow-write-lane.sh has two arms: the lane-containment arm is gated on KAOLA_LANE_CONTAINMENT, fail-closed default OFF — dormant in every default install; the gate-window fence arm was default-ON but intercepts ONLY Write|Edit tool calls and carries a plain env opt-out (KAOLA_GATE_WINDOW_FENCE=0). Its own header states the honest layering: Bash-mediated writes were never covered by this hook, and the fail-closed accounting (per-node --barrier-check own-lane allowlist, seal vacuity, close-time evidence tokens) is the backstop, not the hook. A layer that any co-located actor bypasses via the always-available Bash tool or a one-line env var is best-effort advisory guidance, not an enforced security boundary — the project's trust model already placed the boundary in the barrier machinery.

The enforced controls named in the claim are verified intact: scripts/kaola-workflow-plan-validator.js (post-dominance gates, --barrier-check, --gate-verify), scripts/kaola-workflow-commit-node.js, scripts/kaola-workflow-next-action.js, scripts/kaola-workflow-adaptive-handoff.js, and scripts/kaola-workflow-adaptive-schema.js are all ABSENT from the diff in all editions. In scripts/kaola-workflow-adaptive-node.js (and its three plugin twins) the diff is a single hunk in mutationGuardPrologue's Layer-1 integrity check only — the consent-halt fence and live-coordination mutual-exclusion layers are untouched. No runtime consumer still invokes the deleted scripts: all six hooks.json are pure removals of the two PreToolUse entries (numstat 0 added / 26 deleted each, no additions anywhere), SUPPORT_HOOKS is narrowed in both install manifests, sync-opencode-edition.js HOOK_SCRIPTS drops exactly the two basenames, and install.sh adds two fixed-literal-path rm -f lines under the install-owned SUPPORT_HOOKS_DIR mirroring the existing retired-hook sweep precedent (no user-controlled expansion). The docs and CHANGELOG updates honestly record KAOLA_LANE_CONTAINMENT and KAOLA_GATE_WINDOW_FENCE as "read by no runtime consumer" — no phantom control is claimed anywhere in the candidate.

## The one enforcement-adjacent runtime change: the guard-prologue integrity fast path

The accumulated candidate's only change to a security-relevant runtime path is the Layer-1 plan-integrity fast path in kaola-workflow-adaptive-node.js (x4 editions). It recomputes the plan hash IN-PROCESS by calling the validator's exported computePlanHash (module side-effect-free: require.main guard at scripts/kaola-workflow-plan-validator.js:5143; per-edition require paths verified co-located with each edition's own validator, x4) and compares against the embedded frozen marker. On a MATCH it skips the shell --resume-check; on a mismatch, missing marker, or ANY thrown error it falls back to the authoritative shell --resume-check and refuses plan_integrity_failed with zero mutation — fail-closed is preserved, and a wrong require path or read failure degrades to the pre-change behavior, never to a pass. Soundness of the skip: revalidateForResume's checks beyond the hash comparison (plan contract, node parse, MAX_NODES, epoch compliance, dangling depends_on, cycle, unique sink) are pure functions of the hash-covered body — computePlanHash covers Meta + Nodes + Briefs, and parseEpochContract / resolvePlanContract read only the ## Meta section (plan-validator.js:528-585) — all established at freeze and vouched by the byte match. The plan_hash itself is a plain unkeyed SHA-256 restampable by anyone with plan-file write access, so it was never an adversarial-grade control in either path; the tamper-detection trust model is unchanged. The behavior is test-pinned in scripts/test-adaptive-node.js: new case #725a proves the clean-match skip, and #725b proves a post-freeze tamper with a stale marker recomputes, mismatches, falls back, and refuses plan_integrity_failed with the node not opened.

## Epoch-2 repair delta

The repair delta (r1-open baseline tree e1060655e vs r2-open baseline tree 2bce2139e, byte-verified by r2 and re-confirmed against the identical current worktree) is exactly five files carrying seven one-line narrowings: two forge test-script assertion sets, the codex walkthrough #409 count, the script-sync drift-plant retarget (PreToolUse to SubagentStart), and the sync-opencode HOOK_SCRIPTS two-line list removal. Every touched surface is a test assertion or a generation input list; none is an auth, secret, credential, session, or trust-boundary runtime path.

## Secret, credential, and provenance sweep

Added-line scan across the full product diff for credential-pattern material (password/secret/api-key/credential/private-key/PEM headers/ghp_/gho_/github_pat/AKIA/xox/Bearer): zero hits. Long-token scan (40+ chars) over added lines: only a comment ruler and two install-path fragments — no high-entropy material. No hardcoded secret, no plaintext credential comparison, no new external fetch, no shell built from user input (the install.sh additions are fixed literals). No secret value from any evidence file is reproduced here. Docs/CHANGELOG carry the provenance, as sanctioned; no new agent-facing prompt surface is introduced.

## Non-blocking observations (no security delta, not admitted)

(a) On a hash match the fast path no longer re-runs installedRoles per mutation (previously inside --resume-check) — a mid-run role-library removal now surfaces at dispatch rather than the guard prologue; environment-availability robustness only, and an actor able to mutate the installed role library already owns the host. (b) adaptive-node's planHashFromContent matches the marker case-insensitively while the validator's readStoredHash is lowercase-only; freeze always stamps lowercase hex, so the divergence is unreachable via any legal path and confers nothing to an actor who already has plan-file write access.


review_attestation: full_review_completed
review_conclusion: The accumulated Phase C candidate certified against the same byte tree r2 certified introduces no security regression on the inherited security frontier: both deleted hooks are proven advisory by their own source (fail-open commit hygiene; Write|Edit-only interception with an env opt-out and the barrier accounting as its documented backstop), every enforced control is byte-untouched except the guard-prologue integrity fast path, which is fail-closed by construction, sound over the hash-covered body, and tamper-test-pinned, the epoch-2 repair touches only test assertions and one generation list, and the full diff contains no secret, credential, or trust-surface exposure — zero findings, security certification granted.
certifier_kind: security
certifier_aggregation: sequence
certifier_gate_digest: 41f81fa44b9b7a888298e54fe32b6aa0ae6623f83ce2872cc764359432b06c8c
certifier_epoch_lineage_id: 9dd20b195b0efe673f16fe6a1264b0173ee3574c9ec6c49e344dbbc817cb3627
certifier_inherited_frontier_digest: 103c4d1707f6f85f1ebd2bd571f3311cfbaa8e8386dcca346f5229b6525b2394
certified_candidate_digest: 48619143aecb2ed96bdc2b9a0b0462bfdcf9f0ef42debcb075c60af99af8cd49
