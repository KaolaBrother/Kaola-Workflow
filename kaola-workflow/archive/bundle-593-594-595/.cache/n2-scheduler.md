evidence-binding: n2-scheduler 740e98328048
<!-- RED: paste RED here -->
RED: #593-AC1 (coarse exact-disjoint, both under plugins/, gate present, NO consent) on pre-fix code — `node scripts/kaola-workflow-plan-validator.js <coarse-plan> --parallel-safe --nodes A,B --json` → `{"result":"refuse","reason":"overlapping_write_sets","overlapping":[{"a":"A","b":"B","kind":"red","reasoning":"coarse-area overlap at \"plugins\" between nodes 0 and 1"}]}` exit 1 (serial-degrade — coarse required policy+consent). Runtime mirror: the real-git `#593-AC1` test's setup assert `open.result==='ok' && open.laneGroup` fails pre-fix (open-ready serial-degrades ⇒ laneGroup undefined).
<!-- GREEN: paste GREEN here -->
GREEN: #593-AC1 same validator command post-fix → `{"result":"ok","nodes":["A","B"],"overlapping":[],"relaxed":[{"a":"A","b":"B","kind":"coarse","policy":"off"}]}` exit 0 (coarse relaxes BY DEFAULT under the net). Real-git `#593-AC1` lifecycle passes: co-open [A,B] (no consent) → legs provisioned → close A `deferred_to_group` → close B `group_passed` + `synthesized` (octopus-merge union barrier) → BOTH `plugins/…gitlab/…/pa.js` + `plugins/…gitea/…/pb.js` on HEAD. Full suite: `node scripts/test-adaptive-node.js` → **1248 assertions passed** (baseline 1223); `node scripts/simulate-workflow-walkthrough.js` → passed.

---

## Part 1 — #594: dead `batch_active` guard removal

### Scope decision (active-batch.json has NO producer left — proven dead)
`grep -rn "active-batch.json" scripts/ plugins/kaola-workflow/scripts/ | grep -i write/create/atomicReplace/openSync` → **zero writers**. The only non-comment references outside adaptive-node were comments in `validate-workflow-contracts.js:721` (atomic-replace example — OUT OF SCOPE, left) and `kaola-workflow-adaptive-schema.js:190` (historical comment — not in write set, left).

Three distinct consumers were disambiguated:
1. **`batch_active` mutual-exclusion GUARD** (the issue's headline) → **REMOVED**: `probeCoordination`'s active-batch.json read; `readCoordinationState`'s `batchOpening`/`batchActiveState`/`batchLive` fields (+ their use in `serialLive`/`collisions`); `coordinationRefusal`'s `batch_active` arm; the `'batch'` entry dropped from all three `excl` arrays (open-next `['scheduler','batch']`→`['scheduler']`, close-and-open-next `['batch']`→none, open-ready `['serial','batch']`→`['serial']`); the `batch_active` OPERATOR_HINT_REGISTRY entry.
2. **`active_batch_exists` plan-repair-reopen path** → **REMOVED** (scope-decision, provably dead): the batch arms in `runReopenNode` + `runRepairNode` (each refused over a live active-batch.json manifest) and the `active_batch_exists` hint. The parallel **running-set** arm (`scheduler_active`) is LIVE and remains — it is the surviving live-coordination guard. Rationale: the batch arm can never fire (no producer), and it is the same dead-manifest-guard family as `batch_active`; the plan explicitly authorized expansion "only if provably dead" — condition met.
3. **orient's read-only manifest legality reconstruction** (`runOrient` ~L1338, `batch_topup_incomplete`, the AC#5 batch member-set arm, the `manifest`/`batch` return fields) → **KEPT** (deliberate boundary). This is NOT the dead guard and NOT `active_batch_exists`; per the plan's precise wording only "reads that ONLY the dead guard consumes" are removed. It is contract-bearing (`T20a` asserts `batch===null`, orient returns `manifest`), structurally woven with the LIVE #377/#384/#305/#293 running-set legality, and — since the manifest is always null in producible state — removing vs keeping it is byte-identical for every producible state. Removing it is a larger orient-contract change beyond #594's "dead batch_active guard" scope (would break ~6 T20b/T20d/R4b/#305/RUN_ORIENT_EXPECTED fixtures vs the ~5 batch-guard fixtures the issue anticipates). Documented for n3/n5.

Post-removal grep in `scripts/kaola-workflow-adaptive-node.js`: `batch_active` and `active_batch_exists` appear ONLY in #594 explanatory comments (0 code refs); `active-batch.json` remains only in orient's kept read (L1338) + historical comments.

### #594 test-fixture updates (the ~5 batch_active fixtures)
- reopen guard test → converted from `active_batch_exists`(live batch) to `scheduler_active`(live running-set) — preserves reopen-guard coverage via the surviving arm.
- `S-RT9` (close-and-open-next excl-batch fence) → retired (unproducible; the narrow lane-group-member body fence is unaffected + still covered by leg-group tests).
- `S-PC` (probeCoordination) → `manifest` no longer surfaced → asserts `!('manifest' in probe)`.
- `S383-excl` → dropped the `batch_active` sub-case (kept `serial_node_live`).
- `S-CO1` → drops the batch-arm assertion (`!('batchLive' in co)`); `S-CO5`/`S-CO6` (batch-live + batch/running-set union collision) retired — serial + running-set are mutually exclusive so no union collision is producible.
- `T-445-E` known-reasons list → removed `batch_active`.

## Part 2 — #593: exact-path co-open relaxation (issue's normative design)

- `writeOverlapRelaxable` coarse arm (`kaola-workflow-plan-validator.js`): flipped from policy+consent-gated to **DEFAULT-RELAX under the SAME retained net** — NET-1 `gatePresent` (post-dominating code-reviewer gate over the legs) + NET-2 no PROTECTED file in either set. Added `hasUnresolvableEntry(set)` (trailing `/` directory-shape OR `*?[]{}` glob) — the resolvability fallback: an unprovable-disjointness coarse pair keeps the coarse-area refusal.
- `exact` NEVER relaxes: same exact path OR case-collision (`Foo.js` vs `foo.js`, caught by classifier case-fold as `kind:'exact'`) stays blocking at every tier; no flag/policy/consent bypasses the net or the exact check.
- **Classifier verdict purity kept**: `disjointWriteSets` untouched (still `red / kind:'coarse'`); `kaola-workflow-classifier.js` NOT written (declared-but-unwritten — no shared resolvability helper needed; the guard is pure at the plan-validator callsite). Verdict-only readers (`scanClaimedOverlap`, G-SEL-4, the #232 freeze concurrent-sibling antichain loop) unchanged ⇒ the walkthrough's freeze-time coarse "must ask" (A3) stays green.
- `write_overlap_policy` / `--write-overlap-consent` kept PARSED (frozen-plan back-compat) but now VESTIGIAL at this seam (not repurposed as a net-bypass; `write_overlap_policy: exact` not squatted). `runOpenReady`/`tryFormLaneGroup`/leg-provision consent-forwarding comments in `kaola-workflow-adaptive-node.js` updated to match.

### #593 AC coverage (all in `scripts/test-adaptive-node.js`; validator net pinned there because `test-commit-node.js` is out of write set — see BLOCKER)
- **AC1** (RED→GREEN): real-git co-open happy path — coarse exact-disjoint (both plugins/), net holding → co-open → legs → per-leg barriers → octopus merge → union barrier → both on HEAD. Also `#593-V-AC1` at the validator `--parallel-safe` seam.
- **AC2**: `#593-V-AC2a` (NET-1 absent → refuse, consent no-override) + `#593-V-AC2b` / `#593-AC2-NET2` / `#500-NEGATIVE-B` (PROTECTED → refuse/serial-degrade, consent/policy no-override).
- **AC3**: `#593-V-AC3-exact` (same exact path) + `#593-V-AC3-case` (case-collision) → refuse.
- **AC4**: `#593-V-AC4-dir` (directory-shaped) + `#593-V-AC4-glob` (glob) → coarse-area refusal preserved.
- **AC6**: `#593-AC6` (KAOLA_PARALLEL_WRITES=0 → serial, no lane_group, one opened, byte-identical serial shape).
- Vestigial invariant: `#593-V-VESTIGIAL` (policy:off/no-consent relaxes identically to policy:coarse/consent) + `#500-DISCRIMINATOR` coarse now default-relaxes.
- `simulate-workflow-walkthrough.js` declared defensively → NOT touched (freeze behavior unchanged, stays green).

## Cross-edition sync
- `node scripts/edition-sync.js --write` → 6 files regenerated (gitlab+gitea forge ports + codex twins for adaptive-node.js and plan-validator.js); classifier NOT regenerated (unchanged canonical).
- `node scripts/edition-sync.js --check` → OK (10 forge aggregator ports in rename-normalized parity).
- `node scripts/validate-script-sync.js` → OK (24 common scripts; all byte/rename/forge families in sync).
- Forge-port spot-check: `batch_active` reason gone (comments only), `hasUnresolvableEntry` + coarse default-relax present in gitlab/gitea/codex plan-validator ports.

## Final verification
- `node scripts/test-adaptive-node.js` → **1248 assertions passed** (baseline 1223, +25 net).
- `node scripts/simulate-workflow-walkthrough.js` → passed.
- `edition-sync.js --check` + `validate-script-sync.js` → both green.
- Four npm chains NOT run (deferred to all-done per dispatch).

## BLOCKER (out-of-write-set write needed — STOPPED per the frozen-write-set rule)
`scripts/test-commit-node.js` (in the claude chain) has `T463-FLOOR-consent` and `T463-FLOOR-off`, which assert the OLD coarse behavior (coarse + policy:disjoint but NO consent → refuse; policy:off + consent → refuse). Under #593 coarse now DEFAULT-RELAXES, so both flip to `ok`/`relaxed[kind:coarse]` and these two assertions will RED the four-chain gate. `test-commit-node.js` is NOT in n2's frozen write set (single canonical file, no forge mirrors) and I did NOT edit it. Required fix (small): update those two tests to expect `ok`/relaxed under the new default-relax (their sibling floors T463-FLOOR-gate/-docsgate/-exact/-protected stay green). The orchestrator must expand n2's write set (reopen) or dispatch a follow-up to update those two tests before the four-chain #307 gate can pass.

---

## Follow-up (write set widened by orchestrator): `scripts/test-commit-node.js` T463 re-pin — BLOCKER RESOLVED

The orchestrator added `scripts/test-commit-node.js` to n2's declared write set (plan re-frozen). The two stale floor tests were re-pinned to the NEW net-gated default-relax floor (not vacuous passes):

- **T463-FLOOR-consent** — before: coarse-disjoint + policy:disjoint + NO consent → expected `refuse/overlapping_write_sets` (consent mandatory). After: expects `ok` AND `relaxed[]` carries `kind:'coarse'` (proves the RELAXATION path fired, not a green short-circuit / silent verdict change) AND `overlapping` empty. 1 assertion → 3 assertions.
- **T463-FLOOR-off** — before: no-policy + consent → expected `refuse` + `!r.relaxed` (default-off byte-identity). After: pins the JOINT-VESTIGIAL invariant — no-policy + consent → `ok`/`relaxed[kind:coarse]`; no-policy + NO consent → identical `ok`/`relaxed[kind:coarse]`; AND the two emissions are byte-equal after dropping `exitCode` (consent flips NOTHING — the strongest form of "vestigial, not a net-bypass"). 2 assertions → 4 assertions.
- Block header comment updated to describe the #593 default-relax floor (no-gate/exact/PROTECTED still refuse; dir/glob resolvability fallback pinned in test-adaptive-node.js #593-V-AC4).
- Sibling floors untouched: T463-FLOOR-gate / -docsgate / -exact / -protected (+ T463-AC, T546G2-*) unchanged and green.

### Green runs
- `node scripts/test-commit-node.js` → exit 0, `commit-node tests passed (123 assertions)`.
- `node scripts/test-adaptive-node.js` (no-regression) → exit 0, `adaptive-node tests passed (1248 assertions)`.

Nothing else touched; edition-sync state unaffected (test-commit-node.js is a single canonical file, no forge mirrors).
