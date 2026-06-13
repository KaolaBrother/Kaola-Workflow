evidence-binding: n6-root-tests 36051accbb58

RED: missing feature tests in all 3 files — fixture exit 1 before any edits:
  RED: test-adaptive-node.js missing new feature tests: operator_hint, route-findings, --summary
  RED: test-commit-node.js missing operator_hint test (T-commit-hint)
  RED: test-parallel-batch.js missing operator_hint test (T-batch-hint)

GREEN: feature tests present and all assertions passing after edits — fixture exit 0:
  GREEN: all feature tests present; 743 adaptive-node assertions green, 92 commit-node assertions green, 220 parallel-batch assertions green

test-adaptive-node: PASSED (743 assertions)
test-commit-node: PASSED (92 assertions)
test-parallel-batch: PASSED (220 assertions)
walkthrough: PASSED (simulate-workflow-walkthrough.js exit 0)
