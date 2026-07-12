# Workflow Plan — issue #662

<!-- plan_hash: be942c92da4b5986b9b400558b3c6c973f89e205b827d0e2d5e190f1e0199c81 -->

## Meta
labels: bug, workflow:in-progress, area:scripts
delegation_policy: delegate
speculative_open_policy: auto
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| fix-unreleased-parser | tdd-guide | — | scripts/test-release.js, scripts/kaola-workflow-release.js, plugins/kaola-workflow/scripts/kaola-workflow-release.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js | 1 | sequence | standard |
| review-release-parser | code-reviewer | fix-unreleased-parser | — | 1 | sequence | reasoning |
| finalize | finalize | review-release-parser | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| fix-unreleased-parser | complete |
| review-release-parser | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (fix-unreleased-parser) | subagent-invoked | evidence-binding: fix-unreleased-parser 70252d93b933 | |

| code-reviewer | subagent-invoked | evidence-binding: review-release-parser b25da8426107 | |
| finalize (finalize) | main-session-direct | evidence-binding: finalize 93346a7e6014 | |
## Node Briefs

### fix-unreleased-parser
Fix the release verifier's vacuously empty `[Unreleased]` parsing with RED → GREEN → REFACTOR evidence. First add focused regression cases to `scripts/test-release.js` that prove exact reference values and source order, EOF termination, termination at the next real level-2 heading, non-truncation by heading-like text that is not a real level-2 heading, source-order deduplication, and `changelog_incomplete` with `missing:[N]` when an Unreleased reference is absent from the injected/git closed set. Replace the two duplicated parses used by `issuesOkay()` and `runVerify()` with one forge-neutral helper that returns the structurally bounded unique `[Unreleased]` section or a stable empty result when absent; do not use multiline `$` as the EOF alternative, and preserve `--prepare`'s existing `no_unreleased_section` guard. Keep `scripts/kaola-workflow-release.js` byte-identical with the Codex mirror, and keep the GitLab/Gitea ports rename-normalized equivalents of the full canonical change. Do not widen the release script's registration surface. Run the focused release test during RED/GREEN, run the GitLab and Gitea `--forbidden-only` contract checks over their changed release files immediately, then reuse the Meta validation command for the complete cross-edition gate. Financial-agent work is out of scope.

### review-release-parser
Review the complete bug-fix diff and TDD evidence. Verify that one helper is the sole parser for both consumers, EOF and next-level-2 structural boundaries are correct without multiline-`$` ambiguity, absence behavior is stable, `--prepare` keeps its explicit missing-section refusal, issue references preserve first-seen source order with deduplication, and the missing-reference refusal is genuinely exercised. Check canonical/Codex byte identity, rename-normalized forge parity, exact write-set compliance, and the recorded four-chain validation result. Emit the required verdict and blocking-findings fields.

### finalize
After the review passes, record a concise user-visible Unreleased changelog entry for the corrected release verifier behavior and regression coverage, reuse the recorded validation evidence, and perform the merge-sink finalization for issue #662. Do not add financial-agent material or widen documentation beyond the requested bug fix.
