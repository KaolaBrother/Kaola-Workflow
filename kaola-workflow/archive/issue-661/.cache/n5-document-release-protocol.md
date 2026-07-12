evidence-binding: n5-document-release-protocol b7087290077d
<!-- docs_updated: paste docs_updated here -->
docs_updated: README.md; docs/conventions.md; docs/api.md; docs/decisions/D-661-01.md; docs/README.md
upstream_read: n2-review-release-contract ba138909f8a3

# Documentation docking result

## Upstream evidence consumed

- Read `n1-split-release-transaction` binding `df5b5eb5c8ba`, including the final R1-R8 implementation and validation history.
- Read and bound the required approved review `n2-review-release-contract` nonce `ba138909f8a3`; verdict pass, findings_blocking 0.
- Read `n3-adversarial-prepare-receipt` binding `c6b3a463ad3e`. Its prepare result is described only as main-session executable fallback evidence because the artifact records `transport_fallback: local-fallback-transport-filter`; it is not labeled an independent adversarial success.
- Read `n4-adversarial-tag-binding` binding `1cde4f1a1e9e`; its independent 90-check disposable-repository matrix and raw tag-tree verification support the documented tag-binding claims.

## Documentation changes

- `README.md`: replaced the obsolete verify/cut/manual-tag checklist with the executable prepare → exact release-only commit → offline all-edition receipt → plan-independent `--release-check` → checked `--tag` → post-tag validation → named-tag push/publish sequence. Removed tag-repoint guidance that would bypass the candidate binding.
- `docs/conventions.md`: documented the typed prepare/tag state machine, exact eight-file allowlist, independent root/Claude and Codex SemVer axes, coherent version-scoped preparation and publication receipts, crash-resume/idempotency boundaries, one-commit candidate provenance, refusal-only `--cut`, fail-closed Git probes, atomic tag creation/rollback, exact candidate-SHA/chain/tag binding, and raw tag-tree verification. Kept `--release-check` separate and plan-independent; stated that no external pipeline is part of the gate.
- `docs/api.md`: documented release CLI flags and mode-specific success fields, stable refusal envelope extensions, `cut_compatibility_refusal`, and the mandatory relationship to the existing `--release-check` API. Structured fields were transcribed from `scripts/kaola-workflow-release.js` and the existing `--release-check` section.
- `docs/decisions/D-661-01.md`: recorded why preparation and publication are distinct trust transitions, why exact HEAD/receipt/publication/tag-tree agreement is required, and why legacy cut cannot retain success semantics.
- `docs/README.md`: indexed D-661-01.

## Checks

- `node scripts/test-release.js` — exit 0: `test-release: all 232 assertions passed`.
- `node scripts/validate-workflow-contracts.js` — exit 0: `Workflow contract validation passed`.
- `node scripts/validate-kaola-workflow-contracts.js` — exit 0: `Kaola-Workflow Codex contract validation passed`.
- Owned-document relative-link checker over README, conventions, API, docs index, and D-661-01 — exit 0: `Owned documentation relative links passed`.
- `git diff --check` — exit 0.

## Remaining documentation risks

- D-442-01 remains historical and describes the superseded successful one-step cut contract; D-661-01 and the live README/conventions/API explicitly replace that operational guidance. No change was made to the historical record.
- No architecture, environment-variable, or setup document requires an update: the change is confined to the maintainer release transaction and its public CLI/workflow contract.
