# Phase 2 - Ideation: issue-112

## Approaches Evaluated

### Option A: Verbatim copy + name substitutions
- Summary: Sed-style port — mr→pr, glab→tea, IID→number throughout
- Pros: Fastest to draft
- Cons: `mergePullRequest(project, prNumber, opts)` signature is structural, not cosmetic — pure substitution produces broken code; squash-merge AC has no GitLab analog
- Risk: High — produces a script that fails its own unit tests
- Complexity: Small (LOC), Large (defects)

### Option B: Direct port with localized adaptation (selected)
- Summary: Keep file structure 1:1 with GitLab; adapt only what Gitea API requires
- Key adaptations: `mergePullRequest` signature, `createIssueComment` replacing `createIssueNote`, `pr_*` state field names, `full_name` persistence in sink-pr, `readProjectInfo` fallback in sink-merge
- Pros: All bug-fix blocks (archive guards, exit codes 0/2/3, FF retry, classifyMergeError) port unchanged; each adaptation is localized and reviewable
- Cons: Adds squash-gate function to forge adapter; adds state field writes in sink-pr
- Risk: Medium — structural but well-scoped
- Complexity: Medium

### Option C: Currying wrappers
- Summary: Pre-bind `project` so function bodies match GitLab verbatim
- Pros: Maximizes textual similarity
- Cons: Unnecessary abstraction that obscures API calls; saves only a handful of lines
- Risk: Low but unneeded complexity
- Complexity: Small

## Advisor Findings

Approach B confirmed. Key verifications:
- `tea pr create` uses cwd-based resolution — no `--repo` flag needed
- `getCoordRoot`, `readActiveFolders`, `removeWorktree` exported from base `scripts/kaola-workflow-claim.js` at lines 631/634/636
- Adding `full_name`/`project_html_url` to `## Sink` block is backward-compatible
- `path_with_namespace` is written by GitLab claim.js (not sink-mr); sink-pr must write `full_name` for issue-112 since claim.js (issue #113) doesn't exist yet
- Missing-`full_name` fallback test is REQUIRED (not optional)

## Selected Approach
**Option B — Direct port with localized adaptation**

Rationale: The `mergePullRequest(project, prNumber, opts)` signature change is the only structural divergence; explicitly threading `project` to two call sites is clearer than hiding it behind wrappers. Persisting `full_name` in workflow-state.md bridges the missing claim.js gap cleanly, and the forge adapter's `discoverProject()` fallback handles older state files. The squash-merge gate belongs on the forge adapter beside the existing `checkServerVersion` for symmetry.

## Out of Scope (explicit)
- Do NOT create `kaola-gitea-workflow-claim.js` (issue #113)
- Do NOT modify base `scripts/` or GitLab plugin
- Do NOT add speculative forge functions
- Do NOT pull in `mr_auto_merge` fix from issue #114 follow-up (belongs in #115/#117)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
