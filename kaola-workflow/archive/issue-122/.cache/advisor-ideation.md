# Advisor — Ideation Gate: issue-122

## Verdict
Option A is sound. No missed approaches, no blocking risks. Three implementation refinements to carry into Phase 3.

## Findings

### 1. Signature Asymmetry Is Valid
- Gitea: `maybeAutoMergeFromConfig(pr, project, configOverride)` — project needed because `forge.mergePullRequest` requires it
- GitLab: `maybeAutoMergeFromConfig(mr, configOverride)` — no project, `forge.mergeMergeRequest(mrIid, opts)` takes only iid
- Not an inconsistency; force by forge API shape. Name explicitly in Phase 3 blueprint.

### 2. Test Strategy: configOverride + HOME-stub Coexist
- `configOverride` eliminates HOME-stubbing for the trigger tests (positive/negative on auto-merge call)
- One separate HOME-stub test exercises `readConfig()` itself: path resolution, JSON parse fallback, defaults merge
- Both are needed — they test different units

### 3. Call the Wrapper, Not the Forge Directly
- `maybeAutoMergeFromConfig` should call the existing `mergePullRequest(pr, project, args)` wrapper (line 191 in Gitea sink) with `{ autoMerge: true, squash: true, removeSourceBranch: true }`
- Same for GitLab: call `mergeMergeRequest(mr.mr_iid, { autoMerge: true, squash: true, removeSourceBranch: true })`
- The wrapper is already DRY and maps args→forge opts correctly

### 4. Downstream Note for Architect (Non-blocking)
- Verify Gitea forge's `mergePullRequest` actually honors `autoMerge: true` — issue-121 only exercised synchronous merge path (`Do`, `delete_branch_after_merge`, `head_commit_id`)
- If `autoMerge` is a no-op in the forge, that's a separate scope gap
- Note for the architect; do not expand scope of issue-122

## Risks
None blocking. All risks are Low.

## Conclusion
Option A is the correct approach. Carry the 4 findings above into the Phase 3 blueprint.
