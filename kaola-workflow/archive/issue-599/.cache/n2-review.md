evidence-binding: n2-review 9e1aca4615d1
## n2-review — G1 code-reviewer gate (opus, read-only)

Change under review: selectSpeculativeWriteGroup (adaptive-node.js x4) hardened fail-OPEN -> fail-CLOSED on a --parallel-safe result that is non-ok without a well-formed overlapping array. Diff +11/-2 per file, identical x4, +47 test lines (T599-1a/1b/1c).

Focus 1 — posture mirror + Array.isArray correctness: enumerated every validator output shape (plan-validator.js:2094-2160) and traced each: ok path unchanged (outer guard); overlapping_write_sets refuse -> per-pair exclusion unchanged; node_not_found / missing_nodes / subprocess crash {exitCode:1} / garbled JSON {exitCode:0} -> exclude ALL (fail-closed). BONUS: the fix also closes the reachable node_not_found structured-refuse shape beyond the stated crash/garbled scope. Residual asymmetry examined and cleared: a synthetic {refuse, overlapping:[]} is UNREACHABLE from the real validator (:2154 sets ok = overlapping.length===0); the per-pair-vs-binary split is the documented granularity difference.

Focus 2 — healthy paths unchanged: ok path skipped by unchanged outer guard; 1314 assertions green incl. all T596-*.
Focus 3 — cross-edition parity: byte-identical hunks canonical+claude port; rename-normalized gitlab/gitea; edition-sync --check 10 ports parity; validate-script-sync 24 in sync.
Focus 4 — test quality: fault-injection mocks exactly reproduce shellNode's documented return shapes (crash {exitCode:1}; garbled {exitCode:0}); traced old-code execution on the crash mock reproducing the RED excerpt; T599-1c pins the untouched per-pair posture; injectable shell seam same as T596-5.
Focus 5 — adjacent fail-opens: only two --parallel-safe consumers exist; tryFormLaneGroup already fail-closed; leg-capability probe is a pure env read; next-action static side never shells the validator. No adjacent gap.

Runs: test-adaptive-node 1314; test-next-action 103; test-commit-node 123; walkthrough passed; edition-sync --check exit 0; validate-script-sync exit 0.

Findings: one LOW advisory, non-blocking — O1: on the new exclude-all branch the caller labels speculativeWriteExcluded.reason = 'overlaps_live_writer' though the real cause was a subprocess failure; diagnostic-only field (never a gate), behavior correct; optional follow-up token parallel_safe_indeterminate.

finding: id=O1 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=speculativeWriteExcluded.reason mislabels a crash/garbled non-open as overlaps_live_writer; diagnostic-only field, never a gate, behavior correct

verdict: pass
findings_blocking: 0
