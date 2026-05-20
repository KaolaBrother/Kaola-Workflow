# Phase 2 - Ideation: issue-132

## Approaches Evaluated

### Option A: Port GitHub else block verbatim to GitLab/Gitea
- Summary: Copy the `else` block from `scripts/kaola-workflow-claim.js` `cmdFinalize` into both plugin scripts, with forge-specific symbol names.
- Pros: Exact parity, proven logic, minimal diff.
- Cons: None significant.
- Risk: Low
- Complexity: Small

### Option B: Factor into shared helper
- Summary: Extract archive-commit logic into a shared module.
- Pros: Single source of truth.
- Cons: Requires new shared module; overkill for 3-forge parity fix.
- Risk: Low
- Complexity: Medium

## Selected Approach
Option A — port verbatim. Smallest diff, proven logic, no new abstractions needed.

## Out of Scope
- Shared module refactor
- Changes to GitHub baseline

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
