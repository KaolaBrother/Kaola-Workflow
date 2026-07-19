# Finalization Summary — issue-725 Phase B (receipt diet, PARTIAL close)

Phase B of epic #725 shipped as feature commit `d4bf9e65` on `workflow/issue-725` (9 files,
+2167/−304: the run-chains four-edition family + three test surfaces + CLAUDE.md/CHANGELOG).
Epic #725 stays OPEN — Phases C–E continue in later runs. #718 untouched (closes with Phase D).

## Run Shape

- Epoch 1 (plan `3628c722…`, 4 nodes): n1-receipt-diet (B0 per-step timings, B1 diff-scoped
  chains, B2 hoisted preamble, B3 concurrent forge chains kept) → n2-docs → n3-code-review
  (fable) verdict FAIL with 2 blocking findings (R1 diff-scope classifier false-green on root
  cross-edition read surfaces; R2 per-chain timeout applied per-step) + R3 (the ≥50% cut
  shortfall, deferred per the recorded USER DECISION `.cache/acb-decision.md` — B0's
  instrument-first measurement proved the claude chain is ~80% of the all-four cost, capping
  B0–B3's common-case cut at ~20%; the target is re-attributed to Phase E).
- repair-node → `repair_requires_replan` (producer slice spans n1+n2) → claim-preserving
  repair→replan transaction (`7cf1be80…`) → epoch 2 (child plan `d39f89af…`, 3 nodes):
  c1-scope-timeout-fix (R1 class-closure + R2 per-chain budget, RED-first) → c2-code-review
  (fable, APPROVED, 0 blocking, certified_candidate_digest `158b43a6…`) → c3-finalize (this
  sink, main-session-direct). Parent epoch snapshotted at `.cache/epochs/1/`; epoch ceiling (2)
  reached.

## Final Validation Evidence

- Sink chain receipt `.cache/chain-receipt.json`: `KAOLA_RUN_CHAINS_CONCURRENCY=serial`, headSha
  `d4bf9e65`, workTreeHash clean, codeTreeHash `158b43a6…` — byte-match to the fable certifier's
  `certified_candidate_digest`. All four chains exit 0 first attempt (claude 778s, codex 19s,
  gitlab 95s, gitea 94s). The receipt's new `scope` block records `decision: all-four,
  reason: edition_coupling` — the B1 diff-scoping self-selected all four chains on this run's
  own edition-touching diff (live end-to-end self-test of the shipped feature, including the R1
  fix recognizing CLAUDE.md as a root read surface). 5 preamble steps hoisted run-once.
- `--finalize-check`: the child-plan-only attribution sweep is the KNOWN, FILED #724 gap on a
  multi-epoch candidate; the lineage-union equivalent was re-run mechanically (child + epoch-1
  snapshot plans, same merge-base diff): **9/9 writes attributed, synthesized whole-plan
  barrierCheck pass, zero sensitive/foreign hits** — evidence `.cache/finalize-lineage-barrier.md`.
  Finalize completed through the scratchpad-patched validator/claim copies (#724 expected
  behavior + the #737 authored-digest equivalence); no repo file mutated.

## Run gaps

| Gap | Disposition |
|---|---|
| AC-B ≥50% common-case cut unmet by design ceiling (claude chain ~80% of cost; ~20% measured, honest) | USER DECISION 2026-07-19: re-attributed to Phase E of #725; citation `.cache/acb-decision.md`; carried by fable-gate prose + CHANGELOG |
| replan resume wedges at `child_frozen` on an unfrozen-attested child (authored-vs-frozen digest drift, 3 verifier sites) | filed: #737 (workaround: patched-copy authored-equivalence, no repo/journal mutation) |
| reviewer identity-token format undiscoverable (literal vs digest) + refuse envelope drops the `field` key | folded into #728 (comment 5016615684) |
| finding_json finding-anchor-v1 shape undiscoverable at dispatch | folded into #728 (comment 5016615684) |
| deferred-finding vs approved-verdict settlement collision (`review_approval_has_findings`) | folded into #728 (comment 5016615684) |
| schema-2 freeze omits compliance pre-seed + review-failed fold leaves task mirror stale | known #719 (workaround re-applied verbatim) |
| replan prepare candidate-digest false positive + legacy receipt-field read | known #720/#734 (patched-copy workarounds re-applied) |
| epoch activation lacks review-journal rotation | known #722 (workaround re-applied; parent journal digest-preserved in snapshot) |
| partial-close `workflow:in-progress` label blocks the NEXT phase's claim (classifier reads it as a remote claim, no override) | papercut recorded in memory + here; label deliberately NOT restored this time — the Phase-C claim re-adds it on acquire |

## Partial-Close Contract

- Issue #725: kept OPEN (`--keep-open`), roadmap source kept, label NOT restored (deliberate —
  see gap table). Next: Phase C (guard dedup) in a fresh adaptive run.
- #718 and all other issues untouched.

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: missing
ATTESTATION WARNING: no contractor dispatch found in dispatch-log — finalize seam may have been run inline by main session
(expected: the frozen plan marks c3-finalize non-delegable `main-session-direct`; the c3 evidence records `main-session-direct`.)
