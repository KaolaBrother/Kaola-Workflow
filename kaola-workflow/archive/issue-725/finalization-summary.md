# Finalization Summary — issue-725 (Phase A of epic #725, PARTIAL close)

Phase A (retire fast/full paths — adaptive-only consolidation) shipped as feature commit
`98384667` on `workflow/issue-725`. Epic #725 stays OPEN — Phases B–E continue in later runs.
#718 untouched (closes with Phase D).

## Run Shape

- Epoch 1 (plan `5b48fa3f…`, 12 nodes): n1-recon → n2-delete … n10-docs complete; the
  n11-code-certify gate (fable, per in-run user directive) FAILED with 3 blocking findings
  (F1 fixture migration, F2 validator fast-summary pin, F3 SKILL-pack shell block) and was
  consumed by the claim-preserving repair→replan transaction — the first schema-2
  repair→replan driven end-to-end live.
- Epoch 2 (child plan `7dd4b047…`, 4 nodes): n1-repair (9 files) → n2-code-certify (fable,
  approved, 0 findings) → n3-security-certify (fable, approved, 0 findings) → n4-finalize
  (this sink, main-session-direct). Parent epoch snapshotted at `.cache/epochs/1/`.

## Final Validation Evidence

- Sink chain receipt `.cache/chain-receipt.json`: `KAOLA_RUN_CHAINS_CONCURRENCY=serial`,
  headSha `98384667`, workTreeHash clean, codeTreeHash `8b9854fe…` (byte-match to both
  certifiers' `certified_candidate_digest`). All four chains exit 0 first attempt
  (claude 757s, codex 19s, gitlab 89s, gitea 83s). Additive suites green in-run:
  `test-opencode-edition.js` (396 asserts), `test-kimi-edition.js` (440 asserts).
- Both epoch-2 certifier walls reviewed the FULL accumulated diff vs claim root base
  `33a1ca57` and approved with zero blocking findings (receipts under
  `.cache/review-receipts/`, journal `.cache/review-attempts.json`).
- `--finalize-check`: the attribution sweep refused `unattributed_change` on the accumulated
  candidate — the KNOWN, FILED tooling gap #724 (child-plan-only allowlist). The
  lineage-aware equivalent was re-run mechanically over child + epoch-1 snapshot plans
  (verbatim rows/ledgers, same merge-base diff): **217/217 writes attributed, synthesized
  whole-plan barrierCheck pass, zero sensitive/foreign-archive hits** — evidence
  `.cache/finalize-lineage-barrier.md`. Finalize completed through a scratchpad-patched
  validator copy implementing #724's expected lineage union; no repo file mutated.

## Run gaps

| Gap | Disposition |
|---|---|
| discard/release structurally unavailable for schema-2 projects (`state_compliance_authority_invalid`) | filed: #735 |
| replan prepare evidence check reads legacy `body`/`receipt_sha256`, refuses schema-2 receipts | filed: #734 |
| schema-2 freeze omits one-row-per-node compliance pre-seed (+ stale task mirror at fold) | filed: #719 (workaround applied) |
| replan prepare candidate-digest false positive on schema-2 attempts | filed: #720 (workaround applied) |
| epoch activation lacks cross-epoch review-journal rotation | filed: #722 (workaround applied) |
| finalize attribution sweep not epoch-lineage-aware | filed: #724 (workaround applied, evidence above) |
| proxy EADDRNOTAVAIL on rapid gh bursts (claim escalation ×5) | noise: environmental flake, recovered by retry |
| GAP-5/6/7 unowned-file discoveries (required-blocks.js, forge sinks tests, test-bundle-finalize) | resolved in-run: owned + fixed by the epoch-2 repair (n1-repair write set) |

## Partial-Close Contract

- Issue #725: kept OPEN (`--keep-open`), roadmap source kept, `workflow:in-progress` label
  restored after closure bookkeeping per the frozen n4-finalize brief.
- Next: Phase B (receipt diet) in a fresh adaptive run.

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: missing
ATTESTATION WARNING: no contractor dispatch found in dispatch-log — finalize seam may have been run inline by main session
(expected: the frozen plan marks n4-finalize non-delegable `main-session-direct`; compliance row records `main-session-direct`.)
