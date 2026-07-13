evidence-binding: n5-adversary d0d32315e98d
verdict: pass
findings_blocking: 0
verdict_rationale: NOT REFUTED — all 3 fixes RED/GREEN-proven for their claimed reasons, no regression, both #679 residuals genuinely harmless; one pre-existing/out-of-scope file-worthy residual (Phase-2 group-baseline strand) does not break the scoped claim.

ATTACK LOG (change-gate n5-adversary, bundle-677-678-679 @ 883a4746 vs main 00b1877e)

== Setup ==
- GREEN on HEAD: claim-hardening 185, gap-sweep 79, adaptive-node 1820 — all pass.
- Cross-edition completeness verified: #677 lstat gate, #678 dropGroupBaseline() (x5 in EACH
  of the 4 editions), #679 foreign_run_gaps_output guard all present in scripts/ + all 3 plugin trees.
- Every RED reproduced by reverting the canonical file to main, running, then restoring (final
  `git status --porcelain --untracked-files=no` clean; source byte-identical to HEAD).

== #677 worktreeDirtyState (claim.js:480) ==
- RED reproduced (#677b): pre-fix `!fs.existsSync(wtPath)` reads false under a chmod-000 parent,
  so a genuinely-PRESENT legacy worktree was misclassified 'missing' -> pruned + branch DELETED
  ("removed must NOT include...", "skipped_unprobeable...[]", "registration must SURVIVE" — 3 fails,
  182 passed). Post-fix keeps it (unprobeable). Genuine defect, genuine fix.
- Attacks that FAILED to refute:
  * Normal existing-and-clean path: lstat succeeds -> git status -> clean/dirty, byte-unchanged.
  * lstat vs existsSync only shifts EXOTIC non-ENOENT cases (ENOTDIR ancestor-is-file, EACCES parent,
    dangling symlink) from 'missing'(prune) -> 'unprobeable'(KEEP) — the fail-SAFE direction, loudly
    reported as skipped_unprobeable. Common dead worktree (rm -rf leaf) still lstat->ENOENT->'missing'
    ->prune, UNCHANGED. Both destructive consumers keep 'unprobeable' unconditionally
    (cmdStaleWorktreeCleanup claim.js:2973, cmdLegacyWorktreeCleanup claim.js:3567) — verified.
  * "genuinely-absent under a file-ancestor becomes unprobeable" (ENOTDIR) does leak a dead
    registration, but safely + loudly, and git's own `worktree prune` still reclaims it. Acceptable
    per the #672/#677 fail-closed philosophy; not destructive, not a regression.

== #678 dropGroupBaseline at 5 group-form aborts (adaptive-node.js runOpenReady) ==
- RED reproduced: pre-fix the SHARED GROUP baseline FILE + REF BOTH stranded on the
  leg_provision_failed abort (file exists=true, ref exists=true). Post-fix both dropped (GREEN).
- Attacks that FAILED to refute:
  * All 5 leg-provisioning abort sites (baseline_failed 5230, stub_commit_failed 5256, 3x
    leg_provision_failed 5269/5285/5301) call dropGroupBaseline() — verified in all 4 editions (x5).
  * Double-free / spurious-drop: dropGroupBaseline is guarded on groupBaselineSha, which is non-null
    at every one of the 5 sites (the `if(groupForm)` group-record gate at 5152-5158 already succeeded
    upstream or returned group_baseline_failed). --drop-base is idempotent; group_id has no ledger row
    so the #424 window-lock never blocks it, and all member rows are still `pending` (Phase 2 not
    reached) — so the drop genuinely executes (GREEN confirms file+ref gone). No live-baseline free.
  * groupForm ==> legCoupled invariant verified at ALL 3 groupForm assignment sites (4949 guarded by
    the 4910 `if(!legCoupled)` exclude; 5020 guarded by `if(legCoupled && writeNodes>=2 ...)` 4996;
    5100 guarded by the 5074 `if(!legCoupled) return`). So the group baseline is NEVER recorded
    without the leg-provisioning block (owner of dropGroupBaseline) also running — no groupForm-but-
    not-legCoupled strand. The R2b legless-writer path (5081-5089) sets NO groupForm -> no group
    baseline -> nothing to strand.
  * RED authenticity: the #678 test forces the SAME #674b decoy-worktree leg_provision_failed, which
    fires strictly AFTER the group baseline is recorded — it exercises a REAL one of the 5 sites, not
    a vacuous/unrelated path. Not a false positive.

== #679 foreign_run_gaps_output guard (gap-sweep.js runScan ~199) ==
- RED reproduced (T14): pre-fix a LIVE-project scan with --output at an EXISTING archived
  run-gaps.json silently CLOBBERED it (byte-changed). Post-fix refuses `foreign_run_gaps_output`,
  archived file byte-unchanged. Genuine defect, genuine fix. T15 proves no over-refusal of a
  legitimate own-project --output.
- Residual (a) `&& fs.existsSync(outputPath)`: LIVE-fixture confirmed — scan for proj-x with --output
  at proj-y's NON-EXISTENT run-gaps.json is NOT refused; a stray artifact labeled "project":"proj-x"
  is written into proj-y/.cache/. HARM ASSESSMENT (why this does NOT refute): no machine consumer
  reads a foreign/archived run-gaps.json (grep of claim.js/adaptive-node.js/walkthrough: archived
  run-gaps.json is inspection-only per the #675 message; the ONLY machine reader is runCheck against
  the project's OWN default path); the finalize flow always scans-then-checks the OWN path, which
  overwrites any stray before consumption; and NOTHING pre-existing is destroyed (the guard's
  existsSync clause deliberately fires only when there is something to clobber — which IS #679's
  stated scope). Triggering harm needs a contrived manual cross-project --output + check-without-scan.
  Low harm, distinct from the fixed clobber-existing property. FILE-WORTHY (belt-and-suspenders).
- Residual (b) path.resolve (lexical) vs fs.realpathSync: NOT exploitable for a stealth clobber.
  resolve(A)===resolve(B) iff identical normalized string iff same on-disk target — a symlink cannot
  make two DIFFERENT real targets share a normalized string, so the guard can never "think own but
  write foreign". LIVE-fixture confirmed: --output through a symlink pointing at an EXISTING foreign
  run-gaps.json still REFUSES (KEEPME preserved). The symlink case only ever produces safe
  over-refusal, never data loss. Harmless.

== The one file-worthy residual (does NOT refute the scoped claim) ==
PHASE-2 GROUP-BASELINE STRAND: the 2 Phase-2 aborts in runOpenReady — baseline_failed (~5368) and
node_not_in_ledger (~5374) — do NOT call dropGroupBaseline (nor dropRecordedBaselines). The reviewer's
carve-out ("Phase-2 aborts intentionally don't drop; ledger flipping -> --drop-base illegal") is
FACTUALLY WRONG about the mechanism: the on-disk ledger is not written until `writeFile(planPath,
planContent)` AFTER the whole Phase-2 loop (~5384), so at both abort points the on-disk ledger is
still all-`pending` and --drop-base WOULD be legal (and the group_id has no ledger row regardless).
So these 2 aborts strand the group baseline (same vrpai-cli#948 reuse-misattribution harm model as
the 5 fixed sites). WHY IT DOES NOT REFUTE: for a GROUP open, Phase 2's `commit-node --start`
idempotently REUSES the Phase-1 baseline and node_not_in_ledger requires a concurrent ledger mutation
— both are crash/race-window-only, NOT reachable via any ordinary deterministic condition (unlike the
5 leg-provisioning aborts, which fire on ordinary worktree collisions). It is PRE-EXISTING (#678 never
touched Phase 2; the sibling member-baseline strand there is an equally-untouched #674 residual) and
NON-REGRESSIVE. It belongs to the crash-window family already deferred to #680. R1 is correct AND
complete for its declared 5-site scope.
PROPOSED FOLLOW-UP: extend #680 (or file a sibling) to (1) drop the group + member baselines at the 2
Phase-2 aborts too, and (2) correct the "--drop-base illegal" justification comment.

VERDICT: NOT REFUTED (confidence: high). Every attack on the 3 fixes' correctness failed; no
regression; both #679 residuals are genuinely harmless-and-out-of-scope; the single characterized
residual is pre-existing, crash-window-only, non-regressive, and legitimately deferrable to #680.
