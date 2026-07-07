evidence-binding: n3-review c07b57be26b0
verdict: pass
findings_blocking: 0

finding: id=R1 scope=pre_existing action=document status=deferred severity=low fix_role=none rationale=test-run-chains flake family (#635) reproduced twice with DIFFERENT failing subsets (15 then 14 failures, T5/T14/T15 present then absent, T26 appearing; T28 shows timed_out:true signal:SIGTERM on a 609ms run) and zero references to sink-merge/claim.js; pre-existing per both implementers' git-stash A/B; record in the finalize waiver, do not block
finding: id=R2 scope=out_of_scope action=follow_up status=deferred severity=low fix_role=none rationale=merge-step wtStageDir (kw-wtsync- temp dir) leaks in os.tmpdir() on the abort paths between staging and landing (FF-merge failure exitCode-2 return / checkout throw); process exits immediately after and the OS reclaims tmp, so impact is negligible; cleanup-on-abort could be added opportunistically later
finding: id=R3 scope=out_of_scope action=document status=deferred severity=low fix_role=none rationale=stale-worktree-cleanup --dry-run still lists an unmerged branch under would_delete_branch while --execute now (correctly) skips it as skipped_unmerged — a preview/actual mismatch; execute-mode reporting is loud and authoritative, so this is a cosmetic follow-up only

# n3-review — G1 code-reviewer gate over n1-sink + n2-claim (bundle-619-620-631)

Reviewed the FULL accumulated uncommitted diff (13 files, +1839/-196) for #619/#620/#631
plus both implementers' evidence. Verdict: APPROVE (pass). Zero blocking findings.

## 1. #619 fail-closed direction — VERIFIED

Every issue-close site now post-probes the LIVE state on the SUCCESS path (not just the catch):
- claim.js closeIssueIdempotent (canonical :254-265): success -> probeIssueClosedLive -> 'failed'
  when still open; catch -> probeIssueClosedLive -> 'already_closed'/'failed'. The NEW un-memoized
  probe is load-bearing: probeIssueState memoizes per-process and the pre-close probe primes the
  memo with 'open', so reusing it post-close would have broken every genuine success AND had
  already made the pre-existing catch-branch probe a permanent no-op. Fix is correct on all four
  branches (4-way matrix asserted in test-claim-hardening).
- sink-merge legacy single-issue close (:549-557), legacy bundle loop (:600-608), --sink closeOne
  (:1450-1454): all three probe after an exit-0 close and bucket open-after-exit-0 as failed.
- Legacy path now mirrors the #497 --sink pattern: closeFailed gate (:691-716) emits typed
  {result:refuse, reason:sink_incomplete, step:closure} + exit 1. closeWasAttempted correctly
  excludes OFFLINE / keep-open / no-issue (no false refusal on the default 'failed' init). The
  bundle PRIMARY's failure is bucketed into failed_issue_closures (:592-597) so the bundle arm of
  closeFailed catches it too. main() generalized from exitCode===3 to any exitCode (:1722).
- push_upstream (:1142-1180): parity proven via branch@{u} rev-parse + rev-list --count ahead===0
  (mirrors assertBranchPushedToUpstream); non-parity -> receipt.push_upstream='failed', typed
  sink_incomplete, exit 1, step left NOT done (re-run retries). FORCE_PUSH_UPSTREAM_FAIL test hook
  mirrors FORCE_PUSH_MAIN_FAIL. Walkthrough test asserts steps.push_upstream !== 'done'.
- worktree_sync dead-step removal (:785, :1184-1249): the final form is RIGHT — stage the worktree
  project dir to a mkdtemp BEFORE removeWorktree, land into mainRoot only AFTER checkout and only
  when !fs.existsSync(mainProjDir) (preserves the original guard semantics post-checkout). This
  resolves the checkout-collision regression n1 self-caught (branch-tracked kaola-workflow/<proj>/
  wins; untracked worktree-only content e.g. .cache/ journals survives — proven by the new
  marker-survival walkthrough test AND the pre-existing testSinkTransactionCleanEndToEnd, both green).

## 2. #620 data-safety — VERIFIED (the critical one)

- removeBranchIfMerged (canonical :447-474): proves `git merge-base --is-ancestor <branch>
  <defBranch>` before ANY -D; unproven -> safe `git branch -d` (git itself refuses unmerged work);
  on refusal -> {removed:false, mode:'skipped_unmerged', tip:<sha>} — never destroys, fails LOUD
  via the new buckets.skipped_unmerged array (with tip SHA) in the JSON report.
- removeBranch (unconditional -D) is NOT reachable from stale-cleanup anymore. Grep across ALL FOUR
  editions: the only remaining call sites are inside cmdRelease (canonical :2677/:2682 within
  cmdRelease at :2649; codex identical; gitlab :2430/:2435; gitea :2425/:2430) — a user-consented
  discard, exactly as n2 claimed. CONFIRMED TRUE.
- defBranch resolved once per execute run (:2922); null/unresolvable degrades to the safe -d path
  (fail-safe). Forge hand-ports carry the guard verbatim (pure git — no forge idiom needed).
- RED fixture (closed-issue + committed-unmerged branch) proves branch ref AND tip commit survive
  `stale-worktree-cleanup --execute` in canonical + gitlab + gitea suites.

## 3. #631 additive published_head — VERIFIED

- Stamped ONLY at the --sink closure gate (:1403-1412) after the live tip (freshly rev-parsed, NOT
  receipt.branch_head) proves merge-base --is-ancestor into defBranch. branch_head is NEVER
  mutated: grep shows writes only at receipt init (:846 #518 cycle reinit, :871 fresh init — both
  pre-existing). #518 cycle-identity guard intact. Persisted via the closure step's receipt writes.
- Walkthrough test forces a GENUINE mid-flight rebase (concurrent origin/main advance) and asserts
  all three properties: published_head stamped, branch_head === the ORIGINAL pre-rebase SHA, and
  the two differ.
- cmdVerifySink prefers published_head with legacy fallback `r.published_head || r.branch_head`
  (canonical :3123-3124) — receipts with neither field fall through to the branch-resolution path
  exactly as before. Same in codex/gitlab/gitea. RED->GREEN: the rebased-sink false-alarm
  (impl_commit_not_ancestor) is reproduced pre-fix and green post-fix in all three test suites.

## 4. Cross-edition parity (#307) — VERIFIED

- Byte-identity: `diff` canonical vs codex twin — IDENTICAL for both sink-merge.js and claim.js;
  `node scripts/validate-script-sync.js` OK (24 common scripts, 25 byte-identical groups, 7 forge
  export-superset families in sync).
- GitLab/Gitea hand-ports re-implement (not verbatim-copy) all fixes in forge idiom:
  forge.closeIssue/viewIssue/updateIssue(unlabels)/updateIssueLabels(remove), glab/tea prose in
  operator messages; the git-only parts (parity check, stage-then-land, is-ancestor guard) ported
  structurally. All five sink-merge fixes + all three claim fixes present in both ports.
- Chains actually run THIS session: codex chain EXIT=0 (full). claude chain green through every
  step except test-run-chains.js — the #635 flake (see R1; two runs produced DIFFERENT failing
  subsets; 0 grep hits for sink-merge/claim in that file); the two post-flake chain steps
  (simulate-workflow-walkthrough.js green, test-active-folders-field-parity.js 61 assertions)
  verified standalone. gitlab/gitea: test-{gitlab,gitea}-sinks.js green directly + both edition
  walkthroughs (simulate-{gitlab,gitea}-codex-workflow-walkthrough.js) green standalone; their
  run-chains files carry the same #635 flake family (implementers' stash A/B on record).
  Full-suite direct runs: walkthrough green ("Workflow walkthrough simulation passed"),
  test-claim-hardening 169 assertions, test-bundle-finalize 135 tests.

## 5. Scope + module.exports — VERIFIED

- git status: exactly the 13 declared files modified (union of n1's 9-file and n2's 7-file
  declared_write_sets, overlapping on the 3 shared test files) + the untracked
  kaola-workflow/bundle-619-620-631/ state dir (expected). No undeclared writes.
- closeIssueIdempotent + removeBranchIfMerged present in module.exports in ALL FOUR editions;
  export-superset guard green. Note: probeIssueClosedLive is deliberately internal (not exported)
  in all four editions — consistent across editions, no superset violation, and nothing imports it
  externally (tests exercise it through closeIssueIdempotent). Not a defect.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 3     | note   |

Verdict: APPROVE — fail-closed direction confirmed on every AC across all four editions; zero
blocking findings. R1 (#635 run-chains flake) must be carried into the finalize waiver; R2/R3 are
cosmetic follow-ups, non-blocking.
