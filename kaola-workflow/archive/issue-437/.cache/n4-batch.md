evidence-binding: n4-batch 6f20f7748d63

RED: LG1: status surfaces laneGroup.group_id — got undefined (TypeError: Cannot read properties of undefined (reading 'members') at test-parallel-batch.js:1698, pre-impl: the laneGroup field did not exist in runStatus output)
GREEN: runStatus surfaces laneGroup from running-set.json lane_group; parallel-batch tests passed (214 assertions) — +9 new (205 → 214); LG1/LG2/LG3 all green

# n4-batch — parallel-batch lane-group compatibility (#437 / D-419 P2)

## Assessment: did parallel-batch.js need production changes?

Reviewed `scripts/kaola-workflow-parallel-batch.js` against the four lane-group
concerns from the node brief:

1. **open-batch** — NO change. A write-role frontier serial-degrades UNCONDITIONALLY
   (`runOpenBatch` :521-534 returns `{degraded:true, reason:'cwd_unenforceable'}`). The
   lane-group co-open lives entirely in `adaptive-node.js open-ready` (`tryFormLaneGroup`
   + the `lane_group` running-set writer, confirmed in the n3 commit). The batch machine
   never co-opens a write group, so the design's INV-6 (§8 parallel-batch) holds: flag-OFF
   AND flag-ON batch paths are byte-identical.

2. **seal / seal-member** — NO change. `sealOne` (:621-677) shells `commit-node --node-id
   <member>` for every read-only batch member; write-role members never enter a manifest
   (they serial-degrade), so a lane-group member is NEVER sealed via `parallel-batch seal`.
   Lane-group members close through `adaptive-node.js close-node` (deferred/group barrier).
   No false interaction — confirmed by inspection + all four chains green.

3. **status** — ONE additive change (the only production edit). `runStatus` already READS
   `running-set.json` for the cross-check but did not surface a live `lane_group`. Added a
   `laneGroup` diagnostics field in BOTH return branches when `runningSet.lane_group` is
   present. A serial/read running set has no `lane_group` key ⇒ `laneGroup` is omitted ⇒
   flag-OFF byte-identical (INV-6).

4. **reconcile** — NO change, and provably cannot destroy a lane_group: grep confirmed
   parallel-batch ONLY READS `running-set.json` (one read in `runStatus`) and ONLY WRITES
   `active-batch.json` + the plan (all `writeFile` calls target `manifestPath`/`planPath`).
   The `lane_group` lives in `running-set.json`, which `runReconcile` never touches. The
   running-set crash-repair owner is `adaptive-node runReconcileRunningSet` (n3 scope), not
   parallel-batch's manifest-scoped `runReconcile`.

**Conclusion**: the lane-group mechanics are fully owned by adaptive-node + the validator.
parallel-batch needed exactly ONE additive, flag-OFF-byte-identical change (status
diagnostics). The 4-file family (root + codex byte-pair + 2 forge ports) is in the write set
so the additive surface stays in sync.

## RED → GREEN (TDD)

Added CLUSTER LG to `scripts/test-parallel-batch.js` (LG1 surface, LG2 flag-OFF byte-identity,
LG3 active-manifest coexistence). The RED proves the test bites: with no `laneGroup` field the
real-shape runStatus output is missing the key and the assertion throws. After the minimal
`runStatus` edit (surface `lane_group` as `laneGroup` when present) all three LG assertions pass.

## Edition sync

- Copied root `scripts/kaola-workflow-parallel-batch.js` byte-for-byte to
  `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` (diff empty — BYTE-IDENTICAL).
- `node scripts/edition-sync.js --write` regenerated both forge ports:
  `generated  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js`
  `generated  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js`
- `node scripts/edition-sync.js --check` ⇒ exit 0:
  "edition-sync: 12 forge aggregator ports in rename-normalized parity with canonical."
- `node scripts/validate-script-sync.js` ⇒ exit 0 (byte-pair + rename-normalized families in sync).
- All four edition copies carry the change (grep -c laneGroup == 4 in each of the 4 files).

## All four chains (exit codes)

- `node scripts/test-parallel-batch.js` ⇒ exit 0 — "parallel-batch tests passed (214 assertions)"
- `npm run test:kaola-workflow:claude`  ⇒ exit 0 — "Workflow walkthrough simulation passed"
- `npm run test:kaola-workflow:codex`   ⇒ exit 0 — "Kaola-Workflow walkthrough simulation passed"
- `npm run test:kaola-workflow:gitlab`  ⇒ exit 0 — "GitLab Codex workflow walkthrough simulation passed"
- `npm run test:kaola-workflow:gitea`   ⇒ exit 0 — "Gitea Codex workflow walkthrough simulation passed"

Adjacent suites (no regression): test-adaptive-node (623 assertions, exit 0),
test-commit-node (85 assertions, exit 0).

build-green
