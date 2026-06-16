evidence-binding: n3-review 4267097a50e8
verdict: pass
findings_blocking: 0

finding: id=R1 scope=pre_existing action=follow_up status=open severity=low fix_role=none rationale=outer-git-worktree-list-probe-in-assertWorktreeClean-retains-pre-existing-fail-open-catch-return-outside-#496-scope-non-blocking

# n3-review (code-reviewer / G1 gate) — bundle #496+#497

## Verdict: PASS — 0 blocking findings

Reviewed the full accumulated working-tree diff (14 tracked files = n1 + n2) against the
correctness-first scrutiny list. Ran all four edition chains + route-reachability; all green.

## What I verified (empirical)

- canonical scripts/kaola-workflow-sink-merge.js == codex twin plugins/kaola-workflow/scripts/... BYTE-IDENTICAL (working tree).
- 4 chains GREEN sequentially: claude (Workflow walkthrough simulation passed) + codex + gitlab + gitea. #307 satisfied.
- node scripts/test-route-reachability.js GREEN (62 assertions incl. new T6).
- 3 new canonical tests RAN + PASSED: testAssertWorktreeCleanFailsClosedOnProbeFault / testSinkRefusesOnPushMainFailure / testSinkRefusesOnCloseFailure. gitea + gitlab forge sink tests RAN + PASSED with matching assertions.

## #496 (assertWorktreeClean fail-closed) — CORRECT

- Inverted catch is genuinely fail-closed: probeErr captured each attempt, cleared on success; if still set after the loop ⇒ throw (refuse). A throwing probe is treated DIRTY, never swallowed as clean (sink-merge.js:182-201).
- Retry bounded: `for (attempt=0; attempt<2; attempt++)` — max 2 attempts, no infinite loop.
- Clean path preserved: on success status='' , probeErr=null, `if(status)` dirty-check does not fire, no throw.
- Genuinely-dirty path preserved (the `if(status)` block below is unchanged).
- No false-positive risk: test Guard A proves a clean worktree with NO injected fault does NOT trip the refusal.

## #497 (push_main + closure fail-closed) — CORRECT

- push_main hard fail: records receipt.push_main='failed', does NOT stepDone('push_main'), emits result:refuse reason:sink_incomplete step:push_main, early-returns (sink-merge.js:1112-1128). Re-run resumes the still-`pending` push step. Test reads receipt and asserts push_main !== 'done'.
- closure hard fail: closeOne buckets closed/failed; #396.5 already-closed re-probe preserved (exit-1-but-actually-closed classified SUCCESS); only failed.length>0 records remote_issue_closed='partial' + emits refuse step:closure + failed_issue_closures + early-return (sink-merge.js:1028-1044). NO bare catch(_){} swallow remains on the genuine-close path; the residual catch(_){} are only on the label-edit (issue edit --remove-label) which is correctly best-effort.
- Branch preserved for retry: both early-returns fire INSIDE the step loop, BEFORE the post-loop teardown (branch -D at :1176, final worktree removal at :1162). closure-refuse returns before push_main even runs (test asserts push_main==='pending').
- SUCCESS path byte-equivalent: on no failure, closeOne pushes to `closed`, falls straight through to stepDone('closure'); push success falls through to stepDone('push_main'). No happy-path behavior change.
- Emit shape matches n2 prose: result/reason/step/push_main/remote_issue_closed/failed_issue_closures all consumed by the 6-surface prose.

## Cross-edition fidelity (#307) — FAITHFUL

- gitlab/gitea ports use the forge abstraction (forge.closeIssue / forge.updateIssue / forge.updateIssueLabels), NOT copy-pasted ghExec internals. Same bucket-and-refuse logic, same emit shape, same push_main treatment. Semantically equivalent across all 4 editions.

## n2 prose accuracy — CORRECT

- All 6 surfaces use the EDITION-CORRECT closure-audit name (kaola-workflow- / kaola-gitlab-workflow- / kaola-gitea-workflow-closure-audit.js).
- CLI flags accurate: closure-audit parseArgs accepts ONLY `--execute`; JSON always output; NO --project/--json fabricated. Prose `node $JS` (dry-run) + `--execute` matches the real surface (closure-audit.js:56-62 ×3 editions).
- Forge-correct manual-close hints: gh issue close N (canonical), glab issue close N (gitlab), tea issue close N (gitea).
- T6 GENUINELY fail-closed: assert() increments `failed`; `if(failed) process.exit(1)`. NOT the self-disarming T5 anyHasPin/console.warn pattern. Covers all 6 surfaces (PIN comment + literal each). readFileSync throws if a surface is missing (also fail-closed).

## Security — CLEAN

- All new git/gh/forge calls use execFileSync argv arrays (no shell-string interpolation) — no command injection.
- Fault-injection env vars (FORCE_WT_STATUS_FAIL / FORCE_PUSH_MAIN_FAIL) are plain `=== '1'` toggles matching the existing FORCE_FF_FAIL convention; they only make an operation we ALREADY run throw — no new injection surface, documented test-only, no production effect. KAOLA_GH_MOCK_SCRIPT is an established mock honored by ghExec.

## Test honesty — SOUND

- Tests exercise the real failure paths (not vacuous): probe-fault refusal + worktree-survives + main-unchanged + clean-no-fault control; push-fail refuse + receipt push_main!=done; close-fail via gh mock (view->open, close->exit1 = genuine not-already-closed failure) + failed_issue_closures includes 9498 + closure!=done + push_main==='pending' (proves close-arm early-return short-circuits before push_main).

## Non-blocking note (R1)

- assertWorktreeClean's OUTER `git worktree list` probe (sink-merge.js:167-172) retains its pre-existing fail-open `catch(_){ return; }` ("no worktree info resolvable -> nothing to guard"). This is PRE-EXISTING and outside #496's scope (which targeted the inner status probe). A transient `git worktree list` fault would skip the guard entirely. Not introduced by this diff; non-blocking. Could be a follow-up to harden symmetrically.
