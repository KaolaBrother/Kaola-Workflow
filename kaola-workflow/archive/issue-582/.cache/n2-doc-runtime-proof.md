evidence-binding: n2-doc-runtime-proof d9f3af044ef2
Documentation evidence:
- Updated `docs/api.md` per-node model-tier contract: a non-null Codex tier is dispatchable only after a fresh child-session proof for the exact requested effort verifies child JSONL `turn_context.effort`; V2 feature/config/descriptor text is not proof; both V2 and V1 refuse with `codex_effort_override_unavailable` when proof is absent/stale/failing.
- Added `docs/decisions/D-582-02.md` documenting the 2026-07-01 installed-runtime refutation: V2 high probes recorded `xhigh`, including an explicit-model high probe, so V2 identity is not effort proof.

Validation:
- `node scripts/validate-workflow-contracts.js` -> passed.
- `node scripts/validate-kaola-workflow-contracts.js` -> passed.
- `node scripts/test-route-reachability.js` -> passed (185 assertions).
- `git diff --check` -> passed.
