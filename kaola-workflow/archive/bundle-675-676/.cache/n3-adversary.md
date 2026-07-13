evidence-binding: n3-adversary 68fabfc80328
verdict: pass
findings_blocking: 0

# n3-adversary (CHANGE-GATE, RE-VERIFICATION) — bundle-675-676 #676 free-form-node-id repair

Burden inverted; I tried to DISPROVE the repaired claim and could not. My prior R1 refutation is
genuinely closed with no false-refuse, full cross-edition parity, all suites green. verdict: pass.

## Attack 1 — RE-RUN my original refutation (the crux) — COULD NOT REFUTE (repair holds)
Called the REAL exported claim.verifyArchiveComplete(src,dest) on the exact bundle-414-418-422 shape
(.cache = design/docs/finalize/parity-anchor/parity-validators/review/t414/t418-*.md) with a faithful
recursive copy that DROPS one file. Also reimplemented the pre-fix narrow glob /^n\d*-.+\.md$/ inline
to show the RED it produced:
 (1a) drop .cache/review.md  -> NEW {"ok":false,"missing":[".cache/review.md"]}  ;  OLD glob {"ok":true} (the R1 hole)
 (1b) role-named (planner/code-reviewer/security-reviewer/architect/tdd-task-1), drop code-reviewer.md
      -> NEW {"ok":false,"missing":[".cache/code-reviewer.md"]}  ;  OLD glob {"ok":true}
 (1c) bare n1.md (no dash — old glob REQUIRED a dash) drop -> NEW {"ok":false,"missing":[".cache/n1.md"]} ; OLD {"ok":true}
Every free-form / role-named / bare node-evidence drop that PREVIOUSLY silently passed (both live copies
deleted) now refuses BEFORE deletion. 16/16 direct assertions PASS.

## Attack 2 — can a real node-evidence name still slip the net? — NO real slip
- Denylist scope: grepped every writer. All 5 are FIXED-NAME machinery, never per-node gate evidence:
  final-validation.md (plan-validator finalize gate, plan-validator.js:3525), run-gaps-manual.md
  (gap-sweep.js:113 fixed path), selection-evidence.md (router sidecar), doc-docking.md + doc-updater.md
  (finalize SKILL.md steps 3/4, fixed .cache paths). In the role-named archive branch-issue-merge-sink,
  doc-updater.md/doc-docking.md are the FINALIZE SUB-STEP outputs, not plan nodes.
- Non-recursive readdir does NOT miss node evidence: ALL node evidence is written flat
  path.join(dirname(planPath),'.cache',nodeId+'.md') (adaptive-node.js:1605 etc.); the real archive
  .cache/ is verified FLAT (no subdirs). No node-evidence .md lives in a .cache/ subdir.
- No archived run ever named a plan node like a sidecar: find for barrier-base-doc-updater /
  -doc-docking / -final-validation / -selection-evidence / -run-gaps-manual across kaola-workflow/archive
  returned ZERO. Sidecar-name/plan-node collision is theoretical only (see N1) and pre-existing (finalize
  sub-steps clobber such a node's evidence at finalize time regardless of the archive gate).

## Attack 3 — false-refuse hunt on a FAITHFUL archive — COULD NOT force a false-refuse
- copyDir (claim.js:3070) is fully recursive and unfiltered => dest is a strict superset of source, so
  required (= source top-level {plan,state,finalization-summary,fast-summary} + source .cache/*.md minus
  sidecars + unconditional workflow-state.md) is always a subset of dest on a genuine copy. Faithful copy
  with free-form + role-named + bare + sidecars + non-.md (run-gaps.json / node-timings.jsonl /
  barrier-base-*) -> {"ok":true,"missing":[]}.
- Nothing writes to source BETWEEN copyDir and verify (synchronous), so no regenerate/omit gap.
- Anchor: only refuses when source LACKS workflow-state.md (intended #426 malformed-source guard);
  claim time always writes workflow-state.md (stateFile helper claim.js:618), so a real claimed run
  never trips it. Nonexistent dest -> refuse with '<dest>'.
- End-to-end: test-bundle-finalize.js exercises the real archiveProjectDir copy+verify+delete finalize
  path -> all 135 tests pass, ZERO spurious archive_incomplete.

## Attack 4 — regression check (#675 + renameSync + receipt honesty) — INTACT
- #675 project_archived gap-sweep refusal unchanged and fires before the mkdirSync/writeFile side
  effects (test-gap-sweep 68 assertions incl. T12.1/T12.2 refuse + archived artifact byte-preserved, T13
  never-claimed vacuous).
- Ungated in-place renameSync path unchanged (claim.js:1996-2005); verifyArchiveComplete is only called
  on the isLinkedRun copy branch (1985).
- archive_incomplete is returned BEFORE either fs.rmSync deletion (archiveProjectDir returns at 1986,
  deletes at 1988), and cmdFinalize's archive_incomplete guard returns BEFORE any roadmap-source removal
  / issue close / label removal (guard at ~2307, side effects begin ~2325+).

## Attack 5 — cross-edition — PARITY HOLDS
Ran attack-1 against all forge ports' exported verifyArchiveComplete: gitea, gitlab, AND codex twin all
returned drop-review {"ok":false,"missing":[".cache/review.md"]}, faithful {"ok":true}, sidecar-drop
{"ok":true}. edition-sync.js --check: 10 forge ports, 24 COMMON mirrors, 27 byte-identical groups in parity.

## Attack 6 — suites (counts)
- simulate-workflow-walkthrough.js -> Workflow walkthrough simulation passed
- --only testArchiveCompleteSourceRelative676 -> PASSED (1 scenario)
- test-gap-sweep.js -> 68 assertions
- test-bundle-finalize.js -> all 135 tests passed
- test-claim-hardening.js -> 173 assertions (gh "rate limit"/"Could not resolve" lines are harness
  network noise; exit 0)
- edition-sync.js --check -> parity clean

## Verdict
NOT-REFUTED (confidence: high). The #676 repair genuinely closes my R1 free-form-node-id
evidence-loss refutation with no false-refuse and full cross-edition parity. Residuals below are
out-of-scope / pre-existing and do NOT block.

finding: id=N1 scope=out_of_scope action=document status=deferred severity=low fix_role=none rationale=sidecar denylist is fixed-name; a planner naming a plan node exactly doc-updater/doc-docking/final-validation/selection-evidence/run-gaps-manual would have that evidence excluded, but no shipped run produces it (zero barrier-base-<sidecar> in archives) and finalize sub-steps clobber such a node evidence anyway; strictly better than the pre-fix glob
finding: id=N2 scope=out_of_scope action=none status=deferred severity=low fix_role=none rationale=gate covers .cache/*.md + fixed 4 top-level names only; non-.md artifacts (workflow-tasks.json, run-gaps.json) are outside the claim scope; copyDir carries them faithfully so no real loss, gate simply would not CATCH a lossy drop of a non-.md
finding: id=R2 scope=out_of_scope action=none status=deferred severity=low fix_role=none rationale=pre-existing/known explicit --output clobber on gap-sweep, already deferred; unchanged by this repair
