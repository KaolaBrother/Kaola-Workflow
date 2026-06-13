evidence-binding: n4-wire-test-chain c373080805f7
implementer wired scripts/test-release.js into the test:kaola-workflow:claude &&-chain, inserted immediately after test-release-surface-drift.js (adjacent to ledger-compare).
non_tdd_reason: package.json &&-chain wiring is config/glue, no natural failing unit test.
smoke-integration: full chain GREEN. npm run test:kaola-workflow:claude exit 0; output shows 'Release-surface drift regression passed (9 assertions)' -> 'test-release: all 34 assertions passed' -> 'Ledger-compare guard regression passed (18 assertions)' ... ending 'Workflow walkthrough simulation passed'. JSON.parse(package.json) exit 0.
Scope: git status shows package.json modified by this node (validate-script-sync.js + edition ports are prior-node artifacts, pre-baseline for n4). Only the claude chain touched; codex/gitlab/gitea chains intentionally unchanged.
