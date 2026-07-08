evidence-binding: n3-adaptive 0c87449ed9c2

# n3-adaptive — durable node channel (#642) + per-role close contract (#643) + scheduler gate-count residuals (#644)

I READ both upstream evidence files (dogfooding the channel I built — I am the first consumer):
n1-architect blueprint (parent-worktree copy) and n2-validator (leg copy). Nonces below copied
from line 1 of each. Built on n2's completed validator work (parseNodeBriefs / nodeBriefsPresent /
PRODUCER_ROLES / IMPLEMENT_ROLES exports + the 8 registry rows).

upstream_read: n1-architect 416c5fde30b3
upstream_read: n2-validator b9f4c0b286d0

## RED → GREEN (failing-test-first)

RED: node scripts/test-adaptive-node.js — 13 failures, 1571 passed (pre-impl). Signatures: "V1: deriveDispatchChannel must be exported"; "V1-int: card goal_line is the impl brief, got undefined"; "V2-seed: impl seed carries an EMPTY `upstream_read: design` stub"; "V2: checkUpstreamConsumed must be exported"; "V2-neg1-close: close refuses upstream_not_consumed, got {\"result\":\"refuse\",\"reason\":\"barrier_failed\"}"; "V6: a code-architect with EMPTY seeded content tokens fails checkEvidenceShape, got {\"ok\":true}"; "A1-coopen-hold: serialDegradeReason is gate_live, got \"parent_dirty\""; "A1-merge-fence-hold: ... got {\"result\":\"refuse\",\"reason\":\"group_barrier_failed\"}"; "A2: tryR2bLeglessCoopen must be exported".
GREEN: node scripts/test-adaptive-node.js — exit 0, "adaptive-node tests passed (1596 assertions)", 0 FAIL. All V1/V2/V3/V6 + #644 A1/A2 pins now hold: goal_line byte-for-byte from a briefed fixture; upstream_evidence {node_id,role,path} project-qualified (no nonce); seed EMPTY upstream_read stub; consumed-proof happy/neg-1-missing (zero-mutation refuse before the barrier)/neg-2-stale/back-compat/producer→gate advisory; open envelope carries NO upstream nonce; V6 truncated producer evidence → evidence_shape_failed with the alternation + in-flight-exempt paths; A1 gate_live co-open-hold + merge-fence-hold + byte-identical serial fallback; A2 validation_test_consumes fork-widening refuses the legless co-open.
GREEN: node scripts/simulate-workflow-walkthrough.js — exit 0, "Workflow walkthrough simulation passed" (ROLE_TOKEN_REGISTRY expect mirror reconciled to n2's 8 new rows; brief→goal_line, upstream_evidence derivation, briefless back-compat, brief_unknown_node freeze refusal, resume re-hydration scenarios all pass).

## Implementation (canonical scripts/kaola-workflow-adaptive-node.js; ×4 via edition-sync)

- #642 channel: `deriveDispatchChannel(planContent, node, project)` → { goal_line? (brief verbatim), upstream_evidence? [{node_id, role, path}] from depends_on via qualifiedEvidenceFile — NEVER a nonce }. `buildDispatch` conditional-attach of `upstream_evidence` after the leg_branch block. Wired the ctx spread at ALL THREE opener call sites (runOpenNext, fused advance, runOpenReady per-member). Briefless/root envelopes stay byte-identical (conditional-attach pin held).
- #642 seed + record: `seedEvidenceFile` appends one EMPTY `upstream_read: <up-id>` stub per PRODUCER upstream when role ∈ IMPLEMENT_ROLES (both fresh + forceRotate paths, via new `upstreamReadStubIds`). `runRecordEvidence` re-injects missing required keys empty via new `reinjectMissingRequiredKeys` — SCOPED: generic-branch registry tokens (excludes tdd-guide/implementer/metric-optimizer/verdict-gate branches whose bare-name presence regex would false-satisfy) + upstream_read keys for IMPLEMENT consumers.
- #642 consumed-proof: new `checkUpstreamConsumed` + `readUpstreamEvidenceNonce` — recompute producer upstreams from the frozen depends_on, read upstream line-1 nonce, require a matching column-0 `upstream_read: <up-id> <nonce>`. HARD `upstream_not_consumed` (zero ledger mutation, placed after shapeCheck / before the barrier in BOTH close paths) for IMPLEMENT consumers; advisory (rides verdictWarn) otherwise. Exemptions: root, non-producer upstream, n/a upstream, key-absent back-compat. New `upstream_not_consumed` operator-hint entry. ANTI-FABRICATION: no opener/card/seed/envelope emits an upstream nonce (grep pin green).
- #643 close enforcement: generalized `checkEvidenceShape`'s else-branch to registry-driven token checks (present-key ⇒ non-empty; alternation ⇒ ANY alternative; non-empty fallback when no registry row / no keys). tdd-guide/implementer/metric-optimizer/main-session-gate branches UNTOUCHED.
- #644 A1: `liveReadsAtMerge` (closeGroupMember) counts kind:'gate'; relaxed write_awaits_drain else-branch adds `gate_live` hold (checked first); `tryR2bLeglessCoopen` top gate guard. #644 A2: threaded `parseValidationTestConsumes(planContent)` as `testConsumedExtra` into the `scratchObservableWriteSet` call.
- No issue refs / decision IDs in any new code comment (rule-only prose).

## Files changed (declared write set — all 6)

- scripts/kaola-workflow-adaptive-node.js (canonical)
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js (codex twin, edition-sync)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js (edition-sync)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js (edition-sync)
- scripts/test-adaptive-node.js (V1/V2/V3/V6 + A1/A2 pins appended)
- scripts/simulate-workflow-walkthrough.js (registry expect mirror + channel scenarios)

## Verification commands + exit codes

- node -c scripts/kaola-workflow-adaptive-node.js — syntax OK
- node scripts/test-adaptive-node.js — exit 0 (1596 assertions, 0 FAIL)
- node scripts/simulate-workflow-walkthrough.js — exit 0 ("Workflow walkthrough simulation passed")
- node scripts/edition-sync.js --write — 3 files updated (codex twin + gitlab/gitea ports)
- node scripts/edition-sync.js --check — exit 0 (10 forge ports, 24 COMMON_SCRIPTS mirrors, 27 byte-identical groups in parity)
- node -c on all 3 edition ports — OK
- git status --porcelain — exactly the 6 declared files, no stray artifacts
- Did NOT run the full four chains (gate's job).

## Notes / hand-off

- The `checkEvidenceShape` else generalization now also applies registry token checks to code-reviewer/security-reviewer/adversarial-verifier (they had no hardcoded branch — they fall through the else). Well-formed gate evidence (verdict: pass / findings_blocking: 0) passes (present + non-empty); DD-5 present-key gate keeps old in-flight evidence exempt. Confirmed green across the full suite + walkthrough gate-barrier scenarios.
- Re-injection excludes the seven bare-name/verdict branch roles from the generic content-token re-inject (empty RED:/verdict: would false-satisfy their presence regex); IMPLEMENT consumers still get their upstream_read keys re-injected (non-droppability).
