evidence-binding: n1-telemetry 77fa0e7ecc32
<!-- RED: paste RED here -->
RED: #616-SERIAL-DEGRADE-TELEMETRY (scripts/test-adaptive-node.js) — FAIL: #616-SERIAL-DEGRADE-TELEMETRY: a parent-dirty-caused serial degrade must carry serialDegradeReason:"parent_dirty" on the SUCCESSFUL open, got undefined (pre-impl; 1415 other assertions green, this one alone red)
<!-- GREEN: paste GREEN here -->
GREEN: #616-SERIAL-DEGRADE-TELEMETRY passes plus its #616-PLAIN-SERIAL-DEGRADE negative-space companion; adaptive-node tests passed (1416 assertions)

## Summary

Fixed the silent non-speculative serial-degrade telemetry gap in `runOpenReady`
(`scripts/kaola-workflow-adaptive-node.js`). The `liveNodes.length === 0 && writeNodes.length > 0`
branch's `else` (single-serial-write degrade) fires for three distinct causes (`!legCoupled`,
`writeNodes.length < 2`, or `parentCarriesProductionDirt()` returning true) with no way to
distinguish them. Hoisted the fence's single short-circuited evaluation into a `parentDirty` local
(no double subprocess spawn) and threaded a new `serialDegradeReason: 'parent_dirty'` field onto the
SUCCESSFUL-open return object — set ONLY when `parentDirty` is the actual cause of that `else`,
mirroring the existing `speculativeWriteExcluded: { reason: 'parent_dirty', ... }` pattern on the
speculative-write sibling path. Absent (no field) for every other degrade cause and for a formed
lane group — byte-identical to pre-fix for every unaffected shape.

## Changes

- `scripts/kaola-workflow-adaptive-node.js` — declared `let serialDegradeReason = null;` alongside
  `speculativeWriteExcluded`; hoisted `parentCarriesProductionDirt(...)` into a single `parentDirty`
  const reused by both the group-formation gate and the `else` degrade; set
  `serialDegradeReason = 'parent_dirty'` only inside that `else` when `parentDirty` is true; spread
  `...(serialDegradeReason ? { serialDegradeReason } : {})` onto the success return object next to
  the existing `speculativeWriteExcluded` spread.
- `scripts/test-adaptive-node.js` — extended `#615-MIXED-SERIAL-LANE-DEGRADE` with a positive
  assertion (`r.serialDegradeReason === 'parent_dirty'` on the dirty-parent degrade), and added an
  adjacent `#616-PLAIN-SERIAL-DEGRADE` negative-space test (KAOLA_PARALLEL_WRITES=0 kill-switch over
  a CLEAN parent must NOT carry `serialDegradeReason: 'parent_dirty'`), proving the two serial-degrade
  causes stay distinguishable.
- Regenerated the three GENERATED_AGGREGATOR forge ports via `node scripts/edition-sync.js --write`:
  `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`.

## Verification

- `node scripts/test-adaptive-node.js` → `adaptive-node tests passed (1416 assertions)`, exit 0.
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`, exit 0.
- All four cross-edition chains green, run sequentially (this is a GENERATED_AGGREGATOR diff, #307):
  - `npm run test:kaola-workflow:claude` → exit 0
  - `npm run test:kaola-workflow:codex` → exit 0
  - `npm run test:kaola-workflow:gitlab` → exit 0
  - `npm run test:kaola-workflow:gitea` → exit 0

## Not committed

Per contract, no commit was made — the orchestrator owns the implementation commit at finalize time.
