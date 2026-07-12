evidence-binding: n5-finalize 08f50e469896

## sink
role: finalize (main-session-direct). Merge-sink for #668.
Three test/doc hygiene items landed: n1 (test-adaptive-node.js vacuous #434-b assertion → observes runRepairNode output), n2 (docs/conventions.md + docs/api.md release-receipt disposal sentence + CHANGELOG [Unreleased] entry), n3 (gitlab test wired stderr-leak assertion). CHANGELOG was written by n2 pre-receipt (validation-visible). No writes on the sink.

## four_chain
Cross-edition diff (item 3 touches plugins/kaola-workflow-gitlab/). Finalization runs all four npm chains SERIALLY (KAOLA_RUN_CHAINS_CONCURRENCY=serial, audit-#666 SIGKILL guard on the ~848KB test-adaptive-node.js claude chain) before the sink; each chain must be CLOSED green, not exit-0-short-circuited.

## run_gaps
None. Clean first-pass review (verdict pass, findings_blocking 0). The pre-existing #437-lane EISDIR noise in test-adaptive-node.js is already filed as #671 (not introduced here).
