# Phase 2 - Ideation: issue-148

## Approaches Evaluated

### Option A: Full Implementation (SELECTED)
- **Summary**: Port `cmdStaleWorktreeCheck` + `extractIssueNumber` + `worktreeDirtyState` into both GitLab and Gitea claim scripts. Add dispatch + usage string update. Add 5 sub-case tests per edition. Add GL/GT invocation examples to `docs/api.md`.
- **Pros**: Closes real feature gap; makes README edition-agnostic command table promise true (README:461, :505); reuses already-imported `issueIsClosed` — no new forge API; mechanical duplication of proven logic with only prefix swapped.
- **Cons**: Largest LOC — ~58-line function ×2 + 2 helpers ×2 + tests ×2 + docs; touches 5 files.
- **Risk**: Low. No new external deps, no new forge API, no shared module. Main risk: wrong prefix in `extractIssueNumber` — caught by tests.
- **Complexity**: Medium (LOC-driven, not conceptual).
- **Architectural fit**: Excellent — per-edition copies are exactly the existing pattern.

### Option B: Doc-Only Fix
- **Summary**: Narrow `docs/api.md` to GitHub-only. No code changes.
- **Pros**: Smallest change; zero regression risk.
- **Cons**: README:461/505 already promises the command for all editions with no forge qualifier — Option B would also require README caveats, making it not truly doc-only. Codifies permanent asymmetry.
- **Risk**: Low technical, medium product.
- **Complexity**: Low.
- **Rejected**: README binding constraint rules this out.

### Option C: Shared Helper Module
- **Rejected**: Violates per-edition isolation convention. No cross-edition shared modules between GitHub and plugins.

## Advisor Findings

Advisor confirmed Option A. Key strengthening points:
1. `git for-each-ref` must use forge-specific prefix (`refs/heads/workflow/gitlab-issue-*`, `refs/heads/workflow/gitea-issue-*`) — not the generic prefix — to avoid cross-forge branch interference.
2. `extractIssueNumber` regex must be per-edition: GL `/workflow\/gitlab-issue-(\d+)/`, GT `/workflow\/gitea-issue-(\d+)/`.
3. 5 sub-cases per edition (not 6): (1) closed worktree stale, (2) archived worktree stale, (3) open+active not stale, (4) deleted-dir state:missing, (5) loose stale branch. The 6th GitHub sub-case requires a `gh` shim not applicable to GL/GT.
4. Use `withForge({ viewIssue })` pattern for forge stubs in tests — not `gh` shims.
5. Do not export `cmdStaleWorktreeCheck` — GitHub doesn't; GL/GT must match.

Full advisor response: `.cache/advisor-ideation.md`

## Selected Approach
**Option A — Full Implementation**

Rationale: README:461 and :505 make a forge-agnostic promise that `stale-worktree-check` is a supported subcommand for all editions. Option B (doc-only) cannot be truly doc-only without also adding README caveats, making the scope roughly equal but without closing the feature gap. Option A is structurally identical to the issue-147 pattern (adding parity between GitHub and plugins) and carries low implementation risk.

## Out of Scope (explicit)
- Do NOT export `cmdStaleWorktreeCheck` from `module.exports` in GL or GT claim scripts
- Do NOT unify `extractIssueNumber` across editions — per-edition prefix copies are the pattern
- Do NOT add parity assertion to `validate-workflow-contracts.js`
- Do NOT port all 6 GitHub test sub-cases — only 5 forge-specific ones needed
- Do NOT touch root `scripts/` GitHub script or its mirror
- Do NOT edit CHANGELOG line 19

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
