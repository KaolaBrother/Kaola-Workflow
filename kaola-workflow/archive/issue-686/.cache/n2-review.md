evidence-binding: n2-review 0d5689b3e4c9
verdict: pass
findings_blocking: 0
upstream_read: n1-reap-sweep e725d95472fb

finding: id=R8 scope=in_scope action=fix status=resolved severity=high fix_role=none rationale=present-but-unreadable workflow-state.md (EACCES chmod-000 + EISDIR) now KEPT via sweep-local keep-pass (c) at claim.js:3264-3277; cross-root repro executed (both live anchors survived), mutation-kill proven (neutralize keep.add → exactly the 4 R8 assertions RED, 241 passed), not keep-everything (dead-no-folder + empty-folder still reaped), sweep-local (shared active-folders.js untouched), parity ×4
finding: id=R9 scope=in_scope action=fix status=resolved severity=low fix_role=none rationale=#690 discharged in-run — nlPath686g hoisted above the R6 try, finally removes the sibling worktree dir (guarded by `if (nlPath686g)`); executed: today's runs leave tmpdir clean, stale pre-fix leak removed; close #690
finding: id=R10 scope=pre_existing action=follow_up status=deferred filed=#691 severity=low fix_role=none rationale=chmod-000 project DIRECTORY variant still reaped (existsSync returns false on EACCES-through-parent, so keep-pass (c) skips it); pre-dates the R8 delta, narrower + more exotic (self-inflicted chmod-000 on a live project dir, no shipped flow produces it); filed #691 with the exact statSync-ENOENT-vs-fault fix; narrows not widens under R8

# n2-review re-review (attempt 4) — R8 fix + #690 discharge

## 1. R8 closed (executed, cross-root)
Fresh scratch repo, live projects in a LINKED worktree, sweep from the MAIN root: (a) EACCES chmod-000 state file,
no running-set.json → tagsKept includes issue-eacceslive, ref survived; (b) EISDIR (state file is a directory) →
issue-eisdirlive kept. In-suite R8a (root-skip guarded via getuid) + R8b green in 245. Fix at claim.js:3264-3277:
existsSync distinguishes present-vs-absent, readFileSync throw → keep.add; success adds nothing.

## 2. Not keep-everything (executed)
Same single sweep: issue-deadnofolder (no folder) REAPED; issue-emptyfolder (dir, no state file) REAPED
(existsSync false → continue, no false keep). R8a/R8b each also assert their co-located dead tag reaped.

## 3. Sweep-local (verified)
git diff = exactly the 5 declared files; shared active-folders.js UNTOUCHED in every edition. Pass (c) reuses the
same `entries` listing as pass (b) (no extra readdirSync), identical entry guards, only effect is keep.add
(additive-only); a readFileSync throw is the catch body → cannot trip the outer whole-sweep abort.

## 4. Mutation-kill (executed)
Neutralize the pass (c) keep.add (line 3274) → RED with EXACTLY the 4 R8 assertions failing (241 passed), mutated
sweep reaped both live anchors. Restore cmp byte-identical → 245 green; canonical↔codex cmp identical.

## 5. #690 discharged (executed)
`let nlPath686g;` hoisted at test-claim-hardening.js:2663 above the try (2664); finally (2705-2708) references it
guarded by `if (nlPath686g)` — in scope, no ReferenceError. tmpdir forensics: one STALE pre-fix leak
(mtime 2026-07-14T21:00Z) existed; today's runs created zero new; removed the stale, re-ran → 245 green, tmpdir
clean. Leak closed → close #690.

## 6. No regression (executed)
245 assertions green (run 4×). All prior markers present: R1 ×4, R4 ×9, R5 ×3, R6 ×5, R7 ×5, enum-fail seam,
archive reap ×10, fail-soft ×4, collision ×11, running-set keep ×14, leg-base ×6.

## 7. Edition parity (executed)
edition-sync.js --check green (10 ports, 24 mirrors, 27 byte-identical groups); validate-script-sync OK; keep-pass
(c) `#686 R8` present ×2 in all 4 copies; canonical↔codex cmp byte-identical.

## Residual (R10, non-blocking, filed #691)
A chmod-000 project DIRECTORY (unprobeable through the unsearchable parent) is still reaped — executed
(tagsDeleted=["issue-dirlocked"]). existsSync returns false on EACCES-through-parent, so keep-pass (c) skips it.
NOT the R8 finding (both R8 shapes closed + mutation-killed); pre-dates the delta; narrows under it. Fix
(statSync ENOENT-vs-fault distinction) filed #691.

APPROVE — R8 closed (executed, mutation-killed, not keep-all), #690 discharged (executed), zero regressions across
245, parity ×4. Change gate passes.
