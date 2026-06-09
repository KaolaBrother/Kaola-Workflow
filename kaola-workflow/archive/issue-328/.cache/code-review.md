verdict: pass
findings_blocking: 0
finding: id=CR1 scope=in_scope action=fix status=resolved severity=high fix_role=implementer rationale=forge-claim.js-bundle-finalization-half-now-present-and-parity-verified-both-ports-archiveProjectDir-plural-roadmap-cmdFinalize-per-member-close-postattach-checkClosureInvariants-memberloop-cmdRelease-cmdWatchPr-per-member-clear-correct-forge-nouns-and-clearAdvisoryClaim-signature-offline-smoke-22-of-22
finding: id=CR2 scope=out_of_scope action=document status=open severity=low fix_role=none rationale=forge-simulate-walkthroughs-still-carry-no-bundle-scenarios-so-gitlab-gitea-chains-prove-no-regression-not-bundle-coverage-follow-up-add-forge-bundle-finalize-walkthrough-regression-coverage

# code-review (code-reviewer) gate — issue #328 same-scope multi-issue bundle lane — RE-RUN after CR1 plan-repair

## Verdict: APPROVE — CR1 RESOLVED, 0 blocking findings

The `forge-claim-ports` node was reopened and the bundle-FINALIZATION half was mirrored into
both forge claim.js ports. I verified all five components for parity against root, re-confirmed
AC#1 (single-issue) is untouched, re-confirmed nothing else regressed, and ran all four chains.

## Evidence model (kept distinct — per the CR2 lesson)
- CR1-RESOLVED proof = **code parity (diffed each of the 5 components against root) + the offline
  bundle-finalize smoke (22/22)**. The forge test chains are NOT proof of CR1 resolution: the
  gitlab/gitea simulate walkthroughs still carry zero bundle scenarios (CR2), so they pass green
  with OR without the finalization half.
- NO-REGRESSION proof = **all four chains green** (they exercise the unchanged single-issue +
  cross-edition surface; a regression there would turn a chain red).

## CR1 parity verification — both forge claim.js ports vs root scripts/kaola-workflow-claim.js

Symbol counts now MATCH root exactly (were all 0 at the BLOCK):
| symbol                    | root | gitlab | gitea |
|---------------------------|------|--------|-------|
| roadmap_sources_removed   | 4    | 4      | 4     |
| closed_issues             | 1    | 1      | 1     |
| failed_issue_closures     | 2    | 2      | 2     |
| memberNumbers             | 5    | 5      | 5     |
| archiveIssueNumbersRaw    | 5    | 5      | 5     |
| clearAdvisoryClaim        | 13   | 13     | 13    |

Component-by-component (read in full for gitlab, read+grep-confirmed for gitea):
1. archiveProjectDir plural roadmap removal — BYTE-IDENTICAL to root in both ports (noun-free
   block): archiveIssueNumbersRaw pre-read before renameSync, per-member unlink loop with #297
   MAIN-repo reconcile, scalar roadmap_source_removed kept for primary, regen once, returns
   roadmap_sources_removed. Single-issue falls through to one iteration ([archiveIssueNumber]).
2. checkClosureInvariants member loop — BYTE-IDENTICAL to root in both ports (the only line diff
   is a pre-existing local var name stateFile/stateFilePath, unrelated to #328): memberNumbers =
   receipt.issue_numbers || [scalar]; per-member roadmap-source-absent + roadmap-mirror-clean
   reusing the same CLOSURE_INVARIANTS ids (no byte-locked contract change); (issue #N) suffix
   only when >1 member.
3. cmdFinalize per-member close + post-attach — faithful forge port: per-member clearAdvisoryClaim
   loop with the forge-specific 4-arg signature (gitlab {project_id, path_with_namespace}; gitea
   {full_name, html_url}); primary feeds claim_label_removed via n === issueIid/issueNumber;
   per-member probeIssueState into closed_issues/failed_issue_closures (warning-first, never
   aborts — AC#13); single-issue close-probe uses the forge helper (gitlab issueIsClosed, gitea
   probeIssueState) not root ghExec; bundle fields attached AFTER buildClosureReceipt (Decision-5
   filter bypass) gated by issueIids/issueNumbers length.
4. cmdRelease per-member clear — both ports: bundle branch gated by
   Array.isArray(folder.issue_numbers) && length>0, per-member clearAdvisoryClaim, scalar
   fall-through.
5. cmdWatchPr/watchMergeRequests per-member clear + receipt post-attach — both ports: merged path
   (claimLabelStatus) and closed path (claimLabelStatus2), primary canonical via n ===
   folder.issue_iid, == null -> 'failed'; forge verbs (gitlab 'mr merged'/'mr closed', gitea
   'pr merged'/'pr closed'); folderReceipt.issue_numbers + roadmap_sources_removed post-attached.

Forge-noun discipline (grep-confirmed): no `\bgh\b` in gitlab port, no `\bglab\b` in gitea port,
no `require('../` root fallback in either. Line counts: root 2082 == claude 2082 (byte pair
intact); gitlab 2050, gitea 2035 (forge ports legitimately shorter — noun mapping).

Repair evidence (kaola-workflow/issue-328/.cache/forge-claim-ports.md) records an offline
gitlab+gitea cmdFinalize smoke on a 3-issue bundle: 22/22 assertions, all 3 .roadmap/issue-N.md
removed per forge, closed_issues/failed_issue_closures/roadmap_sources_removed arrays present,
roadmap_sources_removed has 3 entries, roadmap regenerated. Consistent with the code I read.

## AC#1 (single-issue) — no regression from the repair
The single-issue path is preserved. Every bundle branch is gated by
`Array.isArray(...issue_numbers/issueIids) && length > 0`; an empty member array falls through to
the pre-existing scalar call. The only `-` diff line on the scalar finalize call is the
mechanical const->let conversion (`const claimLabelRemoved = clearAdvisoryClaim(...)` became
`let claimLabelRemoved;` reassigned inside the else arm) — the call itself
(`clearAdvisoryClaim(issueIid/issueNumber, 'finalized', projectInfo, args.project)`) is
byte-identical and executes with identical args when there is no member array. Behavior of a
single-issue finalize/release/watch-pr is unchanged.

## Rest of #328 — re-confirmed clean (unchanged since the prior APPROVE)
Root core (claim.js, active-folders.js, classifier.js, adaptive-node.js), the root<->claude byte
pair, the issue-scout read-only role + its registration/count bumps, the four validators, routing,
and the root bundle test wiring (test-bundle-state/claim/finalize.js) are all unchanged by this
repair (the repair touched only the two forge claim.js files) and remain clean. All four chains
green re-confirm no cross-edition regression.

## Chain exit codes (real $?, captured directly per chain — not piped)
| chain  | exit | sentinel |
|--------|------|----------|
| claude | 0    | "Workflow walkthrough simulation passed" (x1); bundle tests in chain |
| codex  | 0    | "Kaola-Workflow walkthrough simulation passed" (x1) |
| gitlab | 0    | "GitLab workflow walkthrough simulation passed" (x1) |
| gitea  | 0    | "Gitea workflow walkthrough simulation passed" (x1) |
| simulate-workflow-walkthrough.js (root, in claude chain) | 0 | sentinel present |

## Non-blocking follow-up (CR2 — carried forward, document/out_of_scope)
The gitlab/gitea simulate walkthroughs still carry no bundle scenarios, so the forge chains prove
no-regression but not forge bundle coverage. Recommend a follow-up issue to add a forge
bundle-finalize regression scenario so a future CR1-class regression is caught by the chain
rather than by review. Not blocking — the design did not scope forge walkthrough bundle scenarios,
and the offline smoke + code parity close the immediate risk.

## Summary
| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 1     | note (CR2, out_of_scope) |

Verdict: APPROVE — CR1 (forge finalization parity) is RESOLVED and verified across both ports.
All four chains green. AC#1 preserved. Clear to sink.
