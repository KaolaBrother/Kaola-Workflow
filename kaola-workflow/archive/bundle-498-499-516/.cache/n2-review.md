evidence-binding: n2-review 3124333a0053
verdict: pass
findings_blocking: 0

# n2-review (code-reviewer, GATE) — bundle #498 + #499 + #516

GATE over n1-fix. READ-ONLY review. All checks run from the worktree at
/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-498-499-516.

## Write-set / disjointness (fail-trigger cleared)
- Diff ⊆ n1 declared write set: 4× adaptive-node.js (canonical + claude-plugin + gitlab + gitea ports) + scripts/test-adaptive-node.js. test-parallel-batch.js legitimately unmodified (co-open logic lives only in runOpenReady; parallel-batch reads a prebuilt lane_group fixture for status diagnostics — no co-open gate). Subset, not overflow.
- plan-validator.js UNTOUCHED (issue #498 body rejected the attribution-aware union-barrier alternative). write-lane.sh UNTOUCHED. No stray writes (only untracked = the project cache dir).

## #498 (HIGH) — gate-conjunction fix COMPLETE and NON-VACUOUS
- legCoupled = resolveLegIsolation(env) && writeOverlapConsent computed ONCE at function scope (~:3859) and used at BOTH the co-open gate (~:3873 `containment && legCoupled && writeNodes.length>=2`) and the leg-provision gate (~:3972 `groupForm && legCoupled`). Invariant groupForm ⟺ legs provisioned ⟺ safe close path holds.
- (a) containment-ONLY now serial-degrades (the actual bug): pinned by #498-COOPEN-REQUIRES-LEGS [containment-only] + #500-NEGATIVE-A.
- (b) leg-isolation-ONLY without consent serial-degrades: pinned by #498-COOPEN-REQUIRES-LEGS [leg-isolation but NO consent] + #500-NEGATIVE-B.
- (c) full conjunction co-opens AND provisions legs: #498-COOPEN-FULL-CONJUNCTION + LEG-PROVISION-ON.
- (d) MUTATION-PROVEN BITES: copied source to $TMPDIR, mutated legCoupled→opts.writeOverlapConsent (drop resolveLegIsolation) → 8 failures incl. #500-NEGATIVE-A (C1 L0 K1 now co-opens — the L0+consent pin) + LEG-FLAG-OFF[consent flag but NO toggle]. resolveLegIsolation IS pinned by the existing test set (advisor's worry resolved — the L0 K1→serial pin is #500-NEGATIVE-A). Dropping consent is independently pinned by #500-NEGATIVE-B / [leg-iso but NO consent].
- groupCeiling<2 → serial-degrade branch replaces Math.max(2,…). KAOLA_FANOUT_CAP=1 verified → resolveFanoutCap=1 → <2 → serial single write (honors explicit cap of 1).

## #499 (HIGH) — integrity gate REAL, not a mock false-green (fail-trigger cleared)
- runOpenNext prologue now mutationGuardPrologue(opts,{integrity:true,halt:true,excl:['scheduler','batch']}) (~:1658). Layer-1 comment + prologue header comments corrected.
- #499b is a genuine #292-discipline false-green proof: real `kaola-workflow-plan-validator.js --freeze` in a real $TMPDIR git repo, control-asserts frozen passes --resume-check, TAMPERS (widen a's declared_write_set), asserts the REAL validator now FAILS --resume-check, then drives the REAL `kaola-workflow-adaptive-node.js open-next` subprocess via execFileSync (NOT an injected stub) → refuse plan_integrity_failed, on-disk ledger 'a' still pending (zero mutation). NOT a mock-only proof.
- #499a (mock wiring, mirrors S387a) is supplementary. COLLATERAL: 12 `--resume-check→ok:true` added to clean/frozen inline open-next mock fixtures (legitimate — clean plans pass; not masking real failures); 1 `ok:false` = the #499a tamper. S391b precedence (integrity Layer-1 passes → halt Layer-2 fires) intact.

## #516 (LOW) — path qualification at the RIGHT surface
- qualifiedEvidenceFile(project,nodeId)→'kaola-workflow/<project>/.cache/<id>.md' (bare fallback when project absent). Applied to dispatch.evidence_file at runOpenNext, runOpenReady, runCloseAndOpenNext fused-advance.
- plan-run CONSUMES dispatch.evidence_file: confirmed commands/kaola-workflow-plan-run.md:118 ("Read the seeded .cache/{node-id}.md (`dispatch.evidence_file`)"). Top-level opened.evidence_file (#444 vestige, line 92) intentionally left bare. Fix lands where the subagent reads.
- On-disk seed/record/verify UNCHANGED (join dirname(planPath)); no double-prefix. reopen-node bare mirror correct (reopened node re-dispatched via fresh open-next whose dispatch.evidence_file is qualified).

## Cross-edition parity
- `node scripts/edition-sync.js --check` → EXIT 0 (12 forge aggregator ports in rename-normalized parity; 4 editions in sync). Run by reviewer, not inherited.
- Spot-checked gitlab + gitea + claude-plugin ports: each carries legCoupled decl, co-open conjunction, groupCeiling<2 branch, #499 integrity:true, qualifiedEvidenceFile (1 each).

## Retired tests (fail-trigger: coverage loss — cleared)
- 6 retirements (D437-OPEN-READY-GROUP, D437-CLOSE-NODE-DEFERRED/-GROUP-PASS/-VACUITY-REFUSE/-CROSS-LANE-STRAY, LEG-BARRIER-CLOSE-PATH-FLAG-OFF) are comment-documented RETIRED-FOR-#498 mentions only (lines 5211/5306-5308/5780), no live test bodies remain.
- Premise genuinely unreachable: after #498, groupForm (which writes lane_group to the running-set) is set ONLY under legCoupled, and legs are provisioned under the SAME conjunction ⇒ every on-disk lane_group has legs ⇒ the liveLegs===null snapshot-union close branch (~:4475 else) cannot be reached via co-open. reconcile/crash-resume repairs existing state but cannot FORM a legless group (open-ready can no longer write one), so the else-branch is dead defensive code (byte-identical degrade kept), not a live path. Covering replacements present and live: LEG-PROVISION-ON (×17), LEG-CLEAN-COMPLETION-NO-LEAK (×11), D437-CLOSE-NODE-FLAG-OFF-SERIAL (×7). No coverage lost.

## Targeted verification (reviewer-run, exit 0)
- node scripts/test-adaptive-node.js → 1007 assertions PASSED
- node scripts/test-parallel-batch.js → 220 assertions PASSED
- node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed"
- node scripts/edition-sync.js --check → 12 ports in parity
- mutation (d): legCoupled drop-resolveLegIsolation → 8 failures (test BITES)
(four-chain #307 gate is the orchestrator's separate finalize step — not re-run here.)

finding: id=R1 scope=in_scope action=none status=resolved severity=high fix_role=none rationale=#498 gate-conjunction fix complete+non-vacuous; mutation (d) proven to bite via #500-NEGATIVE-A
finding: id=R2 scope=in_scope action=none status=resolved severity=high fix_role=none rationale=#499 integrity gate proven real (#499b drives real validator+real open-next subprocess on a real tamper, zero mutation) not a mock false-green
finding: id=R3 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=#516 qualifies dispatch.evidence_file which plan-run:118 consumes; seed/record/verify unchanged
finding: id=R4 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=cross-edition parity green (edition-sync --check) all 4 ports carry the fix
finding: id=R5 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=6 retired group-close tests legitimately unreachable post-#498; coverage preserved by live LEG-PROVISION-ON/LEG-CLEAN-COMPLETION-NO-LEAK/D437-CLOSE-NODE-FLAG-OFF-SERIAL

## #6 refuse-side coverage CONFIRMED (advisor follow-up — read bodies, not counts)
The retired refuse-side safety tests (D437-CLOSE-NODE-VACUITY-REFUSE, -CROSS-LANE-STRAY) have LIVE legs-live successors in the #463-SYNTHESIZER block that assert result:'refuse' on the legs-live close path:
- SYNTH-PARENT-DIRTY-FENCE (~:5859): floated own-lane slip into parent → refuse/parent_dirty, HEAD not advanced, member stays in_progress (cross-lane-stray successor — stronger: commit-based barrier, not the attribution-blind snapshot union).
- SYNTH-SERIAL-CLOSE-FENCED (~:5894): out-of-band serial close of a live lane-group member that would vacuously pass on an empty parent diff → refuse/scheduler_active, member stays in_progress (vacuity-refuse successor).
- SYNTH-OMISSION (no-silent-loss), PARENT-CLEAN-CHECK-UALL (dir-collapse evasion), LEG-BARRIER-OVERFLOW/-COMMITTED/-VACUOUS-BASE/-NO-REF/-ANCESTOR-BACKSTOP — all live refuse-side legs-live coverage.
The retired tests exercised the WEAKER attribution-blind snapshot-union path that #498 makes unreachable; the legs-live commit-based path that replaces it has strictly STRONGER refuse-side coverage. No safety-property coverage lost.
