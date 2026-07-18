# Documentation Docking — bundle-713-714

## Changed code/config/test/workflow files reviewed

- scripts/kaola-workflow-adaptive-node.js + plugins/kaola-workflow{,-gitlab,-gitea}/scripts/kaola-(gitlab-|gitea-)workflow-adaptive-node.js — #713 fold-marker recording (runRepairNodeCore step 4a) + fold-boundary convergence (assessReviewProgress) + journal fold wall; #714 canonical `role (node-id)` compliance emission on the append path (addCloseCompliance)
- scripts/kaola-workflow-adaptive-schema.js + the three byte-identical plugin mirrors — #713 deriveRepairDelta marker synthesis (fail-closed sealed-partition cross-check) + verbatim review_repair_delta_unavailable recovery detail; #714 spliceComplianceSection boundary normalization
- scripts/test-adaptive-node.js — RED-first regression fixtures (2479 assertions; #713 E2E wedge/reopen pin + #714 round-trip emission battery)
- CHANGELOG.md, docs/plan-run-cards/reopen-complete-node.md — the documentation delta itself (n2)
- kaola-workflow/bundle-713-714/** — workflow state (validation-invisible)

## Documents checked

- CHANGELOG.md — one [Unreleased] ### Fixed bullet covering both fixes: MATCHES the diff (fold marker + delta synthesis + recovery detail for #713; canonical emission + splice normalization, validator NOT relaxed, for #714)
- docs/plan-run-cards/reopen-complete-node.md — new section 7 documents the exact shipped marker shape (4 keys, contract-2 settled-PASS journal attempts only), the synthesis path, tamper fail-closedness, and quotes the shipped refusal detail VERBATIM (n2 verified byte-for-byte against deriveRepairDelta; n3 re-verified): MATCHES the diff
- README.md — no feature/usage/env change in the diff: no-impact, skipped
- docs/api.md — no runtime/preflight contract change: no-impact, skipped
- docs/architecture.md — no structure change: no-impact, skipped
- .env.example — no new env vars: no-impact, skipped
- Inline comments — edit-site comments updated with the fix hunks (verified in n3 certifier pass)
- Issue comments — posted by the sink at closure (Step 9), not a pre-commit document

## Gaps found and fixed

None. (n2's docs delta was verified line-by-line against the code by the n3 certifier and the n4 adversarial gate; both zero findings.)

## Explicit no-impact reasons

- README/api/architecture/.env.example: internal repair-lifecycle and compliance-emission producer fixes only — no public surface, setup, architecture, or env change.

final verdict: DOCKED
