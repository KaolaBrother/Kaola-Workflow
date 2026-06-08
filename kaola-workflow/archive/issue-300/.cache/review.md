verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=both forge sink ports match github checkDispatchAttestations call pattern byte-identical; placement between buildClosureReceipt and checkClosureInvariants; archive-first candidate ordering correct
finding: id=R2 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=RED-GREEN tests assert field==missing not failed; emptyReceipt default is failed so test genuinely distinguishes fixed state; wired into both walkthrough suites via run() which throws on non-zero exit
finding: id=R3 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=npm test exits 0; no regression; no new injection surface (path.join over validated args.project/mainRoot); no secret exposure; forge state tokens merged/closed untouched

## Code Review — Issue #300 forge ports of checkDispatchAttestations

### Scope
4 files changed:
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js (+import, +8-line call)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js (+import, +8-line call)
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js (+31 lines, Test 22)
- plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js (+31 lines, Test 22)

### Correctness vs github reference (scripts/kaola-workflow-sink-merge.js)
- Call placement IDENTICAL: between buildClosureReceipt (line 311-319) and checkClosureInvariants (line 328).
- Candidate ordering IDENTICAL: [archiveDest/.cache, live project/.cache] — archive-first matching cmdFinalize.
- Both attestation fields (claim_planner_attested, finalize_contractor_attested) populated via the single call.
- The two ported hunks are byte-identical to each other; only the require token differs (gitlab vs gitea claim module), correctly forge-namespaced.
- checkDispatchAttestations is defined AND exported from both forge claim modules (gitlab:1514, gitea:1501).

### Forge-parity
- archiveField uses lowercase 'closed', emission status 'merged' — forge-correct, unchanged by this hunk.
- The attestation hunk introduces no github-specific tokens; no issue_iid/state coupling regression.

### Test quality
- Both Test 22 assert field === 'missing' (not 'failed'). Verified emptyReceipt default in
  kaola-workflow-closure-contract.js is 'failed' for both *_attested fields; warnings: [].
  So the assertion genuinely fails RED (field='failed') without the call and passes GREEN (field='missing') with it.
- setupRealRepo creates a real repo + workflow folder with NO dispatch-log, exercising the
  detector-inactive 'missing' branch end-to-end through postMergeCleanup.
- Wired into walkthrough suites: simulate-gitlab-workflow-walkthrough.js:510 and codex:32;
  simulate-gitea-workflow-walkthrough.js:591 and codex:32. run() uses execFileSync (throws on
  non-zero child exit), so a failing Test 22 aborts the walkthrough.

### No regressions
- npm test exits 0 (full suite: github + gitlab + gitea + codex walkthroughs + contract validators + vendored-agent validation).
- Direct run of both sink test files: 'attestation fields populated by checkDispatchAttestations: PASSED', exit 0.

### Security
- No new injection surface: paths via path.join over validated args.project / mainRoot (same trust
  boundary as all surrounding receipt code).
- No secret exposure: checkDispatchAttestations only reads .cache/dispatch-log.jsonl and pushes
  non-sensitive warning strings to receipt.warnings.

### Summary
| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 0     | pass   |

Verdict: APPROVE — clean port, exact pattern match, genuine RED->GREEN tests wired into the suite, npm test green, no security regression.

### Discriminating check (advisor-prompted): single receipt path per forge
Confirmed each forge sink-merge has EXACTLY ONE receipt-emitting path, matching github's count:
- github:    buildClosureReceipt@293, checkDispatchAttestations@306, checkClosureInvariants@310, emission@311 (postMergeCleanup)
- gitlab:    buildClosureReceipt@311, checkDispatchAttestations@324, checkClosureInvariants@328, emission@329 (1 each)
- gitea:     buildClosureReceipt@311, checkDispatchAttestations@324, checkClosureInvariants@328, emission@329 (1 each)
No second / already-merged branch emits an un-attested receipt with the 'failed' defaults. The single
offline test covers the only attestation path. APPROVE confirmed.
