# Phase 2 - Ideation: issue-23

## Approaches Evaluated

### Option A: Exact-path scope added to existing classifier (SELECTED)

- Summary: Add exact repository path extraction to `kaola-workflow-classifier.js`, check exact overlap first, then keep the current area-level and label fallback behavior.
- Pros: Smallest change surface; preserves existing verdict contract; directly satisfies exact shared-infra red behavior; easy to cover in current simulation harness.
- Cons: Still relies on issue/phase artifacts mentioning paths; cannot infer hidden conflicts.
- Risk: Low.
- Complexity: Medium.
- What not to build: no new scheduler, no semantic/model classifier, no git merge simulation.

### Option B: New structured issue metadata schema

- Summary: Make `touches:` metadata the primary source of truth and require roadmap/issue authors to maintain it.
- Pros: Cleaner future data model; less regex ambiguity when metadata is present.
- Cons: Does not cover existing GitHub issue bodies or phase artifacts by itself; needs migration and validation rules outside this issue.
- Risk: Medium.
- Complexity: Medium-large.
- What not to build: no mandatory schema migration in this issue.

### Option C: Pre-claim merge or semantic conflict simulation

- Summary: Try to detect conflicts through git merge simulation or model-based semantic analysis before claim.
- Pros: Could catch conflicts not mentioned in metadata.
- Cons: Explicitly out of scope; slower, stateful, and too heavy for startup routing.
- Risk: High.
- Complexity: Large.
- What not to build: no merge simulation, no model-dependent analysis.

## Advisor Findings

The advisor recommends Option A. Exact path overlap must be evaluated before shared-infra area fallback; `plugins/kaola-workflow/...` paths must be extractable; offline `touches:` metadata and ordinary file paths should share the same extraction path; area-label overlap should remain yellow unless exact paths prove red; and tests must distinguish exact shared-infra file overlap from directory-only shared-infra overlap.

## Selected Approach

Option A - targeted in-place exact-path extraction.

Rationale: It delivers the issue contract without changing bootstrap semantics. The existing classifier already has the right deterministic structure and reads the right claimed artifacts. The missing part is carrying exact path sets alongside coarse areas and applying exact overlap before area fallback.

## Out of Scope

- Model-based semantic conflict analysis.
- Git merge simulation before claim.
- New user commands.
- Mandatory issue metadata schema migration.
- Claim bootstrap behavior changes beyond consuming red/yellow/green verdicts already supported.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | inline | .cache/planner.md | Spawned agents require explicit user request in this Codex session. |
| advisor ideation gate | inline | .cache/advisor-ideation.md | Strongest available advisor review performed locally. |
