# aggregator-core evidence — issue #281 (node: parallel-batch STATE aggregator, TDD)

Built `kaola-workflow-parallel-batch.js` test-first. Write set (exactly 3, all touched):
- `scripts/kaola-workflow-parallel-batch.js` (aggregator)
- `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` (byte-identical copy)
- `scripts/test-parallel-batch.js` (root-only unit suite)

## RED (test written first; aggregator did not exist)

```
$ node scripts/test-parallel-batch.js
node:internal/modules/cjs/loader:1459
  throw err;
  ^

Error: Cannot find module './kaola-workflow-parallel-batch'
Require stack:
- /Users/.../scripts/test-parallel-batch.js
    ...
  code: 'MODULE_NOT_FOUND',
```

The suite `require`s `./kaola-workflow-parallel-batch` at module load, so before the
aggregator existed the run aborted with MODULE_NOT_FOUND (genuine failing-first state).

## GREEN (after implementing the aggregator)

```
$ node scripts/test-parallel-batch.js
parallel-batch tests passed (75 assertions)
$ echo $?
0
```

75 assertions pass, real exit 0. Coverage: pure cores (BATCH_STATES frozen-in-file,
deriveReadyPending, classifyBatchKind incl. MIXED→read-only-subset, checkDisjoint,
capMembers, crossCheckStatus orphan-legality) + integration (open-batch over a real
next-action-driven read-only sibling frontier → 2 in_progress + manifest state:'open' +
2 baselines; not_disjoint fail-closed; FANOUT_CAP clamp 5→4; seal-member/seal → 'sealed'
only when all complete; join read-only no-op + IDEMPOTENT across a 'joined' manifest;
join refuses 'open' as not_all_sealed; status reflects manifest + {active:false} + orphan
detection). Real next-action.js is driven against synthetic $TMPDIR plan fixtures
(pure/read-only) to exercise the genuine readyPending wiring; commit-node --start/barrier
is a documented shell stub (a real baseline needs a git fixture). All runtime fixtures live
under $TMPDIR (mkdtempSync) — nothing written inside the repo's kaola-workflow/ tree.

## Byte-identical confirmation

```
$ diff scripts/kaola-workflow-parallel-batch.js plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js
$ echo $?
0
```
Empty diff (byte-identical). `validate-script-sync.js` enforces this at finalize.

## No regression

- `node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation passed".
- `node scripts/test-next-action.js` → 33 assertions, exit 0.
- `node scripts/test-adaptive-node.js` → 104 assertions, exit 0.

## Subcommands + state machine (summary)

- `open-batch --project P [--max N]`: shell next-action; members = readyPending (own-pending
  subset of readySet, derived locally since next-action doesn't yet return the field);
  classify (all-read-only → no isolation; all-write-role → re-confirm pairwise-disjoint,
  fail-closed `not_disjoint`; MIXED → open the read-only subset first); cap at
  min(frontier, FANOUT_CAP=4 [env KAOLA_FANOUT_CAP], --max); flip each member ledger row →
  in_progress; one idempotent `commit-node --start` baseline per member; write the manifest
  state:'open' LAST. Refuse shapes: next_action_failed / not_disjoint / baseline_failed /
  node_not_in_ledger.
- `seal-member --project P --node-id N`: per-node `commit-node` barrier → on ok flip the
  member's ledger row → complete + compliance row; set manifest member sealed:true. Does NOT
  advance; refuses on barrier fail (no close). NOTE: the selector `armsToNa` routing that the
  single-node close path does (adaptive-node:567-590) is intentionally N/A for batch members —
  a `selector_source` is naturally a single-node frontier unit, not a fanout-sibling batch
  member, so a batch never carries a selector to route. The plan-run-semantics node owns the
  decision of which frontier units become batches vs single nodes; if it ever routed a
  selector_source into a batch, seal-member would need the routing ported (it currently is not).
- `seal --project P`: seal every still-open member in document order; manifest → 'sealed'
  ONLY when all members are terminal (complete/n/a). Returns {state,sealed,pending,failures}.
- `join --project P`: refuses ONLY when state ∈ {open,dispatched} (`not_all_sealed`); proceeds
  on {sealed,joining,joined} so a repeat is IDEMPOTENT (deletion is the orchestrator's job).
  No-op for all-read-only (skipped_read_only); write-role members path-scoped + idempotent
  `git checkout`, crash-safe via 'joining' + per-member joined flags; success → 'joined'.
- `status --project P`: read-only; parsed manifest (or {active:false}) + cross-check of
  manifest members vs ledger in_progress rows — flags the orphan condition (>1 in_progress
  with no/mismatched manifest). Never mutates.

State machine (BATCH_STATES, defined in-file per the orchestrator correction; NOT in
adaptive-schema.js): open → dispatched → sealed → joining → joined.

## Honest infeasibility (carried from the blueprint §0/§9)

A script cannot dispatch agents; the harness's only real concurrency is the MAIN SESSION
issuing multiple Agent() calls in one message. This aggregator owns batch STATE only; the
plan-run SKILL owns DISPATCH. These unit tests prove STATE correctness, NOT wall-clock
concurrency, which is not observable from a script or its unit suite.
