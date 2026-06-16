evidence-binding: n3-review d38d7ba7fd7c
verdict: pass
findings_blocking: 0

# G1 code-review gate — bundle-506-507 (#506 + #507)

Reviewed the whole 14-file uncommitted working-tree diff. All four chains green
(claude walkthrough + claim-hardening, codex, gitlab, gitea — run sequentially).
Write-set discipline clean. The two fixes are correct and right-sized; the three
judgment calls n2 flagged are defensible at consider-level, none blocking.

## Verdict rationale
- #506 outer `git worktree list` probe now fails CLOSED (bounded 1-retry then
  throw), mirroring #496's inner-probe pattern. The legitimate "no worktree for
  this branch" case is preserved: it is the for-loop falling through with no
  matching block, NOT the catch — the catch path is gone, replaced by an explicit
  throw only when the LIST itself could not be executed. Root↔codex byte-identical;
  gitlab/gitea structurally identical (forge-noun only). Test genuinely forces the
  outer probe to throw (KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL), asserts status!=0 +
  refusal-message + worktree-survives + main-unchanged, AND a Guard-A clean run
  with no injected fault that does NOT trip the guard (proves not a refuse-all
  tautology). Real RED->GREEN.
- #507 boundary-2 catch now classifies (clean_nonzero/killed/spawn_fault),
  bounded-retries transient (N=3), emits indeterminate on persistent transient,
  and does NOT retry clean_nonzero (still emits target_unavailable). Root↔codex
  byte-identical; gitlab/gitea structurally identical (forge-noun + pre-existing
  forge-specific lines only).

## Write-set discipline — PASS
Diff touches exactly the 14 declared files. NONE of the forbidden files
(kaola-workflow-adaptive-node.js, commands/kaola-workflow-plan-run.md, claim.js,
CHANGELOG.md) are touched. Verified via `git diff --name-only`.

## Three judgment calls (the crux)

### JC1 — transient-fallback over-escalation: CONSIDER (defensible, not a fix)
`classifyFetchError` maps an unknown/status-less/signal-less/code-less error to
'killed' -> transient -> retry -> indeterminate -> escalate. In REAL production
this is NOT over-escalation: ghExec/glabExec shell out via
execFileSync('gh'|'glab', ...). A real network/API failure makes the CLI RUN and
EXIT NON-ZERO, so execFileSync throws with e.status set -> classifyFetchError
returns 'clean_nonzero' -> determinate -> target_unavailable, retry-free. The
'killed' fallback fires ONLY for a genuinely abnormal fault (process produced no
exit code, no signal, no recognized spawn-fault code) — a truly indeterminate
state where escalation is exactly correct (fail-toward-human, not false-claim).
The pre-existing tests' bare `new Error('network error')` (no .status) was
UNREPRESENTATIVE of a real network fault; it modeled the wrong thing. Escalation
on the genuinely-indeterminate residual is the #495 design, faithfully extended.
Internally consistent with JC3 (the SyntaxError on root is exactly such a
genuinely-indeterminate, status-less residual). Not blocking.

### JC2 — changed pre-existing fail-closed assertions: CONSIDER (legit; verdict-layer guarantee preserved; gitlab claim-flow assertion thinned but covered)
The 3 changed pre-existing tests (testGitLabClassifierFailClosed,
testGitLabStartupFailClosed, testGiteaClassifierFailClosed) used a status-less
bare Error, which under the new taxonomy is correctly 'killed'/transient ->
indeterminate. Changing them to assert indeterminate/escalate is a legitimate
reflection of correct new behavior for THAT input, not test-weakening.

DETERMINATE guarantee at the CLASSIFIER (verdict) layer — STILL covered:
  - root b2-b: classify clean_nonzero (status=1) -> target_unavailable, counter===1.
  - forge gl/gt b2-b: classifyIssue clean_nonzero (status=1) -> target_unavailable,
    callCount===1.
  - gitlab lines 3278/3309 + 3346/3375: empty / non-JSON exit-0 -> target_unavailable.

DETERMINATE guarantee at the CLAIM-FLOW layer (claimExplicitTarget ->
target_unavailable => claim:none + no active folder + result:refuse, not retried):
  - root: COVERED end-to-end by #495(c) (test-claim-hardening.js:405-427) — a
    determinate clean-nonzero exit flows through `runClaim(['startup'...])` to
    status:target_set_unavailable + result:refuse + counter===1.
  - gitlab/gitea: the OLD testGitLab/GiteaStartupFailClosed end-to-end
    claim-FLOW assertion for the determinate target_unavailable case was
    repurposed to the indeterminate/escalate path; it is NOT re-pinned at the
    forge claim-flow layer for the determinate case. The forge verdict layer IS
    covered (b2-b above), and claim.js's target_unavailable -> claim:none/no-folder
    mapping is UNTOUCHED by #507, so BEHAVIOR is unchanged — this is a thinned
    end-to-end forge claim-flow assertion (low-severity coverage note), not a
    dropped guarantee or a behavior regression. Recorded as R4; non-blocking.

### JC3 — cross-edition malformed-JSON divergence (#307 parity): CONSIDER (narrow, both-safe, structurally out-of-write-set; file follow-up)
CONFIRMED concretely. Same fault class (CLI exit 0 + malformed/truncated stdout):
  - root/codex: JSON.parse(raw) is INSIDE the retry try -> SyntaxError (no .status)
    -> classifyFetchError 'killed' -> retried -> verdict:indeterminate (escalate).
  - gitlab/gitea: forge.viewIssue -> parseJson(raw, {}) swallows to {} ->
    normalizeIssue({}) -> state:'unknown' -> the `_st !== open && _st !== closed`
    guard fires -> verdict:target_unavailable (determinate refuse).
So the same malformed-body fault yields escalate on root/codex vs target_unavailable
on forge. This IS a genuine behavioral asymmetry under the #307 parity rule.
Reasons it is CONSIDER not a blocking fix for THIS bundle:
  1. STRUCTURAL — the proper fix lives OUTSIDE the frozen 14-file write-set: the
     swallow-to-{} is in kaola-{gitlab,gitea}-forge.js `parseJson`/`viewIssue`, so
     the classifier layer cannot even distinguish malformed-body from empty-body.
     Closing parity properly requires surfacing a typed parse-fault from forge.js
     (out of write-set). The only IN-write-set way to remove the divergence would
     be to revert root's escalate-on-SyntaxError — which regresses #507. A gate
     cannot demand either (one expands a frozen write-set, the other undoes the
     change under review).
  2. BOTH outcomes are SAFE — neither false-claims a stolen/closed issue; the
     divergence is between two non-claiming refuse/escalate verdicts.
  3. #507 NEWLY introduces the divergence (root side now escalates where it used
     to determinate-refuse via the old discard-catch) — honest framing that
     justifies FILING a follow-up rather than ignoring it.
  4. The operational #307 rule per CLAUDE.md is four-chain greenness, which holds.
Recommend: file a #307-parity follow-up (forge classifier malformed-JSON body
should escalate like root, not silently determinate-refuse). action: follow_up.

## Findings
finding: id=R1 scope=needs_user_decision action=follow_up status=open severity=low fix_role=none rationale=JC3 cross-edition malformed-JSON-body asymmetry (forge target_unavailable vs root indeterminate); both-safe non-claiming verdicts; proper fix is in forge.js parseJson OUTSIDE the frozen write-set; file a #307-parity follow-up rather than expand the write-set or regress #507
finding: id=R2 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=JC1 transient-fallback escalation is correct — real gh/glab network faults set e.status (clean_nonzero, retry-free); the killed-fallback only fires on a genuinely indeterminate fault
finding: id=R3 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=JC2 determinate verdict-layer guarantee preserved by root b2-b + forge b2-b (status=1 -> target_unavailable, not retried) and gitlab empty/non-JSON exit-0 tests; changed pre-existing tests correctly reflect status-less-error reclassification
finding: id=R4 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=JC2 gitlab/gitea end-to-end claim-flow determinate-refuse assertion was repurposed to the indeterminate path and not re-pinned at the forge claim-flow layer for the determinate case; behavior is unchanged (claim.js mapping untouched; root #495(c) covers the flow end-to-end; forge verdict layer covered by b2-b) — a thinned coverage note, optionally restore a forge claimExplicitTarget->target_unavailable+claim:none assertion in a follow-up

## Validation evidence
- node scripts/simulate-workflow-walkthrough.js -> "Workflow walkthrough simulation passed" (exit 0)
- node scripts/test-claim-hardening.js -> "claim-hardening tests passed (70 assertions)" (exit 0)
- npm run test:kaola-workflow:codex -> "Kaola-Workflow walkthrough simulation passed" (exit 0)
- npm run test:kaola-workflow:gitlab -> "GitLab Codex workflow walkthrough simulation passed" (exit 0)
- npm run test:kaola-workflow:gitea -> "Gitea Codex workflow walkthrough simulation passed" (exit 0)
- root↔codex byte-identity verified for both sink-merge.js and classifier.js (working tree)
- gitea↔gitlab classifier structurally identical modulo forge noun (#507 lines)
- malformed-JSON divergence proven concretely (root SyntaxError->killed->indeterminate vs forge parseJson->{}->target_unavailable)
- determinate claim-flow guarantee confirmed at root via #495(c) (test-claim-hardening.js:405-427: target_set_unavailable + result:refuse + counter===1)
- write-set: exactly 14 declared files; 0 forbidden files
