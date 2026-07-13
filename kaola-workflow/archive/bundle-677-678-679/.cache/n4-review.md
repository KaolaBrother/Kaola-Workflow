evidence-binding: n4-review 8fe77b9f5fd0
verdict: pass
findings_blocking: 0
verdict_rationale: APPROVE — all three legs close their declared defects with genuine RED tests, no new fail-open or over-refusal, cross-edition parity machine-clean, scope disciplined, walkthrough + all three suites green.

## What was verified
- git diff main...HEAD = 18 files exactly: 3 canonical + 3 codex + 3 gitlab + 3 gitea (claim/adaptive-node/gap-sweep) + 3 test files + 3 evidence files. No out-of-scope edits; each leg touched only its declared files.
- edition-sync --check: clean (10 forge aggregator ports, 24 COMMON mirrors, 27 byte-identical groups in parity). validate-script-sync: clean (24 common, 27 byte-identical, 8 rename-normalized families, 7 export-superset families in sync).
- Fix content present in ALL 4 editions: lstatSync x1 each; foreign_run_gaps_output x1 each; dropGroupBaseline x6 each (1 def + 5 call sites).
- Suites: test-claim-hardening 185 assertions PASS; test-adaptive-node 1820 PASS; test-gap-sweep 79 PASS; simulate-workflow-walkthrough exit 0 ("Workflow walkthrough simulation passed"). (GitHub-API + "致命错误" git noise is expected fault-injection/offline-fallback output, not failures.)

## RED-test genuineness (reverted each canonical script to main, ran the new test)
- #679 T14: pre-fix FAILS with "result = swept" + archived run-gaps.json byte-changed (the clobber actually happens) -> genuine reproduction of the exact defect. T15 (legit own-.cache/ --output) stays GREEN pre-fix -> no over-refusal introduced.
- #678: pre-fix FAILS with group baseline FILE exists=true AND REF exists=true post-abort (the strand) -> genuine. Ledger-untouched asserts hold in both.
- #677b: pre-fix FAILS — parent-unreadable worktree is destructively `removed` (chmod-000 -> existsSync false -> 'missing' misroute) -> genuine. #677a is a coverage-gap regression guard for cmdStaleWorktreeCleanup's PRE-EXISTING #672 unprobeable-keep path (correctly PASSES pre-fix, not a tautology: it fails if that consumer's unprobeable handling regresses).

## Correctness judgments on the review focus
- #677 lstatSync is the RIGHT probe: it does not follow symlinks (a dangling link at wtPath is a real entry, correctly kept 'unprobeable' rather than statSync-chased to ENOENT/'missing'); accessSync could not cleanly separate ENOENT from EACCES. EACCES-on-parent throws EACCES (not ENOENT) since traversal is blocked, so err.code!=='ENOENT' -> 'unprobeable' keep. Distinguished correctly. Both destructive consumers (legacy- and stale-worktree-cleanup) already treat 'unprobeable' as unconditional keep.
- #678 dropGroupBaseline: group baseline recorded ONCE before the leg block; helper guarded on groupBaselineSha; invoked at ALL 5 leg-block abort sites (baseline_failed, stub_commit_failed, and the 3 leg_provision_failed variants). Never invoked before the record (guard) and correctly NOT dropped after success (it becomes lane_group.baseline). Phase-2 aborts intentionally do not drop (ledger is flipping -> --drop-base would hit drop_base_window_open) — this matches #674's own boundary, not a new gap.
- #679 own-artifact comparison: outputPath is already path.resolve(root,val) at parse time and ownArtifactPath is absolute; the !== guard is robust for the workflow's own fixed write path. basename + not-own + existsSync gate is sound for the clobber case.

## Non-blocking observations (advisory; do NOT block merge)
1. #679 residual (by design): the refusal is gated on `fs.existsSync(outputPath)`, so an explicit --output aimed at a NON-existent run-gaps.json inside an archive/foreign tree still writes a fresh artifact there. This destroys no evidence (nothing to clobber) and matches the fix's stated scope ("nothing there to clobber"), but it does permit creating a stray run-gaps.json in an archive dir. Candidate follow-up if writing into a foreign tree at all is undesirable.
2. #679 symlink edge: own-vs-foreign uses path.resolve (lexical normalize), not fs.realpathSync (canonical). A symlinked path could theoretically misjudge own-vs-foreign, but there is no concrete trigger in the workflow's own fixed .cache/ write path. Theoretical only.
3. #678 R2 defer to #680: the SIGKILL window between recording the group baseline and reaching the drop is inherently a journal-ordering problem (not closable by a synchronous try/catch drop; needs reconcile-side handling). Deferring the M-effort redesign is defensible — a defensible defer, not a blocking finding.
