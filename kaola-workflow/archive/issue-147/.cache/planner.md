# Planner Output — issue-147

## Recommendation: Option A — Add `regenerateRoadmap` to roadmap modules

### Option A (RECOMMENDED)
- **Summary**: Each plugin roadmap module gains a `regenerateRoadmap(root)` export (composing the existing `guardAgainstMissingRoadmapSource` + `readRoadmapIssues` + `buildRoadmapContent` + `writeFileAtomicReplace`). `cmdGenerate` refactors to delegate. Claim scripts require their roadmap module and insert the GitHub-shaped cleanup block.
- **Pros**: Exact structural parity with GitHub. Four-line composition lives in one place per edition. Maintainers find the same shape across all three forges.
- **Cons**: Touches roadmap module (one new function + export + tiny `cmdGenerate` refactor).
- **Risk**: Low — composition already lives in `cmdGenerate`; extraction is mechanical.
- **Complexity**: Small

### Option B — Inline regeneration using exported primitives
- **Summary**: Call `readRoadmapIssues` + `buildRoadmapContent` + `writeFileAtomicReplace` directly in claim script cleanup block. No new export.
- **Pros**: No roadmap module export change.
- **Cons**: Duplicates four-line orchestration in two claim scripts. Diverges from GitHub. Risks dropping `guardAgainstMissingRoadmapSource`.
- **Risk**: Medium
- **Complexity**: Small-Medium

### Option C — Shared cross-edition helper
- **Summary**: Extract `regenerateRoadmap` into a shared module.
- **Pros**: One implementation total.
- **Cons**: Breaks per-edition isolation convention. Out of scope for a bug fix.
- **Risk**: High
- **Complexity**: Large — rejected.

## Implementation Steps (Option A)

1. Add + export `regenerateRoadmap(root)` to GitLab roadmap module; refactor `cmdGenerate`
2. Add + export `regenerateRoadmap(root)` to Gitea roadmap module; refactor `cmdGenerate`
3. GitLab claim: add require + `archiveIssueNumber` extraction + cleanup block gated on `statusValue === 'closed'`
4. Gitea claim: same as #3 for Gitea edition
5. GitLab test: plant `.roadmap/issue-44.md` via `writeIssueRecord`; assert deletion + ROADMAP.md no longer has `#44`
6. Gitea test: same as #5 for Gitea edition

## Not to Build
- No shared cross-edition module
- No retry/rethrow in cleanup block (non-fatal by design)
- No roadmap cleanup on `release`, `discard`, or `abandoned` paths
- No changes to `watchMergeRequests` itself

## Missing Facts
None. All facts verified in Phase 1.
