evidence-binding: n7-documentation c5f11e42db9c
docs_updated: README.md, CHANGELOG.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/agents-source.md, docs/conventions.md, docs/opencode-edition.md, docs/decisions/D-693-01.md, docs/decisions/D-696-01.md, docs/decisions/D-697-01.md, docs/decisions/D-698-01.md
upstream_read: n1-architecture ea05782ab1d5
upstream_read: n2-profile-contracts ca71dbdf270d
upstream_read: n3-validation-runner 7eb9cc90efb9
upstream_read: n4-review-engine 01af83fb4cdf
upstream_read: n5-runtime-guidance 68ac15fe7117
upstream_read: n6-installed-contract-proof e4f670abbcf7

delegation_outcome: completed
role: doc-updater
assigned_task: Reconcile public documentation and add ADRs for issues #693, #696, #697, and #698 after implementation and installed-contract proof.
documentation_boundary: Documentation-only changes in the assigned twelve files; no code, test, runtime, generated-profile, or installed-state writes.

contract_documented:
- #693: one forward-reachability deriveGateMode authority, investigation versus change-gate lifecycle, and independent execution_status/domain_outcome/gate_effect axes.
- #696: strict canonical reviewer behavior and closed adapters, sole-writer generation, normalized behavior and resolved-profile hashes, OpenCode identity, installed-byte checks, and honest stochastic/runtime-loader proof boundaries.
- #697: schema-2 refinement of D-547-01's single validation_command namespace, exact contract-1 compatibility mapping, bounded deterministic local runner, secret-safe identity, reduction, vector/receipt hashes, and local qualification boundary.
- #698: explicit plan/dispatch/journal contract 2, runtime-neutral contexts, runtime-specific profile binding, normalized receipts, immutable anchor-derived finding UIDs, closure progress, declared reducers, G4 common certifiers, inherited-frontier virtual producers, and typed replan_required handoff with #699 epoch activation excluded.
- Codex doctor/install: repository, user, project, and discovered plugin-cache scopes; plugin-cache byte drift is read-only but gate-affecting; manifests carry reviewer identities; proof is filesystem identity only.

files_changed:
- README.md
- CHANGELOG.md
- docs/api.md
- docs/architecture.md
- docs/workflow-state-contract.md
- docs/agents-source.md
- docs/conventions.md
- docs/opencode-edition.md
- docs/decisions/D-693-01.md
- docs/decisions/D-696-01.md
- docs/decisions/D-697-01.md
- docs/decisions/D-698-01.md

validation_commands:
- `git diff --check -- README.md CHANGELOG.md docs/api.md docs/architecture.md docs/workflow-state-contract.md docs/agents-source.md docs/conventions.md docs/opencode-edition.md docs/decisions/D-693-01.md docs/decisions/D-696-01.md docs/decisions/D-697-01.md docs/decisions/D-698-01.md` -> exit 0
- Node UTF-8/newline/trailing-whitespace check over the four new ADR files -> exit 0; new ADR whitespace check passed.
- `node scripts/generate-reviewer-profiles.js --check` -> exit 0; Reviewer profile generation check passed.
- `node scripts/generate-routing-surfaces.js --check` -> exit 0; all 12 surfaces byte-match the skeleton.
- `node scripts/test-agent-profile-parity.js` -> exit 0; 275 assertions passed.
- `node scripts/validate-vendored-agents.js` -> exit 0; 16 agents validated at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1.
- `node scripts/test-route-reachability.js` -> exit 0; 1400 assertions passed.
- `node scripts/validate-workflow-contracts.js` -> exit 0; Workflow contract validation passed.
- `node scripts/validate-kaola-workflow-contracts.js` -> exit 0; Kaola-Workflow Codex contract validation passed.
- `node scripts/test-opencode-edition.js` -> exit 0; 525 assertions passed.

remaining_risks:
- The full package validation chain was intentionally not run in this documentation node; downstream integrated validation owns that broader gate.
- Filesystem/source/install identity cannot attest proprietary runtime prompt loading or deterministic natural-language model output; the documentation states this limit explicitly.
