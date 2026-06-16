evidence-binding: n3-prose-wire 229f3e139d15
non_tdd_reason: doc/prose wiring — six plan-run surfaces + new L3 card + route-reachability pins; no natural failing unit test exists for documentation propagation.
regression-green: node scripts/test-route-reachability.js → 122 assertions passed (was 98 baseline; +24 from T8+T9, 6 surfaces x 2 pins x 2 asserts each); node scripts/simulate-workflow-walkthrough.js → exit 0 "Workflow walkthrough simulation passed"
