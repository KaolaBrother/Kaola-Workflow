evidence-binding: n2-code-review ed2990005960
verdict: pass
findings_blocking: 0

finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=axis-replacement-uniform-all-4-sites-all-4-editions-no-exit-code-only-survivor
finding: id=R2 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=510-forge-classify-_st-guard-converges-both-forge-editions-on-indeterminate-escalate-complete
finding: id=R3 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=511-forge-e2e-uses-genuine-negative-404-refuse-never-generic-exit1-both-editions
finding: id=R4 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=probeIssueState-discriminant-non-breaking-state-only-readers-closure-audit-probe-memo-unaffected-10-assertions-green
finding: id=R5 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=cross-edition-root-codex-byte-identical-validate-script-sync-green-forge-ports-full-mirror-modulo-nouns
finding: id=F1 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=transient-stderr-denylist-could-widen-context-deadline-exceeded-EOF-broken-pipe-default-refuse-but-live-repro-TLS-covered-sound-conservative-boundary
finding: id=F2 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=gitlab-510-test-comment-stale-references-reverted-strictViewIssue-seam-assertion-correct-comment-only
finding: id=F3 scope=out_of_scope action=document status=open severity=low fix_role=none rationale=forge-probeIssueState-malformed-nonempty-exit0-refuses-while-root-escalates-both-fail-closed-unreachable-gh-input-conscious-call-D-519-01-should-record

VERDICT DETAIL (G1 gate, post-dominance over n1-axis-fix):

PASS. 0 blocking findings. All eight focal points verified with primary evidence.

1. #510 seam deviation (load-bearing): SOUND + COMPLETE. The forge classifiers' _st guard
   (state not open/closed after parseJson(raw,{}) swallows exit-0-unparseable/empty to {}) now
   returns verdict:'indeterminate'/reasoning_class:'classifier_error' at BOTH classifyIssue AND
   cmdClassify in BOTH forge editions (gitlab classifier:597-600/683-687, gitea
   classifier:597-600/683-687). A malformed/empty exit-0 body cannot reach a determinate refuse
   anywhere in the forge classify path: every non-open/non-closed state routes to indeterminate;
   genuine 404 is caught earlier by fetchIssueWithRetry's clean_nonzero refuse. Root needs no #510
   change confirmed: root cmdClassify JSON.parse(raw) is inside the fetch try (classifier.js:728) →
   SyntaxError (no .status) → classifyFetchError='killed' → transient. The reverted strict-parse
   seam would have bypassed forge.viewIssue (the stub seam the forge tests drive) — revert correct.
   Tests green: gl/gt ResidualEmptyExit0 + ResidualNonJsonExit0 (classifyIssue + cmdClassify) all
   assert indeterminate/classifier_error and PASS.

2. Default unrecognized clean_nonzero = refuse (conservative call): SOUND boundary.
   (a) Live kaolaGIT repro covered → escalate: verified empirically — TLS handshake timeout on gh
       repo view (site 1, s1 test) AND gh issue view (site 2, s2 test) both → verdict:indeterminate;
       isTransientFetchStderr returns true for TLS/handshake/rate-limit/DNS-host/ETIMEDOUT/ECONNRESET/
       5xx/i-o-timeout. Genuine 404 + "Could not resolve to an Issue" → false (refuse) — no collision
       with "could not resolve host".
   (b) Deny-list adequacy: covers all live-repro + common transients. NON-BLOCKING gap (F1): plausible
       future transients "context deadline exceeded"/"unexpected EOF"/"broken pipe" currently default
       to refuse. "require positive infra evidence → else refuse" is a defensible claim-gate boundary
       (false-refuse is operator-recoverable; false-hold of a gone target silently stalls). The #519
       blocking residual (the live repro) is fixed; widening the deny-list is an additive follow-up,
       not a correctness defect.

3. Conscious fail-closed: forge probeIssueState malformed-NON-empty exit-0 body stays unverified→
   refuse while root (JSON.parse→SyntaxError→transient) escalates. CONFIRMED divergence empirically
   (root → {transient:true}/escalate; forge → {state:unavailable}/refuse). NON-BLOCKING (F3):
   both editions fail-closed (neither wrongly ACQUIRES); the input (exit-0 with corrupt JSON on
   `issue view --json state`) is not a real forge-CLI failure mode (CLIs exit non-zero on error);
   it is OUTSIDE #510's claimed scope (the classify path, which is complete); and fixing it
   reintroduces the reverted stub-seam test breakage. Sound conscious call. D-519-01 should record it.

4. Axis uniform at all 4 sites x 4 editions, no exit-code-only survivor: CONFIRMED. Classifiers:
   every clean_nonzero decision goes through isTransientFetchError (remaining clean_nonzero refs are
   the classifyFetchError shape-classifier + comments). claim.js classifyIssue: clean_nonzero arm
   consults isTransientFetchStderr (break + final-refuse). active-folders probeIssueState:
   probeErrIsTransient. getRepoOwnerName (site 1) wrapped → TransientFetchError on signature.
   issueHasRemoteClaimComment/Notes (site 5) re-throws on signature. claim-acquisition gates
   (claimProject 877/882, claimExplicitBundle 1322/1327 + forge mirrors) route probe.transient →
   escalate. Non-acquisition probe sites (closeIssueIdempotent:203, finalize bucketing:2225,
   watch-pr:2899) collapse transient→unavailable/failed — out of #519 claim-acquisition scope,
   conservative, no false-CLAIM.

5. Four editions converge (no #307 divergence): transient→escalate everywhere, genuine→refuse
   everywhere. Root↔codex BYTE-IDENTICAL (classifier/claim/active-folders; validate-script-sync
   green). gitlab/gitea FULL mirrors modulo forge nouns. Single narrow documented exception = F3
   (both fail-closed, unreachable input).

6. probeIssueState discriminant non-breaking: CONFIRMED. transient:true is ADDITIVE beside
   state:'unavailable'; closed/open returns UNCHANGED. closure-audit.js (x4) reads ZERO .transient
   (only .state). test-issue-probe-memo.js: 10 assertions PASS.

7. #511 uses GENUINE-negative stderr: CONFIRMED. gl-511 + gt-511 end-to-end claimExplicitTarget
   tests use a real 404 "Could not resolve to an Issue" → result:refuse/target_unavailable, NEVER
   escalate; comments explicitly forbid the generic exit-1/network-error mock (which would enshrine
   the #519 bug). gl-b2b/gt-b2b reconciled to genuine-404; b2-transient added for the escalate arm.

8. Cross-edition fidelity: root↔codex byte-twins identical; forge ports FULL-diff mirrors (gitea
   test comment is even MORE accurate than gitlab re the as-built _st guard). NON-BLOCKING nit (F2):
   gitlab #510 test comment still says "strictViewIssue seam now surfaces it" (stale ref to the
   reverted preferred approach) — the assertion is correct; comment-only.

TEST EVIDENCE (run from worktree): test-claim-hardening.js EXIT=0 (98 assertions, incl. s1/s2/
s2-genuine/d-transient-stderr/probe-transient/probe-genuine). test-issue-probe-memo.js EXIT=0 (10).
validate-script-sync EXIT=0 (byte twins). edition-sync --check EXIT=0. Forge suites:
test-gitlab-workflow-scripts.js + test-gitea-workflow-scripts.js EXIT=0 under KAOLA_ENABLE_ADAPTIVE=0,
both printing "#507/#511/#519: PASSED". NOTE: with the ambient shared config
(~/.config/kaola-workflow/config.json enable_adaptive:true) BOTH forge suites fail identically at a
PRE-EXISTING line-914 claim-acquisition test (path_requires_explicit_opt_in vs acquired) — this is
the #515 reciprocal switch-ON guard already on main, NOT touched by this bundle (the failing test is
unchanged in the diff; the npm test:kaola-workflow:{gitlab,gitea} chains do not run this file; the
#515 walkthroughs set KAOLA_ENABLE_ADAPTIVE at module top). Confirmed pre-existing env sensitivity,
not a bundle regression.
