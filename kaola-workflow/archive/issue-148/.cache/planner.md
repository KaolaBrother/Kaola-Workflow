# Planner Output — issue-148

## Recommendation: Option A — Full Implementation

### Option A (RECOMMENDED)
- **Summary**: Port `cmdStaleWorktreeCheck` + `extractIssueNumber` + `worktreeDirtyState` into both GitLab and Gitea claim scripts. Add dispatch + usage string. Add stale tests (5 sub-cases). Add GL/GT invocation examples to `docs/api.md`.
- **Pros**: Closes real feature gap; makes README's shared-surface command table promise true; reuses already-imported `issueIsClosed` (no new forge API); mechanical duplication of proven logic with only prefix swapped.
- **Cons**: Largest LOC — ~58-line function ×2 + 2 helpers ×2 + tests ×2 + docs; touches 5 files.
- **Risk**: Low. No new external deps, no new forge API, no shared module. Main risk: forgetting prefix swap in `extractIssueNumber` — caught by tests.
- **Complexity**: Medium (LOC-driven, not conceptual difficulty).
- **Architectural fit**: Excellent — per-edition copies are exactly the existing pattern.

### Option B — Doc-Only Fix
- **Summary**: Narrow `docs/api.md` to GitHub-only. No code changes.
- **Pros**: Smallest change; zero regression risk.
- **Cons**: Leaves feature gap. README:461/505 (edition-shared command table) already promises the command for all editions — Option B would require README caveats too, making it not truly one-file. Codifies permanent asymmetry.
- **Risk**: Low technical, medium product.
- **Complexity**: Low.

### Option C — Shared Helper Module
- **Reject**: Violates per-edition isolation convention. No cross-edition shared modules between GitHub and plugins.

## Key Binding Constraint
README:461/505 edition-shared command table already promises `stale-worktree-check` for all editions. Option B is not truly doc-only.

## Parallelization Suggestion
GL-1/GT-1 = claim-script implementation (parallel); GL-2/GT-2 = tests (parallel, after GL-1/GT-1).

## Not to Build
- Do NOT export `cmdStaleWorktreeCheck` from `module.exports` (GitHub doesn't)
- Do NOT unify `extractIssueNumber` across editions — per-edition prefix copies are the pattern
- Do NOT add parity assertion to `validate-workflow-contracts.js`
- Do NOT port all 6 GitHub test sub-cases — only 5 forge-specific ones needed
- Do NOT touch root `scripts/` GitHub script or its mirror
- Do NOT edit CHANGELOG line 19

## Files
- Reference: `scripts/kaola-workflow-claim.js:566-623` (cmdStaleWorktreeCheck), `:122` (extractIssueNumber), `:127` (worktreeDirtyState)
- Target GL: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (dispatch 615-631, prefix at 523)
- Target GT: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (dispatch 600-616, prefix at 508)
- Tests GL: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Tests GT: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Docs: `docs/api.md` (add GL/GT invocation; lines 202/266/270-272 become accurate once implemented)
