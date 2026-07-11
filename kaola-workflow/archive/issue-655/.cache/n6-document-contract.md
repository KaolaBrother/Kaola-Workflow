evidence-binding: n6-document-contract db7134d657cb
docs_updated: pass

# Documentation contract — frozen wait-budget override

## Documentation updated

- `docs/plan-run-cards/join-protocol.md` §1: documented tier/role defaults, optional frozen
  `wait_budget_minutes`, `planner_override`, evidence-grounded authoring, effective 20/40-minute
  floors through the 720-minute cap, nondelegable and optimizer-conflict restrictions, and the
  no-interrupt/no-re-nudge-floor semantics. Expiry still enters the existing three-rung escalation
  ladder and never supplies a timeout, verdict, or partial-evidence waiver.
- `docs/api.md` adaptive validator/next-action/dispatch sections: documented the optional Nodes
  column, strict base-10 validation and five typed reasons, effective role/model resolution, the
  old-frozen point-of-use compatibility wall, optional validator-shaped/next-action field, the
  four-value dispatch-source union, all three openers, durable running-set/top-up/reconcile
  propagation, and byte-compatible absence.
- `docs/workflow-state-contract.md` durable sources/running-set sections: documented full Nodes
  hash coverage for the optional header/cells, durable override/source members, crash redispatch,
  stable/opening capacity accounting, capped-out ledger reset, survivor preservation, and the
  running-set/ledger consistency requirement.
- `docs/conventions.md` join/testing sections: documented concrete-duration evidence discipline,
  authored-plan lifecycle and boundary coverage, generated cross-edition propagation expectations,
  legacy byte-compatibility controls, and the sequential four-chain acceptance obligation.

## Grounded sources

- `scripts/kaola-workflow-adaptive-schema.js:166-191`: defaults 40/20/20, sources
  `planner_model`/`role_default`, and cap 720.
- `scripts/kaola-workflow-plan-validator.js:596-667`: header-indexed optional field, strict integer
  validation, effective model resolution, typed reasons `wait_budget_noninteger`,
  `wait_budget_below_floor`, `wait_budget_above_cap`, `wait_budget_nondelegable`,
  `wait_budget_conflict`, and accepted source `planner_override`.
- `scripts/kaola-workflow-next-action.js:87-115`: current point-of-use validation and conditional
  descriptor projection.
- `scripts/kaola-workflow-adaptive-node.js:1285-1355`: single `buildDispatch(nodeInfo, context)`
  convergence point, defensive validation, and `planner_override` emission.
- Final n1/n2/n3/n4/n5 evidence: authored-plan opener coverage, old-frozen activation controls,
  exact mixed stable/opening reconcile, generated routing parity, no-override full-object
  compatibility, and final review/adversarial pass receipts.

## Validation

- `node scripts/simulate-workflow-walkthrough.js --only testAdaptiveValidatorGovernance --only testMetricOptimizerContract` — PASS, 2 scenarios.
- `node scripts/test-next-action.js` — PASS, 116 assertions.
- `node scripts/test-adaptive-node.js` — PASS, 1709 assertions; printed EISDIR stacks are expected
  fail-closed negative fixtures and the process exited 0.
- `node scripts/generate-routing-surfaces.js --check` — PASS, all 12 surfaces byte-match.
- `TMPDIR="${TMPDIR:-/tmp}" node scripts/test-agent-profile-parity.js` — PASS, 73 assertions.
- `TMPDIR="${TMPDIR:-/tmp}" node scripts/test-route-reachability.js` — PASS, 459 assertions.
- `git diff --check` — PASS.
- Exact sequential acceptance command:
  `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` — PASS, exit 0.

## Residual documentation risk

Low. The docs transcribe verified source contracts and tested lifecycle behavior without adding a
new signature or example envelope. The existing API file is large and historical, so future changes
to the shared validator or dispatch builder must keep the Nodes grammar, source union, and durable
running-set prose synchronized. No code, tests, routes, profiles, CHANGELOG, workflow state, plan,
or ledger file was edited by this node.
