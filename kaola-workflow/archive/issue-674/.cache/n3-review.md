evidence-binding: n3-review d089b432eb79
verdict: pass
findings_blocking: 0
finding: id=R1 scope=out_of_scope action=follow_up status=deferred severity=low fix_role=none rationale=concur with n2 — the stranded GROUP baseline on the 5 pre-running-set abort paths is a pre-existing adjacent class NOT introduced by #674 (the diff only ADDS member-baseline drops and the -f; it removes no cleanup); harm bounded per n2's live verification (default legged close anchors on the --merge-commit group barrier, not the group baseline; reconcile drops it once the lane_group descriptor persists); recommend filing a follow-up issue at finalize
finding: id=R2 scope=pre_existing action=document status=deferred severity=low fix_role=none rationale=concur with n2 — the SIGKILL/power-loss window between the member-baseline loop and the Phase-1 running-set write predates #674 (journal-after-baselines ordering is untouched by this diff), is unreachable via any refusal return (all helpers in the window are no-throw by construction), and no in-function abort-path code can cover a process kill; needs a journal-ordering redesign or pre-open sweep — its own issue

# G1 code review — issue #674 (open-ready lane-group provisioning)

Scope reviewed: `git diff` — 5 files, 211 insertions / 5 deletions: scripts/kaola-workflow-adaptive-node.js (canonical), the codex twin (plugins/kaola-workflow/...), the gitlab + gitea @generated ports, scripts/test-adaptive-node.js. n1 evidence (n1-open-ready-baseline.md) and n2 adversary evidence (n2-adversary.md, verdict NOT-REFUTED) read first.

## (a) git add -f — PASS

scripts/kaola-workflow-adaptive-node.js:5233 — `execFileSync('git', ['add', '-f', '--', ...seededRelPaths], ...)`. The paths are the per-member evidence stubs returned by seedEvidenceFile (:5220-5224), explicitly enumerated, `--`-separated, never a glob, never `.`. Independently verified the mechanic in a scratchpad fixture (`.cache/` gitignored, ignored junk planted alongside): plain `git add -- <path>` exits 1 with "use -f" (the exact RED-path trigger chaining into stub_commit_failed), `git add -f -- <path>` exits 0 and stages ONLY the enumerated file — the sibling ignored junk is untouched. n2's fixture (`git show --name-only` of the kw-stub commit containing exactly the two stub paths) corroborates. Design intent (stub MUST be tracked so every leg inherits it, per the #633 comment directly above) honored.

## (b) Baseline-drop correctness — PASS

- Coverage: exactly 6 refusal returns exist between the group-baseline record (:5153) and the Phase-1 running-set write (:5332). Drops present at all 5 post-member-baseline aborts: mid-loop baseline_failed (:5214), stub_commit_failed (:5238), leg_provision_failed/baseRev (:5249), leg_provision_failed/provisionLeg (:5263), leg_provision_failed/anchor (:5277). No return between :5284 and :5332 lacks one (none exist). Phase 2's baseline_failed (:5345) fires after running-set.json is journaled — the #385 reconcile-running-set machinery owns that class (n2 executed the exact crash shape and confirmed reconcile drops member + group baselines + refs).
- Tracking exactness: `recordedBaselineIds.push(n.id)` at :5217, immediately after and only after the memberBaseline success check — the refusing member is excluded (prefix-only drop at :5214), all completed members included (full-set drop at the four later aborts). Declared fresh inside the `if (groupForm && legCoupled)` block — no cross-call staleness.
- Primitive, not hand-rolled: dropRecordedBaselines (:5205-5207) shells the validator's `--drop-base --node-id <id>` — read the implementation (plan-validator.js:2962-2990): unlinks the base file, `git update-ref -d` the gc-anchor ref, AND removes the #385 freshness token, each try/catch-wrapped, idempotent (missing file/ref = clean no-op ok).
- No-throw abort-of-the-abort impossible: shellNode (:437) is fail-closed no-throw (returns exitCode 1 + {} on any throw); the helper ignores the envelope, so even a refused drop cannot preempt the refusal return. Window-lock (`drop_base_window_open`) structurally cannot fire: the ledger flip to in_progress happens in Phase 2 (:5334+), strictly after every abort point — every member is still pending.
- group_baseline_failed (:5155) genuinely has no member baseline to leak: it returns before the member loop starts (:5209). Sanity-confirmed structurally; matches n1's audit item 1 and n2's Attack 1.

## (c) Cross-edition byte parity — PASS

`node scripts/edition-sync.js --check` → "10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical." All 4 editions carry BOTH hunks: grep counts dropRecordedBaselines=7 and `'add', '-f', '--'`=1 in each of canonical, codex twin, gitlab port, gitea port. Per-file diffstat identical (36 lines / 35+1 each).

## (d) Real RED→GREEN, discriminating — PASS

- #674a (4 assertions): asserts the real invariant — co-open result ok with 2 opened, lane group [A,B] forms, running-set state open with both legs, both ledger rows in_progress — under a `.cache/`-gitignoring fixture (opts.gitignoreCache; absent ⇒ byte-identical '.kw/\n' for every other caller, verified in makeLaneRepo:5931+). RED without -f is mechanically certain (verified first-hand: unforced add exits 1 → stub_commit_failed) and matches n1's RED transcript (4 failures).
- #674b (4 assertions): forces leg_provision_failed via a decoy worktree pre-holding B's leg branch (placed OUTSIDE repoRoot so parentCarriesProductionDirt cannot misroute), then asserts barrier-base-A is GONE at abort-return time (transactional drop) and that a later serial open + close of A returns ok with NO write_set_overflow on the sibling's landed by.js. RED without the drop: the stale file persists (assert 2 fails) and close refuses write_set_overflow outOfAllow:["by.js"] (assert 4 fails) — exactly n1's 2 recorded #674b failures; n2's planted-stale counterfactual independently executed the reuse→overflow mechanism (non-vacuous).
- Masked-fix coverage: only-f ⇒ #674b still RED (its fixture doesn't gitignore .cache/, abort is decoy-driven, drop absent); only-drop ⇒ #674a still RED (add refuses). Each half is pinned by one test.
- Count arithmetic self-consistent: RED 6 failures + 1791 passed = 1797 total; GREEN 1797 passed = 1789 pre-existing + 8 new (4+4); the 2 new assertions passing even in RED are #674b's abort-fires and serial-open-picks-A (fix-independent by design).

## (e) Surgical — PASS

Write-set is exactly the 5 files. The production diff touches ONLY the `if (groupForm && legCoupled)` leg-provisioning transaction in runOpenReady: +recordedBaselineIds/+dropRecordedBaselines, 5 drop call sites, the one-token add→add -f, and comments. Phase 1/2/3, close-node, reconcile-running-set, serial/read paths, group-baseline handling: untouched. Test diff: the opt-in gitignoreCache fixture knob (default byte-identical) + the two new test blocks; decoy worktree cleaned up.

## (f) Suites + residuals ruling — PASS

- node scripts/test-adaptive-node.js → "adaptive-node tests passed (1797 assertions)", exit 0. Trailing stderr artifact ("index file smaller than expected" / "not a git repository (null)") reproduced exactly as n1/n2 documented — pre-existing suite flake, counts and exit code unaffected.
- node scripts/test-parallel.js --self-test → 13 assertions passed, 0 failed.
- node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed".
- Residuals R1/R2: both genuinely out-of-scope for #674's stated fix (member baselines + git add -f) and correctly deferrable — the diff adds cleanup and forces one enumerated add; it removes no existing cleanup and does not reorder the baseline/journal window, so neither residual is a regression this change introduced. Recorded above as non-blocking deferred findings (concurring with n2). R1 should be filed as a follow-up issue at finalize.

## Verdict

APPROVE. verdict: pass, findings_blocking: 0. Fix (a)+(b) is correct, complete across all 6 in-window abort paths, byte-parity across 4 editions, pinned by two discriminating regressions, and surgical.
