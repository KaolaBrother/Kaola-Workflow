verdict: pass
findings_blocking: 0

finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=AC1-AC2-AC3 all correct against their AC; both test suites green; byte-mirrors identical
finding: id=R2 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=phase6 {project} is the established render-substitution token (lines 29/377/564/619 etc) so the FOREIGN_ARCHIVE guard resolves correctly at runtime; no literal-token regression
finding: id=R3 scope=pre_existing action=document status=open severity=low fix_role=none rationale=AC1 phase6 bash guard has no executed-test harness (markdown command template); correctness rests on manual trace plus the established {project} substitution pattern shared with AC2 fix-2 suffix logic; consistent with how all other phase6 bash blocks are validated

# G1 Review Gate — issue #261 (archive-pollution blind spot)

## Scope reviewed
Three coordinated fixes post-dominated by this gate (read-only design node excluded):
- AC2 narrow-finalize: cmdFinalize in scripts/kaola-workflow-claim.js (+ byte-mirror)
- AC3 gate-carveout: barrierCheck in scripts/kaola-workflow-plan-validator.js (+ byte-mirror)
- AC1 staging-guard: FOREIGN_ARCHIVE detector in 3 phase6.md editions
Plus tests: scripts/simulate-workflow-walkthrough.js, scripts/test-commit-node.js.

## Verification performed
- node scripts/simulate-workflow-walkthrough.js -> PASSED (incl. new testFinalizeNarrowStagingExcludesForeignArchive)
- node scripts/test-commit-node.js -> passed (32 assertions, incl. new test 6a-6d)
- Byte-identity: scripts/ vs plugins/kaola-workflow/scripts/ for claim.js AND plan-validator.js -> IDENTICAL
- phase6 inserted block: github == gitlab == gitea -> IDENTICAL across all 3 editions

## AC2 narrow-finalize (cmdFinalize) — CORRECT
- Replaces broad `git add -A kaola-workflow/` with `git rm -r --cached --ignore-unmatch -- kaola-workflow/<project>` (stages the rename DELETION side) + existsSync-guarded `git add -A -- <relDest> .roadmap ROADMAP.md` (stages the ADD side + roadmap-source deletion + ROADMAP regen).
- `--ignore-unmatch` makes the rm a clean no-op on a fresh-finalize (untracked live folder) path: no spurious error, no orphan stage.
- result.dest always exists when archive succeeded (it is the renameSync target); the only skip path is source-missing, where the rm is also a no-op. A deletion-only stage is impossible with a real archive; even if it occurred, `git diff --cached --quiet` returns non-zero -> the commit fires and captures it.
- `git add -A -- kaola-workflow/.roadmap` (dir-scoped, existsSync-guarded) correctly stages the unlinked issue-N.md deletion plus ROADMAP.md regen.
- Regression test is real RED->GREEN: the old `git add -A kaola-workflow/` would have swept the planted issue-999 foreign archive into HEAD; the narrowed staging excludes it (asserted) while still committing issue-701 archive + ROADMAP.md + live-folder deletion.

## AC3 gate-carveout (barrierCheck) — CORRECT
- foreignArchive regex `^kaola-workflow/archive/([^/]+)/` is correct; own project (and `.archived-<ts>` suffix via startsWith) stays exempt, foreign refused.
- Fail-closed branch (`!archiveProj => return true`) is SAFE for all callers: projTag (line 1003) is always derived from the plan parent dir and non-empty, and is threaded to BOTH per-node and whole-plan paths (line 1072). The only no-project caller is the external test-commit-node 6d, on a NON-archive path -> foreignArchive false -> unaffected.
- Dedup is correct: a foreign-archive path is dropped from `production` (no double-report through sensitivity/allowlist) but unconditionally pushed to `errors` -> refuse regardless, so a sensitive write cannot be silently laundered.
- Threading `project: projTag` touches only the single in-repo call site (1072); barrierCheck is exported but has no other in-repo caller.
- New test-commit-node assertions (6a foreign refuse, 6b own pass, 6c suffix pass, 6d backward-compat) cover the matrix.

## AC1 staging-guard (phase6 bash x3) — CORRECT
- `{project}` is the established render-substitution token used pervasively in phase6.md inside live bash blocks (PLAN=, node -e state reads, SINK_STATE_FILE, --project {project}); the new block inherits the same substitution -> resolves to the finalized project at runtime.
- Pipeline is POSIX-portable: `awk -F'/' 'NF>=3 {print $3}'` extracts the archive project segment, `sort -u` dedups, `grep -v -E -x "{project}(\.archived-.*)?"` full-line-anchored removes the own band (the `.archived-` literal separator prevents prefix collisions e.g. issue-2 vs issue-26), `|| true` keeps it set-e safe. Sits before the PROJECT_COUNT block and does not alter it.

## Scope discipline — CLEAN
Change set maps exactly to the 3 fixes + 2 test files. Untracked kaola-workflow/issue-261/ is this run's own active state (not a committed artifact); correctly not part of the change.

## Verdict
APPROVE. No CRITICAL or HIGH findings. The advisory follow-up (R3: AC1 lacks an executable test harness) is consistent with how every other phase6 bash block is validated and is non-blocking.
