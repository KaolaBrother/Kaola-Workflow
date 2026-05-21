# Advisor — Ideation Gate: issue-151

## Verdict: Continue with Option C (Hybrid)

## Confirmation
Approach C is correct and matches the existing `docs/api.md` convention.

## Gaps Found

### 1. Line 466 coverage gap (planner addressed 461 and 467 but not 466)
`kaola-workflow-sink-merge.js` on line 466 is also a GitHub-only script name flagged in Phase 1. Step 2 should expand to cover BOTH rows 466 and 467 (merge sink and PR sink), or add an explicit step. Otherwise the merge-sink row stays GitHub-only while the adjacent PR-sink row goes triad — inconsistent.

### 2. Retired-tokens guard verification needed
`validate-workflow-contracts.js` lines 42-48 enforce absence of specific tokens in README. New wording ("the configured forge", "forge labels", "forge issue state") must be checked against the retired-tokens list before committing. A single grep is sufficient.

### 3. Line 482 guarded-string adjacency (highest-risk edit)
The guard is `assertIncludes('No lease/session layer remains.')` — substring match. After editing line 482, run: `grep -c "No lease/session layer remains." README.md` to confirm count ≥ 1 before moving on.

## Specific Directives
- **Keep Step 6 (line 583 intent literals)**: keep quoted strings, reframe ownership as GitHub-edition-specific; do NOT let any editor "neutralize" those code literals.
- **Heading rename (line 611) is safe**: no validator asserts "GitHub roadmap cycle".
- **Validation cadence**: run both validators ONCE after all README edits in one batch + one-word Gitea fix. Do not rerun mid-batch.
- **Architect should produce per-line task entries** so Phase 4 can verify each edit independently.

## Summary
All three gaps are resolvable without changing approach. Proceed to Phase 3.
