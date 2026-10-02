# Finalization summary — issue-1113

## Delivered

Explicit GitHub singleton keep-open research/artifact PR lifecycle support (issue #1113, owner
correction 2026-10-02 scope; no installer/adoption system, no consumer/global installation):
- Explicit mode agreement (--keep-open-pr explicit_singleton + durable keep_open_pr/issue_action/
  sink lines, exactly one issue) carried through finalize, archive/resume, request creation/reuse,
  and both watcher lanes; any-intent-line detection (empty values, bare/duplicate tokens) refuses
  before close-mode selection, the OFFLINE placeholder, and every effect.
- No closing linkage: keyword-associated bare, same-repository qualified, and same-repository
  issue-URL references (native-observed forms) are scanned in commit messages and PR body/title;
  foreign references are ignored; unknown identity counts (fail-closed). Repository identity is
  state claim_repository_id reconciled with the actual origin remote; measurable disagreement
  refuses repository_conflict before any gh call.
- Request-only: never queues or auto-merges (suppressed_request_only) even with pr_auto_merge true;
  native closingIssuesReferences and autoMergeRequest are validated on OPEN reuse/discovery with
  fail-closed unmeasured refusals; no PR is ever modified.
- Truthful reconciliation: intentionally_kept_open / keep_open_violation (no reopen) / unknown.
- Normal-close behavior and the #336/#1098 legacy refusal unchanged; GitLab/Gitea unchanged.

## Candidate

Frozen and outer-accepted: 804c758b282af54595ef7026461228829ba1eb88 on workflow/issue-1113
(base fe7e4443 = v12.4.0). Outer round-3 verdict ACCEPTED (.kaola/outer-review-1113/review-r3.md):
repair diff read, end-to-end probes rerun refusing, P1 scenario rerun PASS, receipt verified.
Identity disclosure: a0f02ea5/193abb2e are pre-Host machine-identity commits (history not
rewritten); every commit from 1203f765 on is KaolaBrother, no trailers.

## Evidence

- Chain receipt .cache/chain-receipt.json (sha256 3c4f7a9ab35383ac1edb3c43a395b81fda5f0f86d1ca5d402d2cd2f473dc508):
  headSha 804c758b, workTreeHash clean, validationTestConsumes [], claude/codex/gitlab/gitea exit 0,
  accepted_red false, attempts 1. Walkthrough 205/205 (spawn census 2894).
- Independent suites v3-v7 (cache-only, fail-closed harness): REPORTs 3571b98f/bd1d5f8d/f4093b8d/
  35bc8b18/b64a392b (full hashes in the packages); v7 = 24/24 rows on the final candidate with a
  rejected-candidate discrimination control. Host acceptances host-indqa-v3..v7-acceptance.md.
- Outer review rounds 1-3: .kaola/outer-review-1113/ (review.md, review-r2.md, review-r3.md) with
  reproduced probes each round. Repair seat reports: keepopen-{docscope,p1repair,scannerfix,
  originfix,r2fix}; chain rounds: keepopen-final-chains{,-v2..-v5}.

## Known failures / unverified scope (honest limits, recorded not waived)

- Independent-suite RED classes remain limitations by recorded scope ruling: receipt durable-
  identity proposal (out of corrected scope), sink-side claim repository/digest/forge re-validation
  (claim identity owned by the claim machinery), two v2 fixture artifacts.
- Outside-spec URL grammar (http://, www.github.com, /pull/N, keyword and URL on separate lines)
  is not recognized; slug-shaped corrupted-state claim_repository_id is syntactically
  indistinguishable from a normalized slug (inherent; unreachable via origin).
- No authenticated Forge compatibility end-to-end (synthetic gh spy; URL association encoded from
  the outer's read-only native observations). Local-only-archive cleanup ordering is pre-existing
  shared normal-close machinery, unchanged.

## Validation

Transaction measurement at archive time (transient): classification chains_stale, green false,
mode chain-receipt — the current code-tree hash read "(unresolved)" because the receipt moved from
the claim .cache to this archive .cache within the same transaction; the receipt itself was not
re-run or altered.

Post-archive recheck (Host, finalize --check, read-only): validation chains_green, ok true,
reasons []. Receipt unchanged: .cache/chain-receipt.json sha256
3c4f7a9ab35383ac1edb3c43a395b81fda5f0f86d1ca57d402d2cd2f473dc508, headSha 804c758b (the exact
branch tip), workTreeHash clean, codeTreeHash 92c3faca… resolves against the archive source.
Verdict owner: Host — the receipt is fresh for the exact frozen candidate; the transient finding
was a measurement-context artifact, recorded here rather than overwritten.

Chain receipt is stale — the tree advanced since the chains ran. Regenerate the receipt over HEAD.

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- README.md
- commands/kaola-workflow-finalize.md
- docs/README.md
- docs/api.md
- docs/architecture.md
- docs/decisions/0031-explicit-github-keep-open-pr.md
- docs/workflow-state-contract.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/kaola-workflow-active-folders.js
- scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-closure-contract.js
- scripts/kaola-workflow-sink-pr.js
- scripts/simulate-workflow-walkthrough.js
- templates/routing/finalize.skeleton.md
- templates/routing/slots.js

## Follow-Up Items

- None filed: the documented limitations above retain their Host/outer-recorded dispositions and
  no additional capability is commissioned by #1113; the release gate expects a zero-open forge.

## Final readiness

Ready: candidate frozen at 804c758b, outer-accepted round 3, unwaived four-chain receipt bound to
the exact candidate, evidence preserved under kaola-workflow/issue-1113/.cache (gitignored) and
this archive. Proceed with merge sink (close #1113), then the authorized small normal release.

## Sink Findings

archived_paths:
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-02/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/kimi-native-agent-acceptance-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-02/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/opencode-native-agent-path-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-02/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/runtime-native-carrier-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-02/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/kaola-workflow/global-contract-receipt.json
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-02/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/rules/kaola-workflow-global.mdc
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-03/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/kimi-native-agent-acceptance-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-03/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/opencode-native-agent-path-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-03/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/runtime-native-carrier-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-03/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/kaola-workflow/global-contract-receipt.json
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-03/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/rules/kaola-workflow-global.mdc
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-04/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/kimi-native-agent-acceptance-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-04/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/opencode-native-agent-path-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-04/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/runtime-native-carrier-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-04/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/kaola-workflow/global-contract-receipt.json
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-04/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/rules/kaola-workflow-global.mdc
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/kimi-native-agent-acceptance-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/opencode-native-agent-path-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/runtime-native-carrier-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/kaola-workflow/global-contract-receipt.json
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/rules/kaola-workflow-global.mdc
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/kimi-native-agent-acceptance-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/opencode-native-agent-path-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/runtime-native-carrier-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/kaola-workflow/global-contract-receipt.json
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/rules/kaola-workflow-global.mdc
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins/frozen-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/kimi-native-agent-acceptance-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins/frozen-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/opencode-native-agent-path-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins/frozen-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/.cache/runtime-native-carrier-red.md
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins/frozen-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/kaola-workflow/global-contract-receipt.json
- kaola-workflow/archive/issue-1113/.cache/keepopen-independent-pins/frozen-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo/.cursor/rules/kaola-workflow-global.mdc
