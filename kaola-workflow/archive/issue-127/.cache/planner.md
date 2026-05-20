# Planner Output — Issue #127

## Recommendation: Option A (Inline label removal, no new exports)

## Verified Architecture Facts
- GitHub sink-merge: single close site at Step 8 (lines 203-206); local `ghExec` in-file; `CLAIM_LABEL` not exported from claim.js (must use literal `'workflow:in-progress'`)
- GitLab/Gitea sink-merge: dual-path structure (`skipGit: true` → `closeLinkedIssue` → early return; `skipGit` falsy → production pipeline → Step 8). The two paths are mutually exclusive per run.
- `clearAdvisoryClaim` is NOT exported from any claim script. It also posts a second comment when `reason` is truthy — undesirable for sink-merge which already posts "Merged via..." note.
- `forge` module already imported in GitLab/Gitea sink-merge; `projectInfo` available in both close paths.

## Option A — Inline label removal (Recommended)
- Summary: Add 1-2 guarded label-removal calls directly next to each existing closeIssue call. No new exports, no new abstractions.
- Pros: Surgical; reuses existing OFFLINE/issue guard; no cross-module coupling; no duplicate comments; GitLab/Gitea get unit coverage via withForge tests
- Cons: Label literal repeated across 3 files (matches existing convention)
- Risk: Low | Complexity: Small

## Option B — Export clearAdvisoryClaim and import in sink-merge
- Summary: Add `clearAdvisoryClaim` to module.exports of each claim script; import and call in each sink-merge
- Pros: Reuses existing helper
- Cons: Widens API surface; posts duplicate comment when reason given; GitHub signature incompatible cross-forge; fragile
- Risk: Medium | Complexity: Medium

## Option C — Shared removeAdvisoryLabel helper
- Summary: New utility function across all three forges
- Pros: Single conceptual location
- Cons: Three forges have fundamentally different APIs; new abstraction; broadest footprint; violates "keep it simple" rules
- Risk: Medium | Complexity: Large

## Implementation Sites (Option A)
- GitHub: 1 site — Step 8 (lines 203-206), add `try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress']); } catch (_) {}`
- GitLab: 2 sites — `closeLinkedIssue` after `forge.closeIssue` (line ~122); Step 8 after `forge.closeIssue` (line ~236). Call: `try { forge.updateIssue(issueIid, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}`
- Gitea: 2 sites — `closeLinkedIssue` after `forge.closeIssue` (line ~122, reusing existing `projectInfo`); Step 8 after `forge.closeIssue` (line ~236, using `readProjectInfo(root, args.project)`). Call: `try { forge.updateIssueLabels(projectInfo, issueIid, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}`
- Tests: extend existing `withForge` closeIssue test in each test file to stub `updateIssue`/`updateIssueLabels` and assert called with CLAIM_LABEL

## One-Time Cleanup
14 closed GitHub issues carry `workflow:in-progress`: #126, #125, #119, #117, #116, #115, #113, #103, #89, #88, #86, #85, #82, #81. Run once via `gh issue edit ... --remove-label` loop; do NOT commit this script.

## Explicitly NOT to Build
- No shared cross-forge helper
- No clearAdvisoryClaim export/import in sinks
- No comment posting on label clear (sinks already post "Merged via..." note)
- No change to closeLinkedIssue signature or runDirectMerge control flow
- No new GitHub unit-test harness (GitHub Step 8 unit-test gap is pre-existing and out of scope)
- No changes to claim scripts

## Missing Facts
None.
