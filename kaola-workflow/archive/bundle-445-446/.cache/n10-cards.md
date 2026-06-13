evidence-binding: n10-cards 53719459eac4

non_tdd_reason: reference card authoring — no natural failing unit test; docs only

regression-green: walkthrough PASSED (exit 0, "Workflow walkthrough simulation passed"); route-reachability PASSED (exit 0, 44 assertions)

cards created: docs/plan-run-cards/{README.md, resume.md, governance.md, repair-routing.md, reopen-complete-node.md, frontier-batch.md}

verification_commands:
  node scripts/simulate-workflow-walkthrough.js 2>&1 | tail -5   # exit 0
  node scripts/test-route-reachability.js 2>&1 | tail -5         # exit 0, 44 assertions

before_result: "Workflow walkthrough simulation passed" (exit 0) — baseline clean before any writes
after_result:  "Workflow walkthrough simulation passed" (exit 0) + "Route-reachability test passed (44 assertions)" (exit 0)
