evidence-binding: n2-classifier-fix 2630a2c3a14f
<!-- RED: paste RED here -->
RED: test_507_b2a — FAIL: #507(b2-a): persistent transient gh-fetch → verdict:indeterminate (got {"verdict":"target_unavailable","reasoning":"gh issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1"}); counter=1 (expected >=3); also FAIL: b2-c transient→success (counter=1, not retried) — 5 failures, 65 passed (pre-impl)
<!-- GREEN: paste GREEN here -->
GREEN: test_507_b2a passes — verdict:indeterminate + reasoning_class:classifier_error + counter>=3; test_507_b2b target_unavailable + counter===1 (not retried); test_507_b2c green + counter>=2; 70/70 claim-hardening assertions green; all 4 chains (claude/codex/gitlab/gitea) green
