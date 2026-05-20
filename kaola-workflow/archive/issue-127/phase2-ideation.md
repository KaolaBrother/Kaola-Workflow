# Phase 2 - Ideation: issue-127

## Approaches Evaluated

### Option A: Inline Label Removal (Selected)
- Summary: Add 1-2 guarded `try/catch` label-removal calls directly next to each existing `closeIssue` call in the three sink-merge scripts. No new exports, no new abstractions.
- Pros: Surgical; reuses existing OFFLINE/null guard pattern; no cross-module coupling; no duplicate comments; GitLab/Gitea get unit coverage via `withForge` tests; label literal matches existing convention
- Cons: Label literal `'workflow:in-progress'` referenced via `forge.CLAIM_LABEL` in 3 files (matches existing convention — CLAIM_LABEL already duplicated by design)
- Risk: Low
- Complexity: Small

### Option B: Export clearAdvisoryClaim and Import in Sink-Merge
- Summary: Add `clearAdvisoryClaim` to `module.exports` of each claim script; import and call in each sink-merge
- Pros: Reuses existing helper function
- Cons: `clearAdvisoryClaim` posts a second comment when `reason` is truthy — undesirable since sinks already post "Merged via..." note. GitHub implementation uses `ghExec` (local to claim.js), not a forge adapter — cross-forge signature is incompatible. Widens API surface unnecessarily.
- Risk: Medium
- Complexity: Medium

### Option C: Shared Cross-Forge removeAdvisoryLabel Helper
- Summary: New utility function that abstracts label removal across all three forge editions
- Pros: Single conceptual location
- Cons: Three forges have fundamentally different label APIs (`ghExec` vs `forge.updateIssue` vs `forge.updateIssueLabels`); no clear home for the helper; new abstraction with no reuse beyond this one call site; broadest footprint; violates "keep it simple" rule
- Risk: Medium
- Complexity: Large

## Advisor Findings
Advisor confirmed Option A with no changes to the recommendation. Key gotchas noted:
1. **CHANGELOG entry** is a separate Phase 3 task (Task E), not bundled into an implementation task
2. **One-time cleanup** of 14 stale closed issues deferred to Phase 6 Step 7; re-query at that time
3. **Worktree constraint**: all Phase 4 agents must use `Working directory: /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-127/`
4. **Pre-flight verification**: confirm exact line numbers from worktree before writing phase3-plan.md
5. **Test assertion style**: use `forge.CLAIM_LABEL` (constant), not the literal string
6. **Future consideration**: root cause of cmdFinalize clearAdvisoryClaim not preventing stale labels is out of scope for #127

## Selected Approach
**Option A — Inline label removal**

Rationale: Smallest footprint, directly mirrors the `clearAdvisoryClaim` pattern without introducing cross-module coupling or duplicate comment risk. Matches the project's non-fatal `try/catch (_) {}` convention. GitLab and Gitea get unit coverage via the existing `withForge` test infrastructure. The label literal duplication is idiomatic in this codebase.

## Implementation Sites (5 code sites + 2 test files + CHANGELOG)

- **GitHub** `scripts/kaola-workflow-sink-merge.js` Step 8 (after issue close): `try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress']); } catch (_) {}`
- **GitLab** `kaola-gitlab-workflow-sink-merge.js` — 2 sites: `closeLinkedIssue` (after `forge.closeIssue`) + Step 8 (after `forge.closeIssue`): `try { forge.updateIssue(issueIid, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}`
- **Gitea** `kaola-gitea-workflow-sink-merge.js` — 2 sites: `closeLinkedIssue` (after `forge.closeIssue`, using existing `projectInfo`) + Step 8 (after `forge.closeIssue`, using `readProjectInfo(root, args.project)`): `try { forge.updateIssueLabels(projectInfo, issueIid, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}`
- **test-gitlab-sinks.js**: extend closeIssue test to stub `updateIssue` and assert called with `forge.CLAIM_LABEL`
- **test-gitea-sinks.js**: extend closeIssue test to stub `updateIssueLabels` and assert called with `forge.CLAIM_LABEL`
- **CHANGELOG.md**: `### Fixed` entry for issue #127

## Out of Scope (explicit)
- No shared cross-forge label-removal helper
- No `clearAdvisoryClaim` export or import in any sink-merge script
- No comment posting on label clear (sinks already post "Merged via..." note)
- No change to `closeLinkedIssue` function signature or `runDirectMerge` control flow
- No new GitHub unit test harness (subprocess-only coverage is the pre-existing state and is accepted)
- No changes to any claim script
- No OFFLINE guard changes to GitLab/Gitea paths (safe-fail via try/catch is sufficient)
- One-time cleanup script NOT committed to repo

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
