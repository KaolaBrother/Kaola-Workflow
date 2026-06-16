evidence-binding: n4-review f9be419f4619
verdict: pass
findings_blocking: 0

# n4-review — code-reviewer GATE for issue #515

Post-dominates n2-guard (11-file write set) + n3-prose (13-file write set).
Reviewed the FULL accumulated working-tree diff (24 files, exactly the
declared union; merge-base 388a207e). All six review-focus areas verified
with direct evidence. No CRITICAL/HIGH findings; no boundary breaks.

## Verdict
verdict: pass
findings_blocking: 0

## Evidence summary

1. GUARD CORRECTNESS (4 editions) — PASS
   - Guard inserted AFTER the existing `workflow_path_refused` block, reuses
     the already-computed `adaptiveEnabled` + `requestedPath`.
   - Predicate `const pathWasDefaulted = !args.workflowPath && !process.env.KAOLA_PATH`
     and fires on `adaptiveEnabled && pathWasDefaulted` — identical in all 4.
   - Refusal object mirrors the `workflow_path_refused` family
     (status/claim/issue/project/reasoning). status='path_requires_explicit_opt_in'.
   - Edition-correct issue local confirmed: root/codex use `issueNumber`,
     gitlab/gitea ports use `issueIid` — no ReferenceError.
   - requestedPath collapses to 'full' when defaulted (`|| 'full'`), so the
     interpolated message is correct and no membership test is needed.

2. BOUNDARIES (accuracy #1) — ALL HOLD
   - B1 (switch-OFF default->full): guard gated on `adaptiveEnabled`; OFF skips it.
     test-claim-hardening case (e) proves acquired. PASS.
   - B2 (explicit fast/full under ON allowed): router (commands/workflow-next.md
     Branch B, Step 0a-1) EXPORTS KAOLA_PATH on EVERY switch-ON route — item 2
     fast/full verbal -> `export KAOLA_PATH=full|fast`; item 3 default ->
     `export KAOLA_PATH=adaptive`; adaptive-fallback -> re-export full. Step 0b
     startup subprocess inherits the exported KAOLA_PATH (no `--workflow-path`
     flag needed). No bare/defaulted startup-under-ON route exists. The adapt
     command passes `--workflow-path adaptive` explicitly; the bundle lane is
     adaptive-only with explicit `--workflow-path adaptive`. PASS.
   - B3 (adaptive + bundle pass --workflow-path explicitly): pathWasDefaulted
     false -> not caught. test case (f) acquired. PASS.

3. TEST COVERAGE — PASS
   - test-claim-hardening.js: 6 cases — (a') defaulted full under ON REFUSE,
     (b) explicit --workflow-path full ACQUIRED, (c) KAOLA_PATH=fast ACQUIRED,
     (d) explicit --workflow-path fast ACQUIRED, (e) defaulted full OFF ACQUIRED,
     (f) adaptive under ON ACQUIRED. Distinct issue numbers avoid `owned`
     false-green; self-contained repo+config+mock classifier (hermetic).
     Ran clean-env: 87 assertions passed, exit 0.
   - test-route-reachability.js T11: fail-closed `assert` (not warn) over the
     correct 12 surfaces, asserting BOTH the PIN comment and the
     `path_requires_explicit_opt_in` literal. Ran: 170 assertions, exit 0.
     Repo carries the PIN in exactly 12 production surfaces.

4. HERMETIC HARNESS FIX — SOUND + COMPLETE (no masked product bug)
   - 5 walkthroughs get an unconditional module-top `KAOLA_ENABLE_ADAPTIVE='0'`.
   - simulate-workflow-walkthrough.js dual fix: module-top + a re-add inside
     runNode placed BEFORE `...(extraEnv||{})` (line 40) so explicit '1'
     sub-tests still WIN; baseEnv scrub (line 29-30) strips KAOLA_* which is
     why the re-add is required.
   - (a) all 10 adaptive sub-tests pass KAOLA_ENABLE_ADAPTIVE:'1' via extraEnv
     -> none silently disabled.
   - (c) forge-codex harnesses shell children via env-less execFileSync ->
     children inherit the module-top '0'; inline spawns use
     Object.assign({}, process.env, ...) -> default carried.
   - Framing is correct: the product guard (refuse bare startup under ON) is
     INTENDED (#254); the harnesses were non-hermetic (inherited dev HOME
     enable_adaptive=ON). Fix removes the ambient dependency; the product
     behavior is still exercised by test case (a'). All 6 walkthroughs pass
     clean-env, exit 0.

5. FORGE NEUTRALITY (#341) — PASS
   - Added prose content (excluding diff path headers) across all 12 surfaces
     contains no gh/glab/tea/github/gitlab/gitea/merge request/pull request.

6. PLAN-REPAIR HYGIENE — PASS
   - git diff name-only == declared write-set union EXACTLY: 24 changed == 24
     declared (n2's 11 + n3's 13, disjoint). No stray/unattributed writes, no
     declared-but-untouched. Original barrier baseline kept (no laundering).

## Non-blocking notes (out of scope, follow-up at most)
- T11 comment says "3 Claude commands" while listing root+gitlab+gitea command
  editions; cosmetic wording only (these ARE the 3 forge-editions of the Claude
  command surface). scope=out_of_scope action=follow_up status=open severity=low.

finding: id=R1 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=T11-comment-says-3-Claude-commands-but-lists-3-forge-command-editions-cosmetic-only
