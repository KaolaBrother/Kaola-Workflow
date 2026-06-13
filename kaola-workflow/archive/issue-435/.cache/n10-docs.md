evidence-binding: n10-docs 9f558bbdce44

doc-updater authored D-435-01 + docs (read n1-design.md + scripts/kaola-workflow-gap-sweep.js for accuracy — no fabricated fields).

- docs/decisions/D-435-01.md (NEW): mirrors D-432-01 (Date 2026-06-13, Status Accepted, Issue #435, Related, Context, Decision, Consequences). 8-section Decision: anti-fabrication reason classes (in_run_repair/deferred_red_chain/manual), scanner result:swept, ## Run gaps grammar (filed:#N / noise:<text>), gaps_unswept gate, Step 8c.2 wiring (NO cmdFinalize edit, mirrors #432), cross-edition registration, goal-prose rule, dogfooded on this run. (grep: 8 key-section matches.)
- docs/conventions.md: new "## Run-gap capture is gated at finalize (#435)" section after the chain-receipt #432 section, matching its style.
- docs/architecture.md: run-gap sweep gate paragraph after the chain-receipt paragraph (self-contained CLI, contractor-owned, no cmdFinalize coupling).
- CHANGELOG.md: [Unreleased] ### Added #435 entry (×4 editions, Step 8c.2, 6 finalize + 6 router surfaces, COMMON_SCRIPTS + manifest + forge-validator registration, test-gap-sweep.js in claude chain, dogfooded, all four chains green).

Scope: only the 4 declared files (CHANGELOG.md, docs/architecture.md, docs/conventions.md, docs/decisions/D-435-01.md). docs/api.md + README.md untouched (out of frozen write set; noted deferred).
