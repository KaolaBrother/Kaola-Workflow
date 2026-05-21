# Phase 2 - Ideation: issue-137

## Approaches Evaluated

### Option A: Sibling assertX helper (RECOMMENDED)
- Summary: Add `assertBranchPushedToUpstream(mainRoot, branch)` adjacent to `assertNoLiveWorkflowFolder` in each fork's sink-merge script. Call from `main()` after `assertNoLiveWorkflowFolder`, before merge-base check. Skip when `OFFLINE === true`.
- Pros: Follows established guard pattern exactly; minimal scope; easy to test; consistent with existing `assertCleanWorktree` / `assertNoLiveWorkflowFolder` precedents; OFFLINE skip is already well-understood.
- Cons: Requires repeating the function definition in three forge files (main, gitlab, gitea).
- Risk: Low
- Complexity: Small

### Option B: Inline check in main()
- Summary: Inline `rev-list`/`log` calls directly in `main()` without a named helper function.
- Pros: Fewer lines of code.
- Cons: Breaks the established `assert*` naming convention; harder to test in isolation; inconsistent with existing guard style.
- Risk: Low
- Complexity: Small

### Option C: Shared publish-guard module
- Summary: Extract the check to a new shared module imported by all three forge sink-merge scripts.
- Pros: Single implementation point.
- Cons: Speculative abstraction — no current second caller; gitlab/gitea scripts diverge in other places, forcing a bigger refactor than #137 warrants; couples independently deployable forge plugins.
- Risk: Medium
- Complexity: Large

## Advisor Findings

Approach A approved. Multi-forge blind spot identified and resolved:

The guard must be added to all three sink-merge scripts:
1. `scripts/kaola-workflow-sink-merge.js` (Claude/Codex main)
2. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
3. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`

Both gitlab and gitea scripts confirmed to have identical `assertCleanWorktree` / `assertNoLiveWorkflowFolder` / `OFFLINE` shape. Approach A repeated per file is the correct path — do not extract to a shared module. The Codex plugin copy (`plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`) receives the guard via validate-script-sync when the main script is updated.

See `.cache/advisor-ideation.md` for full advisor output.

## Selected Approach

**Approach A — sibling assertX helper, repeated per forge file**

Rationale: Matches existing guard convention exactly. Low risk, small scope. The three forge files share the same `assertCleanWorktree` / `assertNoLiveWorkflowFolder` / `OFFLINE` pattern so the implementation is mechanical. No shared module needed.

## Out of Scope (explicit)

- `sink-pr.js` and `sink-mr.js` — different flow; push happens before guard is needed
- Shared module extraction (YAGNI, would force larger refactor)
- Force/override knob beyond OFFLINE skip
- Any changes to `cmdFinalize` or `kaola-workflow-claim.js`

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
