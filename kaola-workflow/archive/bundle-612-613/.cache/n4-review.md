evidence-binding: n4-review a1d4cdbf045d
verdict: pass
findings_blocking: 0

finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=#612 fail-closed mirror correct; return-contract skipped/true/false matches mirrored===false call-site
finding: id=R2 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=#613 self-SIGTERM shim reproduces err.signal===SIGTERM that closure-audit classifies as timeout; deterministic
finding: id=R3 scope=out_of_scope action=document status=open severity=low fix_role=none rationale=n3 CHANGELOG #612/#613 entries present but UNCOMMITTED in working tree; commit before the receipt run to avoid chains_stale

# n4-review — gate over merged n1-fix612 + n2-fix613 + n3-docs

Reviewed the full accumulated diff git diff a993091d..HEAD (merge commit 39b3d259).
8 files, +219/-48. No CRITICAL/HIGH. Zero blocking findings. Verdict: PASS.

## Fix 1 — #612 (writeRunProgressMirror fail-closed)

- scripts/kaola-workflow-adaptive-node.js:889-908 — new 6th param mainRootTrusted.
  Fail-closed guard at :898 if (!mainRootTrusted && !fs.existsSync(projectDir/workflow-plan.md)) return 'skipped'.
  Return contract is now tri-valued: 'skipped' (truthy, silent), true (success),
  false (catch -> genuine write failure). Correct.
- Call site :6071 threads mainRootFromField; :6072 check changed !mirrored -> mirrored === false,
  so the truthy 'skipped' sentinel no longer trips the run_progress_mirror:"failed" warn. Correct.
- mainRootFromField set true only when workflow-state.md main_root: field is present (:5799),
  false on the getMainRoot git-common-dir heuristic. The leak class (heuristic root fabricating a
  foreign kaola-workflow/<project>/ tree) is now closed.
- Single caller per edition; all pass the trust flag; function exported but no stale internal caller.
- Fixtures scripts/test-adaptive-node.js T612-escape / T612-legit: REAL subprocess + REAL git
  worktree under $TMPDIR. Escape asserts the foreign mirror is NOT written AND no warn field surfaces;
  Legit asserts the owned-project mirror IS still written (no #605 regression). Both graceful-skip when
  git worktree add unavailable. Well-constructed.

## Fix 2 — #613 (timeout-probe self-SIGTERM)

- Shim swap setInterval(()=>{},1<<30) -> process.kill(process.pid,'SIGTERM'); setInterval(...) in
  scripts/simulate-workflow-walkthrough.js + gitea/gitlab test files. The self-SIGTERM makes
  execFileSync throw with err.signal === 'SIGTERM', which the PRODUCTION classifier
  kaola-workflow-closure-audit.js:150/203/278 (err.killed || err.signal==='SIGTERM' || err.code==='ETIMEDOUT')
  treats as timeout — identical error shape, deterministic, no OS-timer race. Faithful.
- Label-removal case (testClosureAuditExecuteLabelRemovalTimeoutBreaks, walkthrough:10372) drops
  probeTimeoutEnv() so the must-SUCCEED issue list detection uses the default budget while the
  remove-label call self-SIGTERMs. This test exists ONLY in the claude walkthrough, so the budget
  widening being claude-only is correct — NOT a cross-edition gap.

## Cross-edition consistency (#307)

- All 4 *-adaptive-node.js copies carry BYTE-IDENTICAL normalized diff hunks (2616 bytes each; pairwise diff -q identical).
- kaola-workflow-adaptive-schema.js (the byte-identical-x4 drift anchor): ZERO diff vs base; md5
  748bf1b2ad63d663095306ec217fdcfb identical across all 4 copies post-merge. Untouched as required.

## Leg isolation / write-set compliance

- n1 leg (70375af2) touched: 4x adaptive-node.js + test-adaptive-node.js. Did NOT touch
  simulate-workflow-walkthrough.js.
- n2 leg (51808263) touched: walkthrough + gitea/gitlab test files. No file overlap between legs.
- All 8 changed files are within the n1/n2 declared write sets. CHANGELOG.md (n3) is an accurate but
  UNCOMMITTED working-tree change (R3) — commit it before the receipt/finalize run.

## Four-chain verification (#307) — ACTUAL MERGED WORKTREE

KAOLA_RUN_CHAINS_CONCURRENCY=serial npm run test:kaola-workflow:{claude && codex && gitlab && gitea}
-> overall exit code 0. All four chains GREEN.

- claude: adaptive-node tests passed (1399 assertions) (covers T612-escape/T612-legit — silent-on-pass),
  Workflow walkthrough simulation passed.
- codex / gitlab / gitea: each walkthrough + Codex walkthrough + active-folders parity passed.
- #613 targeted: testClosureAuditExecuteDetectionTimeoutPropagates: PASSED,
  testClosureAuditExecuteLabelRemovalTimeoutBreaks: PASSED.
- Zero failure markers (no AssertionError / tests FAILED / npm error / non-zero Exit status).
- 4x EISDIR lines in output are the EXPECTED #588-TASKMIRROR-FAILOPEN fail-open probe subprocesses
  (test-adaptive-node.js:6831-6840 deliberately makes workflow-tasks.json a directory), not failures.
