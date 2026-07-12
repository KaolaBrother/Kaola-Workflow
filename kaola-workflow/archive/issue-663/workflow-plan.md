# Workflow Plan — issue #663

<!-- plan_hash: e00a1a8bb58ad8e8f010a9c35de5ec1e3ab572792ce4eb8d4a271cb3e4e6c905 -->

## Meta
labels: bug, workflow:in-progress, area:scripts
delegation_policy: delegate
speculative_open_policy: auto
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| fix-release-issue-accounting | tdd-guide | — | scripts/test-release.js, scripts/kaola-workflow-release.js, plugins/kaola-workflow/scripts/kaola-workflow-release.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js | 1 | sequence | standard |
| review-release-issue-accounting | code-reviewer | fix-release-issue-accounting | — | 1 | sequence | reasoning |
| finalize | finalize | review-release-issue-accounting | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| fix-release-issue-accounting | complete |
| review-release-issue-accounting | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (fix-release-issue-accounting) | subagent-invoked | evidence-binding: fix-release-issue-accounting f3399a35efdc | |

| code-reviewer | subagent-invoked | evidence-binding: review-release-issue-accounting 3a76acbaaca6 | |
| finalize (finalize) | main-session-direct | evidence-binding: finalize 8f3703a6ffde | |
## Node Briefs

### fix-release-issue-accounting
Correct the release verifier's bidirectional issue accounting with RED → GREEN → REFACTOR evidence. Begin in `scripts/test-release.js` with focused failures proving: an injected closed set `654,655,656,658` against an `[Unreleased]` section containing only `#658` refuses as `changelog_incomplete` with `missing:[654,655,656]`; a complete injected/Unreleased set passes; an Unreleased reference absent from the injected or git-known set still refuses through a separately identifiable mismatch instead of being laundered; duplicate Unreleased references and duplicate injected numbers are deduplicated deterministically; and verification without `--issues-closed` preserves the explicit `verification:"offline"` contract and best-effort git-log accounting without claiming forge closure knowledge. Preserve first-seen source order for `changelog_refs`, use stable injected order (or deterministic numeric order) for missing injected issues, and keep the public JSON/human envelopes coherent. Rework the shared `issuesOkay()` path carefully because both `--verify` and `--prepare` consume it: the inverse injected-set check applies only when an authoritative injected set exists, while the existing unknown-Unreleased-reference protection and offline behavior remain fail-closed and distinguishable. Keep `scripts/kaola-workflow-release.js` byte-identical with the Codex mirror and keep the GitLab/Gitea ports rename-normalized equivalents of the full canonical change. Run the focused release test during RED/GREEN, run the GitLab and Gitea `--forbidden-only` contract checks over their changed release files immediately, reproduce the issue's live verifier refusal before the CHANGELOG repair, then reuse the Meta validation command for the complete cross-edition gate. Financial-agent work is out of scope.

### review-release-issue-accounting
Review the complete bug-fix diff and TDD evidence. Verify that injected `--issues-closed` values are authoritative in online mode, missing injected issues are reported deterministically as `changelog_incomplete`, unknown Unreleased references still refuse through a distinct typed payload/reason rather than being conflated with the inverse check, duplicates cannot perturb either direction, and offline mode retains honest git-log-only accounting plus `verification:"offline"`. Check that `--prepare` remains coherent with the shared helper, public JSON and human envelopes are stable, canonical/Codex byte identity and rename-normalized GitLab/Gitea parity hold, exact write-set compliance is satisfied, the issue's live command refuses before the CHANGELOG move, and all four recorded validation chains are green. Emit the required verdict and blocking-findings fields.

### finalize
After review passes, move the existing #654, #655, and #656 entries from the already-released `[6.22.0]` section into the appropriate `[Unreleased]` subsections without duplicating or rewriting their shipped meaning, and add a concise user-visible #663 entry describing authoritative injected-set completeness, preserved unknown-reference protection, deterministic deduplication, offline behavior, and synchronized edition coverage. Re-run the issue's live `--verify --issues-closed 654,655,656,658,659,660,661,662 --json` acceptance command after the move, reuse or refresh the Meta validation evidence as required by CHANGELOG.md's validation-visible status, and perform merge-sink finalization for issue #663. Do not add financial-agent material or widen documentation beyond this release-verifier repair.
