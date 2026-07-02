evidence-binding: n5-review 018dcf682ea1
## n5-review — G1 code-reviewer gate (opus, read-only), holistic

Scope: 1aae852c..HEAD (37 files, +1412/-319). Did not redo n4's dynamic repros; verified code STRUCTURE cannot regress them + static idiom/parity/accuracy.

1. New seams (PASS): materializeSpeculativePolicy/hasSpeculativePolicyField pure locateSection-based (decoy-safe; unchanged on field-present/no-Meta; degenerate-EOF fallback); byte-identical x4 (md5 df78201e...). Handoff Step-1.75 AFTER both refuse-gates; write INSIDE the materialized!==preFreeze conditional; hash computed BEFORE write and handed to SPAWN-2; try/catch fail-safe falls back to SPAWN-1 hash; partial-write divergence fails CLOSED via governance_ack_stale. Single-point auth predicate; consent flag genuinely not consulted at auto. appendProvenanceLog optional extra via Object.assign — absent => byte-identical entry shape; discard passes {role, gate} from real populated member fields (lines 4105/4121). O1 relabel threads excludedReason; indeterminate always populates excluded.
2. Materialization edge cases by inspection (PASS): refuse no-mutation, already-frozen skip, field-present skip, hash coherence all STRUCTURAL. DEFAULT consumed only at materialization (grep-confirmed); every absence-path reader hardcodes 'off'.
3. Prose accuracy (PASS): rubric/card eligibility matches next-action.js:230-249 line-for-line; both card gotcha recipes resolve to real typed refusals (serial_node_live adaptive-node.js:3339; leg_base_unreachable plan-validator.js:113/2680); no-op flag, discard-only asymmetry, telemetry all code-backed.
4. Parity guards (PASS): agent-profile-parity 27 (new DISCARD-ONLY token distinctive); planner .toml twins byte-identical x3 (md5 2290c259); route-reachability 185; edition-sync --check + validate-script-sync green; four contract validators green; PROVENANCE_BAN clean on card+command+rubric+codex SKILL.
5. Tests pin observable contracts (PASS): handoff 116, next-action 113, adaptive-node 1330, commit-node 123; SPEC-7/8, T597-AC1a/b/c, AC3 legacy-resume, AC5 telemetry assert observable state.
6. CHANGELOG correctly absent (n6 owns it); ADR D-597-01 lands in this diff.
7. Stale-prose sweep: live agent-facing prose clean; TWO stale CODE comments (LOW, non-blocking): schema.js:367 ("default off" wording) and test-next-action.js:506 (section header consent-only/default-off).

No CRITICAL/HIGH/MEDIUM issues.

finding: id=R1 scope=in_scope action=document status=open severity=low fix_role=none rationale=schema.js:367 write_overlap comment still calls speculative_open_policy "default off"; stale after the auto flip, comment-only, propagates in the byte-identical x4 anchor
finding: id=R2 scope=in_scope action=document status=open severity=low fix_role=none rationale=test-next-action.js:506 section header says speculativePending "emitted ONLY at consent — the default off"; stale after the flip (emits at auto+consent, default auto); the test fixture itself is correct
(Orchestrator note: R1+R2 RESOLVED post-close via the Trivial Inline Edit Exception — comments updated, schema byte-copied x4, suites re-verified; recorded in finalization-summary.)

verdict: pass
findings_blocking: 0
