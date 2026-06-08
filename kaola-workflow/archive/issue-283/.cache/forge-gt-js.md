# forge-gt-js (implementer) — issue-283
non_tdd_reason: gitea edition behavior port mirroring base/gitlab, no behavioral logic distinct from base.
regression-green: node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js -> exit 0. simulate-gitea-workflow-walkthrough.js: all 8 in-process tests PASS; exit 1 ONLY from shelled test-gitea-workflow-scripts.js (forge-gt-rest file, line 1829 "happy path must still route to Phase 6") = expected-intermediate.
Files: kaola-gitea-workflow-{repair-state (finalization route + one-way migration + finalization-summary reader, phase6-summary reader deleted), sink-pr, sink-merge, compact-context}.js; simulate-gitea-workflow-walkthrough.js (new finalization tests); test-gitea-sinks.js (phase6-summary->finalization-summary).
HANDOFF -> forge-gt-rest: test-gitea-workflow-scripts.js:1829 asserts result.phase===6 -> flip to stage==="finalization"/next_command /kaola-workflow-finalize; flip the gitea contract validator + gitea skills.
