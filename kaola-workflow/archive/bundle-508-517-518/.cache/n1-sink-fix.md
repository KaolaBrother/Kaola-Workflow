evidence-binding: n1-sink-fix e87a3544c370
<!-- RED: paste RED here -->
RED: test_stale_cycle_identity — pre-fix: loadOrInitReceipt resumes stale all-done receipt (no branch_head guard), #484 FRESHNESS GUARD fires stale_sink_receipt, merge never ran (pre-impl); test_keepopen_no_reopen_after_autoclose — pre-fix: post-push_main, issue CLOSED by GitHub auto-close keyword, no reopen attempted, status:sinked with issue silently left CLOSED (pre-impl)
<!-- GREEN: paste GREEN here -->
GREEN: test_stale_cycle_identity passes — stale receipt (no branch_head / mismatched branch_head) reinits via newCycle:true + deferred preflight-write, merge runs fresh, status:sinked; test_keepopen_no_reopen_after_autoclose passes — reopen executed post-push_main, receipt.remote_issue_closed=reopened_after_autoclose; forge tests (test-gitlab-sinks.js + test-gitea-sinks.js) ALL PASS; diff canonical↔codex-twin empty (BYTE-IDENTICAL); 5/5 $TMPDIR harness assertions green
