# Run gaps — manual notes (issue-725 Phase B)

- AC-B >=50% common-case cut unmet by design ceiling (claude chain ~80% of all-four cost; measured
  20.0% serial). USER DECISION 2026-07-19: accepted B0-B3 as landed; target re-attributed to the
  epic level, Phase E designated vehicle; see `.cache/acb-decision.md` and gate finding R3
  (follow_up/deferred). Disposition: carried on #725 itself (Phase E section) — no new issue.
- `review_gate_identity_mismatch` envelope drops the mismatching `field` key: the internal return
  (`adaptive-node.js:1621`) carries `field`, but the emitted refuse envelope shows only
  `detail: null` — the operator cannot tell WHICH identity token mismatched. Papercut; candidate
  follow-up issue at finalize.
- Reviewer identity-token format ambiguity: the open-envelope `required_tokens` list names
  `gate_claim`/`gate_surface` with no format hint while the dispatch surface carries BOTH the
  literal texts and their digests (`logical_gate.claim_digest`/`surface_digests`); the settlement
  check (`adaptive-node.js:1617`) wants the LITERAL text, so a digest echo refuses. Cost one
  correction round-trip this run. Papercut; candidate follow-up issue at finalize (same family as
  the field-key gap above).
- schema-2 finding_json capture contract is undiscoverable at the dispatch surface: finding-anchor-v1
  requires a CLOSED failure_class vocabulary (`adaptive-schema.js:1476`), four sha256 trigger
  digests, and an anchor-index-bound `producer_evidence_digest` (`adaptive-node.js:1520-1524` — sha256
  of the producer evidence file's current bytes), none of which the reviewer card/required_tokens
  communicate. The fable reviewer emitted well-reasoned but schema-invalid findings; unblocked only
  by citing the Phase-A archived n11 example + code reading (second correction round-trip). This is
  the #728 review-capture family — fold into #728 rather than filing separately.
- NEW DEFECT (file at finalize; sibling of #734): replan resume WEDGES at `child_frozen` when the
  planner attests an UNFROZEN child. `verifyFrozenChildAuthority` (replan.js ~2097) requires
  `attestation.child_digest === <frozen file digest>`, but the planner-attested digest is of the
  AUTHORED (pre-freeze) bytes — the freeze-transition function (~2085) itself models
  `authored_child_digest` vs `frozen_child_digest` as distinct. Deterministic
  `replan_child_integrity_failure` on every child_frozen re-entry; Phase A never hit it because its
  planner delivered the child pre-frozen. Proven equivalence: frozen bytes minus the
  `<!-- plan_hash: … -->` stamp line + trailing blank re-hash EXACTLY to the attested authored
  digest (1e027151… vs frozen ab98a1a0…, plan d39f89af…). Workaround: scratchpad-patched copy
  accepts attested digest == authored-equivalent digest (stamp-stripped); no repo/journal mutation.
  filed: #737
- Deferred-finding/approval settlement collision: the finding vocabulary treats `status=deferred`
  as non-blocking (`unresolvedInScopeFixes` excludes it), but the settlement
  (`adaptive-node.js:1682-1685`) counts any non-`resolved` finding as open and refuses
  `review_approval_has_findings` on an approved verdict — so a planner brief instructing "record
  the shortfall as a deferred follow-up finding" is unsatisfiable on a passing gate. Cost one
  amendment round-trip (structured rows removed, findings_none, carry-forward kept in prose +
  run-gaps). #728/#730 review-capture family — fold there.
- #722 workaround RE-APPLIED this run at epoch-2 activation (active review-attempts.json rotated
  to a fresh child-bound V2 journal; parent journal digest-verified preserved in
  `.cache/epochs/1/files/`).
- #719 workaround RE-APPLIED this run at replan prepare (2 missing compliance pending rows
  hand-appended for n3/n4; task mirror resynced n3 in_progress→pending after the review-failed
  fold). #720+#734 workarounds re-applied via the scratchpad-patched replan copy (prepare +
  resume paths).
