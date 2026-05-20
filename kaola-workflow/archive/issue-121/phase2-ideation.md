# Phase 2 - Ideation: issue-121

## Approaches Evaluated

### Option A: Fix + export checkServerVersion + explicit body assertions
- Summary: Apply two one-line production fixes, export `checkServerVersion` for direct testability, update existing stub key, add 6 new tests using `calls` array inspection for exact body assertions.
- Pros: Minimal diff; mirrors existing `checkRepoSquashEnabled` export precedent; `calls` array assertions are strong oracles vs. stub-key matching.
- Cons: None meaningful — straightforward surgical fix.
- Risk: Low
- Complexity: Small

### Option B: Fix only, no export, no new tests
- Summary: Apply the two production fixes without exporting `checkServerVersion` and without adding body-assertion tests.
- Pros: Even smaller diff.
- Cons: No regression protection for `checkServerVersion` behavior; merge body shape remains un-asserted; weak oracle at line 122 still passes with either field name.
- Risk: Medium (no test coverage for the fixed logic)
- Complexity: Small

## Advisor Findings
Approach A endorsed. Field-name resolution (`head_commit_id`) confirmed correct from Gitea SDK v0.17 (official OpenAPI). Critical warnings:
1. **Weak oracle trap**: Existing test at line 122 passes with either the old or new stub key (runner returns `''` for unmatched keys → `parseJson` returns `{}` → no throw). New tests MUST assert against captured `calls` array, not stub-key matching.
2. **JSON key order is load-bearing**: Build order is `Do`, `delete_branch_after_merge`, then conditional `head_commit_id` — V8 preserves insertion order. Serialized JSON assertions depend on this order.

## Selected Approach
**Option A** — Fix + export checkServerVersion + explicit body assertions.

Rationale: The export mirrors existing `checkRepoSquashEnabled` precedent. Without `calls` array assertions, the fixes have no meaningful test coverage. Approach B would leave the codebase in a state where the bug could silently regress.

## Out of Scope (explicit)
- `merge_when_checks_succeed` — not adding
- Auto-merge body fields beyond the server-version guard fix
- `merge_message_field` / `merge_title_field` handling — leaving untouched
- GitHub/GitLab changes

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
