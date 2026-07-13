evidence-binding: n4-adversary 15d47c7946f4
verdict: pass
findings_blocking: 0
verdict_rationale: NOT REFUTED — repaired torn-Phase-3 sweep keeps the live group baseline in every reachable crash/torn state; the only forced group-baseline drops are on the running!=null path (byte-identical pre/post repair) and require non-reachable, internally-contradictory manifests.

ATTACK LOG (all executed via a standalone harness driving the REAL `reconcile-running-set` CLI):

RED/GREEN reproduction (canonical guard line 6232 reverted in a scratchpad copy):
  - RED (pre-repair): torn Phase-3 (running-set.json absent, A,B in_progress, live barrier-base-lg-A-B on
    disk) -> lg-A-B DROPPED (file=false, ref=false), orphanBaselinesDropped=["lg-A-B"] (the R1 corruption).
  - POST-repair: lg-A-B KEPT (file=true, ref=true), NOT in orphanBaselinesDropped; members A,B kept.
  - RED suite: exactly the two `#680-B-repair` assertions FAIL pre-repair (got file=false ref=false /
    ["lg-A-B"]) -> test is non-vacuous. (3rd FAIL D444-GUARDS is a bare-copy path artifact: green with
    0 FAIL in the real post-repair suite; unrelated to runReconcileRunningSet.)

Residual-attack scenarios vs the POST-repair sweep (kaola-workflow-adaptive-node.js:6232):
  1. torn-null / A,B in_progress          -> lg-A-B KEPT (correct).
  2. torn-null / ZERO in_progress (pending)-> A,B,lg-A-B ALL dropped (genuine pre-journal orphan reaped OK).
  3. torn-null / only A in_progress        -> lg-A-B KEPT (A live); B dropped (B pending = not live, correct).
  4. torn-null / unrelated node in_progress-> lg-A-B KEPT though dead: OVER-KEEP = fail-safe under-reap,
     NOT a live drop (design: "prefer leaving an orphan to risking a live drop"); eventually reaped at a
     zero-in_progress reconcile. Out-of-scope efficiency nit, not a correctness bug.
  5. running!=null naming a DIFFERENT group (lg-C-D) + A,B in_progress -> lg-A-B dropped.
  6. running!=null with nodes[A,B] group_id-stamped but NO lane_group key + A,B in_progress -> lg-A-B dropped.

Why 5 & 6 do NOT refute the claim:
  - The repair adds exactly ONE clause: `if (sanId.indexOf('lg-')===0 && !running && hasInProgressB) continue;`
    — it fires ONLY when running is null and is a pure ADD to the keep set. Post-repair the sweep drops a
    strict SUBSET of pre-repair. It cannot introduce ANY new drop; 5 & 6 are on the running!=null path,
    byte-identical pre/post — not a regression from the repair.
  - Non-reachable: running-set.json is written as ONE JSON.stringify always carrying lane_group while a
    group is live; a torn write yields invalid JSON -> readRunningSet null (the R1 path, now fixed), never a
    valid partial. Audited every writer (adaptive-node.js:4716-4718, 5361, 6488-6493): every path that
    REMOVES lane_group drops the group baseline in the SAME transaction, so "no lane_group key + live group
    baseline on disk" is never produced. A single running set holds ONE lane_group, so two groups' members
    cannot be in_progress at once. Both fixtures are hand-built contradictions, not reachable states.
  - Prefix false-match (a node literally named lg-*): an in_progress lg-* node is caught by keep.has(sanId)
    before the guard; a non-in_progress one only gets ADDED to keep -> at most under-reap, never a live drop.

Part A re-confirm: #680-A tests (Phase-2 baseline_failed abort drops group FILE+REF + both member FILE+REFs,
ledger stays pending) present (test 6644-6712) and green in the 1843-assertion post-repair suite.

#681 re-confirm: guard is `basename(outputPath)==='run-gaps.json' && resolve(outputPath)!==resolve(ownArtifactPath)`
(gap-sweep.js:203-205) -> the own .cache/run-gaps.json is resolve-equal, refusal skipped = no over-refusal;
test-gap-sweep.js green (85 assertions: T14 foreign refuse, T15 in-project --output allowed, T16 non-existent
foreign refuse).

Gates run (NOT the four npm chains, per instruction): adaptive-node suite 1843 assertions / 0 FAIL;
gap-sweep 85 assertions; simulate-workflow-walkthrough.js "Workflow walkthrough simulation passed" exit 0.

finding: id=R1-residual scope=out_of_scope action=none status=open severity=low fix_role=none rationale=torn-null-with-unrelated-in_progress leaves a dead lg-* orphan un-reaped (deliberate fail-safe under-reap, never a live drop; reaped at next zero-in_progress reconcile)
