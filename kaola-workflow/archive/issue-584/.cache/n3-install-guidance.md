evidence-binding: n3-install-guidance 7ebac628acc9

Docs updated:
- README Codex install/update guidance now separates profile installation, config audit, warning suppression, installed-cache freshness, and child-session effort proof.
- Codex init skills and command init surfaces now require an agent-guided config audit and explicit user authorization before global Codex config edits.
- Added docs/decisions/D-584-01.md for the read-only-by-default config readiness boundary.

Validation:
- node scripts/validate-kaola-workflow-contracts.js -> passed
- node scripts/validate-workflow-contracts.js -> passed
- rg provenance scan over init command/skill surfaces -> no issue or decision provenance tokens found

Deferred repair:
- git diff --check found trailing whitespace in n1-owned test files; this will be repaired by reopening n1 after non-gate docs/finalize nodes are no longer in progress.
