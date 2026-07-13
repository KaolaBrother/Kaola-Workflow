evidence-binding: n3-review 7139a5b7503e
verdict: pass
findings_blocking: 0
verdict_rationale: repair fully closes adversary R1 live-group-baseline drop; genuine RED->GREEN repro; all suites green; 4-edition byte-parity.
finding: id=R1-repair scope=in_scope action=none status=resolved severity=high fix_role=none rationale=torn-Phase-3 live lg-* group baseline now KEPT when running null AND >=1 in_progress; verified drop->keep by #680-B-repair repro.
finding: id=OBS1 scope=out_of_scope action=none status=open severity=low fix_role=none rationale=pathological plan node named lg-* while non-in_progress would over-keep(leak) not drop under torn-running+in_progress; fail-safe under-reap self-healing next zero-in_progress reconcile, no live-drop, no action.

Re-review notes (READ-ONLY; current tree = base 6dbb104b + uncommitted repair):

Repair traced across all four required scenarios:
1. torn running-set(null) + in_progress A,B + barrier-base-lg-A-B -> KEPT. sanId=lg-A-B not in keep; guard `sanId.indexOf('lg-')===0 && !running && hasInProgressB` = true -> continue (kept). Member baselines A,B kept via in_progress-ledger keep (keep.has short-circuit). CORRECT.
2. pre-journal orphan (SIGKILL pre-Phase-2, zero in_progress, running null) -> DROPPED. hasInProgressB=false -> guard false -> falls through to --drop-base. CORRECT.
3. readable running-set LIVE group -> KEPT. group_id added to keep inside if(running); keep.has short-circuits. CORRECT.
4. readable running-set DEAD lg-* -> DROPPED. !running=false -> guard false -> dropped. CORRECT.

Prefix check: laneGroupId = 'lg-'+sorted-member-ids.join('-') (line 4196). Sanitizer replaces [^A-Za-z0-9_-] with _, PRESERVING the lg- prefix (letters+hyphen allowed) -> barrier-base-lg-A-B sanitizes to lg-A-B; indexOf('lg-')===0 correctly identifies group baselines. Member ids never start with lg- in normal operation; the only pathological case (a node literally named lg-*) fails SAFE (over-keep/leak, never a live-drop) and self-heals on the next zero-in_progress reconcile — see OBS1.

Genuine reproduction confirmed (not vacuous):
- PRE-repair (base 6dbb104b adaptive-node.js, current test): #680-B-repair RED — "LIVE group baseline KEPT ... got file=false ref=false" and reported dropped ["lg-A-B"]; suite EXIT=1 (1840 passed, 2 targeted repro fails + 1 non-git-env artifact D444-GUARDS).
- POST-repair (current tree): test-adaptive-node 1843 assertions, EXIT 0 (0 FAIL lines). Delta is exactly the 2 #680-B-repair assertions (D444-GUARDS passes in-tree where git is present).

Part A (#680 Phase-2 baseline-drop) + #681 gap-sweep + parity:
- Part A: both Phase-2 aborts (baseline_failed, node_not_in_ledger) now call dropRecordedBaselines(recordedBaselineIds)+dropGroupBaseline(); legal (never drop_base_window_open) because the ledger flip is in-memory in planContent until writeFile(planPath) at end of loop -> on-disk rows still pending. Helpers hoisted to runOpenReady scope. Sound.
- #681: gap-sweep foreign-output guard TIGHTENED — drops the fs.existsSync precondition so an explicit --output at a non-existent foreign run-gaps.json also refuses (closes stray-write gap). Fail-closed, in-scope.
- 4-edition byte-parity: repair line + hasInProgressB tracking present 1x in each of the 4 adaptive-node copies.

Suites run (READ-ONLY; four npm chains deferred to finalize):
- node scripts/edition-sync.js --check -> EXIT 0 (10 forge ports, 24 COMMON mirrors, 27 byte-identical groups in parity)
- node scripts/validate-script-sync.js -> EXIT 0
- node scripts/simulate-workflow-walkthrough.js -> EXIT 0 ("Workflow walkthrough simulation passed")
- node scripts/test-adaptive-node.js -> EXIT 0 (1843 assertions)
- node scripts/test-gap-sweep.js -> EXIT 0 (85 assertions)

Conclusion: the repair FULLY CLOSES the adversary R1 refutation with no new over-keep/under-reap regression. No blocking findings.
