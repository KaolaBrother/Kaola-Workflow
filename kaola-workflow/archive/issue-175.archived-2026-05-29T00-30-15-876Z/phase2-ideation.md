# Phase 2 - Ideation: issue-175

## Approaches Evaluated

### Option A: Parallel Port (selected)
- Summary: Port all 6 files in a single PR — both GitLab and Gitea editions changed atomically
- Pros: No drift window between editions; side-by-side diff in one PR is the cheapest asymmetry catch; matches existing copy-evolved per-edition pattern; mechanical symmetric change
- Cons: Slightly larger PR than a single-forge fix
- Risk: Low
- Complexity: Small

### Option B: Sequential Forge-by-Forge
- Summary: Fix GitLab first, then Gitea in a follow-up PR
- Pros: Smaller individual PRs
- Cons: Creates a window where one edition is fixed but the other isn't; double PR overhead; higher drift risk
- Risk: Low-Medium
- Complexity: Small (×2)

### Option C: Shared Guard Module
- Summary: Extract the OFFLINE guard into a shared module imported by both editions
- Pros: Single source of truth for guard logic
- Cons: Poor architectural fit — each forge plugin is installed in isolation; no shared module mechanism exists in the current plugin layout; introduces new abstraction not needed for a mechanical port
- Risk: Medium
- Complexity: Large

## Advisor Findings

Option A confirmed. No missed approaches identified.

**Blocking clarification**: The existing test at GitLab ~line 819 and Gitea ~line 820 asserts `verdict: 'green'` for the no-evidence OFFLINE case. This wrong test **must be REPLACED**, not supplemented — leaving it alongside a new `target_unverified` assertion would create conflicting assertions for the same scenario.

**Two call sites per classifier**: Both `classifyIssue()` AND `cmdClassify()` in each forge need the OFFLINE guard.

**Test harness shape**: New tests must use the same invocation pattern as the existing test at ~line 819/820. Do not introduce a new pattern.

**`localRoadmapIssue()` note**: Returns an empty stub (not null) — use `fs.existsSync(roadmapFile)` guard verbatim from GitHub reference. No re-checking needed.

## Selected Approach

Option A: Parallel Port

Port all 6 files in a single atomic PR. Two OFFLINE call sites per classifier (`classifyIssue()` and `cmdClassify()`), field name `issue_iid` (not `issue_number`), replace the wrong existing test (do not supplement it), and mirror the GitHub guard pattern verbatim.

## Out of Scope (explicit)

- No shared module extraction
- No changes to the GitHub edition (it is the reference)
- No new exit codes or output channels
- No refactoring of `classifyIssue()` signature

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
