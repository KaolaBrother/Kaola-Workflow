evidence-binding: n3-init c38eed02b83c
<!-- non_tdd_reason: init-template prose default-flip — no natural failing-unit-test; the runtime assertions live in the contract validators handled by the coupled node n4 -->
non_tdd_reason: init-template prose default-flip — scaffolding-only prose change (Step 5 reframe + "Codex hooks note" rewrite) with no behavioral logic to unit-test; the contract-validator regression locks that enforce the new prose belong to n4.
<!-- regression-green|build-green|smoke-integration -->
regression-green: node scripts/simulate-workflow-walkthrough.js → exit 0, "Workflow walkthrough simulation passed"; node scripts/validate-script-sync.js → exit 0 OK; all three contract validators passed (codex, gitlab, gitea).
