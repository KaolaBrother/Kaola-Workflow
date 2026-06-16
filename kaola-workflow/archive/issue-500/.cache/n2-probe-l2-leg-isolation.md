evidence-binding: n2-probe-l2-leg-isolation 4f716663b522

# L2 — KAOLA_LEG_ISOLATION (per-leg worktree isolation / synthesizer-merge) — probe findings

## HEADLINE: the "DORMANT-by-design" premise is STALE
- The workflow-plan.md (and the issue) describe L2 as "DORMANT-by-design in the current slice (legs provisioned + telemetered but nothing written into them; routing-into-legs is a later slice)." **This accurately described the Slice-2 state but is no longer true.** Slices 2–6 of #463 have ALL SHIPPED (v6.3.0+, CHANGELOG). The capability is COMPLETE and LIVE on the gated path.

## What KAOLA_LEG_ISOLATION gates (all present in current code, ×4 editions)
- `resolveLegIsolation(env)` at adaptive-node.js:3375-3378 (true on 1/true/yes); LEG_ISOLATION_ENV='KAOLA_LEG_ISOLATION'.
- Provisioning trigger (adaptive-node.js:3899): `if (groupForm && resolveLegIsolation(process.env) && opts.writeOverlapConsent)` — ALL THREE conditions required: formed lane group + KAOLA_LEG_ISOLATION=1 + `--write-overlap-consent`.
- Slice 2 (provisioning, 3910-3933): `git worktree add -b kw/legs/<project>/<node> -- <mainRoot>/.kw/legs/<project>/<node> <baseRev>`; leg-base anchored at refs/kaola-workflow/leg-base/<project>/<nodeId>; legs manifest into running-set.json under lane_group.legs.
- Slice 3 (per-leg barrier): closeGroupMember at 4315 runs `--leg-barrier` per member with a legEntry.
- Slice 4 (synthesizer): closeGroupMember at ~4398 reads liveLegs = lane_group.legs; runs parent-clean fence → synthesizeLevel (octopus merge of leg branches into feature HEAD) → commit-union barrier on M. When liveLegs null → byte-identical serial-degrade.
- Slice 5: merge_conflict envelope on synthesizer bail. Slice 6: governance, ADR-0010, AC18 live probe.

## Is anything WRITTEN into a leg on the live path?
- `dispatch.working_dir` returned by open-ready is `working_dir || null` (adaptive-node.js:4024) — the PARENT dir, NOT the leg path. Test test-adaptive-node.js:5258-5266 asserts this ("working_dir STAYS parent-side").
- **This is CORRECT by design** per ADR-0010 §3 ("isolation is containment, NOT construction"): the Agent tool has no cwd param and there's no runtime-neutral way to auto-redirect a leg agent's edits. So the leg path is surfaced as `laneGroup.legs[nodeId].legPath` and the ORCHESTRATOR must include the absolute legPath in the agent brief (every Edit/Write uses `<legPath>/...`, every Bash `cd "<legPath>" &&`) — this discipline prose IS in commands/kaola-workflow-plan-run.md:132-139 and all 6 surfaces.
- Proven: SYNTH-DISJOINT-END-TO-END (test-adaptive-node.js:5666-5694) writes real files into legA/legB and exercises synthesizer+union-barrier+HEAD-advance+teardown. AC18 live probe (docs/investigations/2026-06-15-463-live-probe-and-verification.md) confirmed REAL agent dispatches wrote in-lane when given the absolute legPath — Status: PASS.

## Activation recipe vs prose gap
- Full activation requires: `KAOLA_LANE_CONTAINMENT=1` (resolveLaneContainment, adaptive-node.js:4154; via tryFormLaneGroup) + `KAOLA_LEG_ISOLATION=1` + `--write-overlap-consent`.
- In live prose today: only KAOLA_LANE_CONTAINMENT is mentioned (plan-run.md:130). **ABSENT from all 6 surfaces: the env var name `KAOLA_LEG_ISOLATION` and `--write-overlap-consent`.** The leg-dispatch DISCIPLINE prose (how to use legPath) is already present; the ACTIVATION TOGGLES are not named.
- Stale comment: adaptive-node.js:3895 ("working_dir STAYS parent-side (S2 dormant — routing-into-legs is S3)") is a historical comment; technically still true (working_dir is intentionally not legPath) but misleadingly worded as "dormant."

## Doc provenance
- docs/decisions/0010-runtime-neutral-per-leg-worktree-isolation.md: states the mechanism is SHIPPED/complete (not dormant).
- docs/investigations/2026-06-15-463-completeness-audit.md: the EARLIER pre-completion audit ("Step 4 — NOT SHIPPED") that TRIGGERED slices 3-6.
- docs/investigations/2026-06-15-463-live-probe-and-verification.md: the COMPLETION record, AC18 PASS.

## FLIP-PREMISE (surfaced, not decided)
- WIRE if: capability is complete & leg path reachable via prose, only the toggle NAMES missing → naming KAOLA_LEG_ISOLATION + --write-overlap-consent (alongside the already-named KAOLA_LANE_CONTAINMENT) in plan-run prose is cheap AND honest. **Evidence shows this is TRUE today.**
- RELABEL if: provisioning-only / nothing routed into legs → the "dormant" framing. **Evidence shows this is FALSE (stale).**
- Caveat: naming only KAOLA_LEG_ISOLATION without the full recipe (KAOLA_LANE_CONTAINMENT + --write-overlap-consent) would be an INCOMPLETE activation doc. The honest WIRE = document the complete recipe; also update the stale "S2 dormant" code comment at 3895.
