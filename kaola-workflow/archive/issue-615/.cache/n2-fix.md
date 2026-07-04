evidence-binding: n2-fix b8038c9bcfab
<!-- RED: paste RED here -->
RED: #615-MIXED-SERIAL-LANE-DEGRADE (scripts/test-adaptive-node.js) — with the `&& parentClean` guard reverted (pre-fix), `open-ready` over the ready {pA,pB} frontier while sA's declared production file `src/serial_a.js` sits uncommitted in the parent still FORMS a lane group. AssertionError: "#615-MIXED: a parent carrying uncommitted serial production dirt MUST NOT co-open a lane group ... expected serial-degrade, got laneGroup {"group_id":"lg-pA-pB","members":["pA","pB"],"legs":{"pA":...,"pB":...}}" — 3 assertions FAILED (opened=["pA","pB"] both in_progress + running-set carries lane_group), 1404 passed. This is the unsatisfiable state: the co-opened group's last-member close deadlocks (Horn A parent_dirty vs Horn B write_set_overflow).
<!-- GREEN: paste GREEN here -->
GREEN: #615-MIXED-SERIAL-LANE-DEGRADE passes after the fix — `parentCarriesProductionDirt` (shelling the SAME `--parent-clean-check` the last-member close runs) detects `src/serial_a.js` as out-of-allowband production dirt, `parentClean` is false, group formation is gated off, and `open-ready` DEGRADES: opened.length===1, opened[0].kind==='write', no group_id, no `lane_group` key in running-set.json, one parallel write in_progress + the other pending. adaptive-node tests passed (1407 assertions). Falsification held: D437-OPEN-READY-DEFAULT-COOPEN (clean parent) still co-opens [A,B] — the degrade bites ONLY the dirty-parent mixed shape.

## Change summary
- Fix (canonical): `scripts/kaola-workflow-adaptive-node.js` — new module-scope helper `parentCarriesProductionDirt(planPath, project, shell)` (beside `tryFormLaneGroup`) + a `parentClean` precondition on the lane-group formation gate in `runOpenReady`'s `else if (liveNodes.length === 0 && writeNodes.length > 0)` branch; on dirt (or any uncertain non-`pass` result) it falls into the EXISTING single-serial-write else branch. Fail-closed. Direction 1 (prevent the mixture at scheduling; no fence relaxation, no contract change).
- Test (canonical): `scripts/test-adaptive-node.js` — new hermetic `#615-MIXED-SERIAL-LANE-DEGRADE` case (real git repo under $TMPDIR, real open-ready subprocess, mixed sA→sB serial + pA/pB parallel DAG, sA's file left uncommitted). Added to test-adaptive-node.js (not simulate-workflow-walkthrough.js) to stay inside the declared write set.
- plan-validator.js: NOT edited — Direction 1 needs no validator change (it reuses the existing `--parent-clean-check`).
- Cross-edition regen: `node scripts/edition-sync.js --write` regenerated the 3 forge ports (codex byte-copy `plugins/kaola-workflow/...`, gitlab `plugins/kaola-workflow-gitlab/...kaola-gitlab-workflow-adaptive-node.js`, gitea `plugins/kaola-workflow-gitea/...kaola-gitea-workflow-adaptive-node.js`); all three verified to carry the fix.
- Validation: `node scripts/simulate-workflow-walkthrough.js` green ("Workflow walkthrough simulation passed"). #307 four-chain run SEQUENTIALLY, all GREEN: test:kaola-workflow:claude EXIT 0, :codex EXIT 0, :gitlab EXIT 0, :gitea EXIT 0.

## Repair (code-reviewer n3-review found ONE of two formation sites gated)

The prior fix closed the NORMAL (non-speculative) co-open site but LEFT the SPECULATIVE-write site
(`runOpenReady`'s `openingSpeculative && writeNodes.length > 0` arm) ungated. That arm always forms a
size-1 legged lane_group for a write betting on an open ancestor gate, regardless of parent dirt — its
last-member close hits the IDENTICAL two-horned deadlock (Horn A parent_dirty vs Horn B
write_set_overflow) #615 exists to eliminate. Live risk in THIS run's own plan (speculative_open_policy:
auto, n2-fix's own production dirt uncommitted, n5-docs gated only by n4-verify) — not hypothetical.

RED: T615-SPEC-DIRTY-DEGRADE (scripts/test-adaptive-node.js) — with the speculative-branch `parentClean`
gate reverted (`else if (false && parentCarriesProductionDirt(...))`, pre-repair), a plan
`writerA(complete, its declared production file a.js left UNCOMMITTED in the parent) -> gate1(live,
in_progress) -> writerW(write)` at speculative_open_policy:auto, calling `open-ready --project issue-596
--json` (no --speculative-consent needed at auto), STILL opens writerW in a provisioned leg. 5 assertions
FAILED, 1408 passed. Signature: "T615-SPEC: NO lane_group descriptor forms on the dirty-parent
speculative degrade, got {"group_id":"lg-writerW","members":["writerW"],...,"legs":{"writerW":{...}}}"
(+ speculativeWriteExcluded=undefined, running-set carries lane_group lg-writerW, writerW ledger flipped
to in_progress). This is the unsatisfiable size-1-group state.

GREEN: T615-SPEC-DIRTY-DEGRADE passes after the repair — `parentCarriesProductionDirt` (shelling the SAME
`--parent-clean-check` the last-member close runs) detects a.js as out-of-allowband production dirt, and
the new `else if (parentCarriesProductionDirt(...))` arm EXCLUDES all speculative write candidates: opened
is empty, `speculativeWriteExcluded.reason === 'parent_dirty'` (nodeIds:["writerW"]), NO laneGroup
descriptor, NO lane_group key in running-set.json, writerW ledger row stays pending (it waits for gate1
normally — speculation is a pure optimization, safe to refuse on a dirty parent). adaptive-node tests
passed (1413 assertions, +6). Falsification held: T597-3b (clean parent, identical shape) STILL opens
writerW at auto — the exclusion bites ONLY the dirty-parent speculative shape.

### Findings addressed / deferred
- R1 (BLOCKING): FIXED. Speculative-write arm now gated on the SAME `parentCarriesProductionDirt`
  precondition; on dirt it excludes all write candidates with `speculativeWriteExcluded.reason:
  'parent_dirty'` (mirrors the sibling `no_leg_capability` exclusion). Short-circuited AFTER `legCoupled`
  so the fence subprocess only spawns when a speculative write could actually form a group.
- N1: FIXED. Non-speculative branch no longer computes `parentClean` eagerly — inlined
  `!parentCarriesProductionDirt(...)` as the LAST conjunct of `if (legCoupled && writeNodes.length >= 2
  && !parentCarriesProductionDirt(...))`, so the validator subprocess spawns only when a group could form.
- N3: FIXED. Helper acceptance check changed from `!(fence && fence.result === 'pass')` to
  `fence.exitCode !== 0 || fence.result !== 'pass'` — literally mirrors the close-fence's own check
  (:5028 pre-repair); the dead `fence &&` guard removed (shellNode always returns an object).
- N2 (silent degrade, no reason field on the non-speculative serial-degrade): DEFERRED. Surfacing the
  degrade cause requires threading a NEW telemetry field through the SUCCESSFUL-open return path (not the
  empty-open path that already carries `speculativeWriteExcluded`), changing that response shape — beyond
  this bounded repair; a focused telemetry follow-up is the right home.
- N4 (stale `:4994` line-number comment for the close fence, actually at :5028): DEFERRED. The `:NNNN`
  line-number-comment convention in this file is inherently approximate and self-restales on every edit
  (this repair's own insertions shift the fence again); the reference already lands inside the correct
  close-node region. Re-numbering a comment my own insertion immediately re-stales is churn without
  durable value.

### Cross-edition regen + fresh four-chain (this repair)
- `node scripts/edition-sync.js --write` regenerated the 3 forge ports; all three verified to carry the
  new guard (1× `reason: 'parent_dirty', nodeIds` R1 exclusion; 2× `fence.exitCode !== 0 || fence.result
  !== 'pass'` = N3 helper mirror + pre-existing close-fence; 1× `!parentCarriesProductionDirt(planPath,
  project, shell))` N1 short-circuit) in each of codex/gitlab/gitea.
- `node scripts/simulate-workflow-walkthrough.js` green. #307 four-chain run SEQUENTIALLY, all GREEN:
  test:kaola-workflow:claude EXIT 0, :codex EXIT 0, :gitlab EXIT 0, :gitea EXIT 0.
- Files edited (canonical only): `scripts/kaola-workflow-adaptive-node.js` + `scripts/test-adaptive-node.js`;
  the 3 `plugins/*/scripts/` ports are edition-sync-generated, not hand-edited.
