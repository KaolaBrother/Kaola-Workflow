evidence-binding: n2-adversary 08733880cbe7
verdict: pass
findings_blocking: 0
finding: id=R1 scope=out_of_scope action=follow_up status=deferred severity=low fix_role=none rationale=group baseline (barrier-base-lg-<members> file + gc-anchor ref + open token) is stranded on ALL 5 pre-running-set abort paths — the fix drops member baselines only; verified live (file=true ref=true after leg_provision_failed and stub_commit_failed aborts); harm bounded: default legged close uses the --merge-commit group barrier (baseline not the diff anchor), lg- id deterministic so a retried group open reuses it but a stale anchor only bites the near-dead legless-group close path; reconcile DOES drop it once the lane_group descriptor persisted (verified); pre-existing class, not introduced by #674
finding: id=R2 scope=pre_existing action=document status=deferred severity=low fix_role=none rationale=hard-crash window (SIGKILL/power/injected-io throw) between the member-baseline loop and the Phase-1 running-set write strands member baselines with NO journal — a later serial open silently reuses them (same-HEAD, #385 WARN needs head-advanced) reproducing the #948 signature; NOT reachable via any refusal return (all audited helpers are no-throw); no in-function abort-path code can cover a process kill; journal-after-baselines ordering predates #674

## Claim Under Test
"For #674, open-ready's lane-group provisioning is fixed: (a) seeded stubs are `git add -f`'d so a consumer that gitignores `.cache/` co-opens successfully instead of `stub_commit_failed`; (b) on EVERY group-form abort path AFTER member baselines are recorded, the recorded member baselines (base file AND gc-anchor ref) are transactionally DROPPED, so a later SERIAL member open re-records a fresh baseline and its close barrier never misattributes a sibling's files as `write_set_overflow`."

## Disproof Attempt

### Attack 1 — abort-path completeness (the crux): NOT falsified
Audited runOpenReady's group transaction end-to-end (scripts/kaola-workflow-adaptive-node.js :5152-5332).
Exactly 6 refusal returns exist between the group-baseline record and the Phase-1 running-set write:
- :5155 group_baseline_failed — fires strictly BEFORE the member loop (:5209); no member baseline can exist; a failed group --record-base leaves at most a dangling ref (anchorBase runs before the file write), which a fresh re-record overwrites. n1's out-of-scope claim TRUE.
- :5215 mid-loop baseline_failed — drops recordedBaselineIds (prefix; failing member correctly excluded).
- :5239 stub_commit_failed, :5250 leg_provision_failed (baseRev), :5264 leg_provision_failed (provisionLeg), :5278 leg_provision_failed (anchor) — all drop the FULL set first.
No throw can escape the window: shellNode (:437), seedEvidenceFile (:615), appendNodeTiming (:500), provisionLeg (:4433, assertSafeLegBranch caught internally), teardownLeg (:4454), legMirrorPath (:4374) are all no-throw by construction; the raw git execFileSync calls are try/catch-wrapped into dropping refusals. No continue/break skips a drop. --drop-base is never window-locked here: no ledger row flips before Phase 2 (and even a Phase-2 refuse returns before the plan write at :5361), confirmed empirically (drops succeeded in every repro).

### Attack 2 — partial-drop: NOT falsified (executed)
Independent repro (scratchpad repro-674.js, real subprocesses in a real git fixture): forced leg_provision_failed via a decoy worktree pre-holding B's leg branch. After the abort: barrier-base-A/B files GONE, barrier-open-A/B freshness tokens GONE, refs/kaola-workflow/barrier/test-project/{A,B} GONE (git for-each-ref). Then landed sibling by.js in the shared tree, serial-opened A (fresh baseline re-recorded), closed A → result ok, NO write_set_overflow.
Counterfactual (non-vacuousness): on a fresh fixture, PLANTED a stale baseline for A at T0 via --record-base, landed by.js, serial open (silent idempotent reuse — HEAD unchanged so the #385 WARN does not fire), close → refuse write_set_overflow outOfAllow:["by.js"]. The green close above is therefore a real signal, and the reuse mechanic is exactly as claimed.
Second abort variant constructed beyond the shipped test (stub_commit_failed via failing pre-commit hook at an EXTERNAL core.hooksPath — snapshotWorktree/anchorBase are plumbing, immune): same FULL drop (file+ref+token for both members), then hook removed, sibling landed, serial reopen + green close. Third variant (mid-loop baseline_failed: barrier-base-B planted as a directory → EISDIR in the validator): refuse baseline_failed nodeId:B; A's file+ref+token dropped; B's dangling ref residual is harmless (fresh re-record overwrites the ref; --barrier-check requires the file first).

### Attack 3 — git add -f scope: NOT falsified (executed)
Fixture with `.cache/` gitignored + planted ignored junk (.kw/junk-ignored.txt, .cache/junk-ignored.bin) before open-ready: co-open returned ok with 2 opened, running-set state open with legs A+B, both ledger rows in_progress (no serial degrade). `git show --name-only` of the kw-stub HEAD commit contains EXACTLY kaola-workflow/test-project/.cache/{A,B}.md — no ignored junk swept in. The -f add is per-enumerated-path (seedEvidenceFile returns), never a glob.

### Attack 4 — alternate stale-reuse routes: claims verified
group_baseline_failed: structurally no member baseline exists (loop not yet entered) — TRUE, no leak of member baselines.
Phase-2 baseline_failed: fabricated the exact crash shape (running-set state:'opening' with opening:true members + legs, ledger rows pending, group+member baselines recorded). open-ready refuses reconcile_first; reconcile-running-set rolled back A,B and dropped BOTH member baselines AND the group baseline AND every ref (for-each-ref empty), tearing down legs. n1's "distinct path, already covered" claim CONFIRMED by execution.
Residuals found (do not break the claim): R1 stranded GROUP baseline on the 5 pre-running-set aborts; R2 hard-crash window before the Phase-1 journal write. Both recorded above as non-blocking findings. Minor nit (no finding): dropRecordedBaselines ignores the --drop-base envelope, and --drop-base reports ok/fileRemoved:false on a genuinely-failed unlink (EACCES-class fs fault on the workflow's own .cache) — exotic, unconstructible in a healthy fixture.

### Attack 5 — suites: all green
- node scripts/test-adaptive-node.js → "adaptive-node tests passed (1797 assertions)" (matches n1's GREEN count; trailing "index file smaller than expected / not a git repository (null)" stderr artifact reproduced exactly as n1's documented pre-existing flake — exit 0, counts unaffected).
- node scripts/test-parallel.js --self-test → 13 assertions passed.
- node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed".
- node scripts/edition-sync.js --check → "10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical."
- All 3 edition ports carry BOTH fix hunks (dropRecordedBaselines ×7, add -f ×1 in each, matching canonical). Write-set = exactly the 5 files per git status.

## Verdict
NOT-REFUTED (confidence: high)
Three independently-constructed abort variants + a planted-stale counterfactual + the Phase-2 reconcile shape all behave exactly as claimed; the two residuals found are pre-existing, out-of-scope, and non-blocking.
