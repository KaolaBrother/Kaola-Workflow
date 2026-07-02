# Documentation Docking — issue-597

## Changed files reviewed (branch 1aae852c..e7fe9510: engine 5ba860b2, legs/synth 6213bc4a, hint fix bdb77adb, comment refresh 7cad328a, CHANGELOG e7fe9510)
- Code: adaptive-schema.js ×4 (byte-anchor incl. materialize helpers), plan-validator.js ×4, adaptive-handoff.js ×4, next-action.js ×4, adaptive-node.js ×4
- Tests: test-adaptive-handoff.js (116), test-next-action.js (113), test-adaptive-node.js (1330), test-agent-profile-parity.js (27), canonical walkthrough
- Prose: six plan-run routing surfaces, docs/plan-run-cards/speculative-open.md, agents/workflow-planner.md + .toml ×3, docs/decisions/D-597-01.md, CHANGELOG.md

## Documents checked
- CHANGELOG.md — #597 ### Changed entry (auto tier + default flip + supersession + telemetry + relabel + precondition citation); accurate per both gates.
- Six routing surfaces — auto posture in lockstep; T8/T9 pins preserved (route-reachability 185 ×2 runs); provenance-free.
- docs/plan-run-cards/speculative-open.md — both tiers + discard telemetry + two operational-gotcha recipes grounded to real typed refusals (n5 traced serial_node_live and leg_base_unreachable to their emission sites).
- agents/workflow-planner.md + toml twins — write-speculation rubric updated; byte-parity ×3; DISCARD-ONLY parity token enforced.
- docs/decisions/D-597-01.md — precedent ladder + explicit D-419-02 supersession + live-exercise precondition (project issue-599).
- docs/architecture.md / docs/api.md — no update needed THIS run: the #596-era sections already describe the speculative kernel mechanics; tier semantics (auto/consent/off) are documented in the card + six surfaces + ADR, which are the operator-facing homes. No stale consent-only claim remains in either file (n5's stale-prose sweep covered live surfaces).
- README / .env.example — no impact (internal scheduler policy default).
- kaola-workflow/ROADMAP.md — regenerated at closure by cmdFinalize.

## Gaps found and fixed
- next-action.js:269 stale comment (n4 R1) — fixed via Trivial Inline Edit Exception, ports regen'd.
- gate_not_complete operator hint consent-only (n2 flag) — fixed, ports regen'd.
- schema.js:367 + test-next-action.js:506 stale comments (n5 R1/R2) — fixed, schema byte-copied ×4.

final verdict: DOCKED
