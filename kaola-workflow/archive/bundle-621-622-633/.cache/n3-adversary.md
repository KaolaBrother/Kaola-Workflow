evidence-binding: n3-adversary e7b867a031fe
verdict: pass
findings_blocking: 0

finding: id=R6 scope=pre_existing action=document status=deferred severity=low fix_role=none rationale=close-and-open-next's fused advance has no live-running-set fence for NON-member closes (lane-member fence at adaptive-node.js:2176-2187 covers members only); empirically self-protecting in the R4 shape (the in_progress-nextNode guard at :2468 reported closed-only, descriptor intact, B merged group_passed), reachable only via orchestrator contract violation, family predates both #622 and this repair — hardening note, non-blocking

## Claim Under Test (2nd pass)

"The R4 regression is now fully fixed AND no NEW regression was introduced by the fix" — node n1-scheduler-fixes, bundle-621-622-633 (#621/#622/#633). Scoped surface: the `lane_group_live` speculative-write exclusion in `runOpenReady` (scripts/kaola-workflow-adaptive-node.js:4341-4356), plus non-regression of #621/#622/#633.

## Disproof Attempt

Rebuilt a standalone falsification suite (throwaway mkdtemp git repos, REAL adaptive-node CLI + real plan-validator subprocesses, zero reuse of the shipped test file), 84 assertions. Result: ALL PASS. Could not break the fix.

**1. Exact R4 scenario closed.** `seed -> {A,B} co-open lane group -> A defers -> gateR read co-opens alongside live B -> CRITICAL TICK`: at the tick `opened: []`, `reason: speculative_write_excluded`, `speculativeWriteExcluded.reason === 'lane_group_live'` with W2 in nodeIds; W2 stays pending, never enters the running set; ORIGINAL descriptor intact (group_id unchanged, members still includes B, A in closed_members, B legs manifest present); running nodes exactly {B, gateR}; tick idempotent. B close HELD (merge_awaits_read_drain, zero-mutation) while gateR live; after gateR closes B reaches barrier: group_passed, synthesized: true; both ar4.js AND br4.js reach HEAD; no leg worktree survives. Recovery: W2 opens through the ORDINARY path (kind: write, no speculative stamp) and closes cleanly — no throughput lost, no wedge.

**2. No different path to the same bug class.** Structural: descriptor CREATION has one write site (laneGroupEntry :4639, fed by groupForm); groupForm set on exactly two branches — the speculative branch (now excluded by liveGroupId) and the non-speculative branch gated by liveNodes.length === 0 (unreachable while a group is live, since every group-barrier refusal is zero-mutation and ledger-derived isLast makes an all-defer drain impossible). Empirical attacks all failed:
- (a) non-speculative write co-open while group live -> write_awaits_drain, descriptor untouched; fresh group only AFTER drain (single-descriptor invariant held).
- (b) 3-member group, two live members -> exclusion fires with 2 live, then 1; after gateR closes, normally-ready W2 still waits (write_awaits_drain) for C; C's last-member merge lands all THREE files at HEAD.
- (c) two concurrent groups -> structurally impossible (both formation paths fenced, one lane_group key).
- (d) starvation/deadlock -> no circular wait (drain depends only on read closes, which never depend on the excluded write); proven live.
- overreach: a speculative READ still opens alongside the live group at the tick — fix correctly scoped to writes only.
- bypass: open-next at the tick refuses scheduler_active; close-and-open-next on gateR (contract misuse) closed gateR but did NOT open W2 (:2468 guard), did NOT touch descriptor, B still merged group_passed — recorded as R6 (pre-existing, misuse-only, loud typed recovery).

**3. #621/#633 re-confirmed.** #621: fused-advance baseline failure refuses baseline_failed with close half preserved, next row PENDING, --start before any in_progress flip; reopen crash-window leaves impl PENDING gates-folded, retry idempotent. #633: leg-resident self-written evidence stubs TRACKED at leg branch point, A defers reading leg copy, last-member merge group_passed with no untracked-collision, leg-written content reaches HEAD, legs torn down. No repair collateral.

**Full-suite:** test-adaptive-node.js 1478/1478; walkthrough passed; canonical vs plugins/kaola-workflow/ twin byte-identical (cmp); edition-sync.js --check "10 forge aggregator ports in rename-normalized parity"; lane_group_live present once in canonical + both forge ports. Repo files touched by verifier: zero.

Root-cause answer: R4 is actually, completely fixed — the exclusion sits at the only descriptor-formation choke point, the collision did not move to another interleaving, and the recovery leg proves the ordering fix costs no reachable parallelism.

## Verdict

NOT-REFUTED (confidence: high). verdict: pass
