# Phase 2 - Ideation: issue-151

## Approaches Evaluated

### Option A: Pure forge-neutral prose
- Summary: Replace every "GitHub" in body with generic phrasing; never name specific scripts.
- Pros: Minimal churn; clean prose
- Cons: Hides concrete script names backing each edition; loses reference value of scripts table; inconsistent with `docs/api.md`
- Risk: Low
- Complexity: Small

### Option B: Pure inline-triad expansion
- Summary: Expand every forge mention to full `(GitHub) / (GitLab) / (Gitea)` triad inline everywhere
- Pros: Maximally explicit
- Cons: Bloats narrative prose; over-engineered for explanatory text
- Risk: Low correctness, high readability cost
- Complexity: Medium

### Option C: Hybrid (SELECTED)
- Summary: Triad mappings in reference cells (scripts table, subcommand table); forge-neutral phrasing in explanatory prose; generic headings
- Pros: Matches established `docs/api.md` reference convention; surgical; readable; directly satisfies "forge-neutral docs + explicit mappings where commands differ"
- Cons: Requires judgment per occurrence rather than mechanical find/replace
- Risk: Low
- Complexity: Small-Medium

## Advisor Findings
Option C confirmed. Three gaps identified and incorporated:

1. **Line 466 coverage**: The merge-sink row (`kaola-workflow-sink-merge.js`) must also get a triad mapping alongside line 467 (PR sink) — not just line 467 alone.
2. **Retired-tokens guard**: New wording must be checked against `validate-workflow-contracts.js` lines 42-48 retired-tokens list before committing.
3. **Line 482 guarded-string adjacency**: After editing, `grep -c "No lease/session layer remains." README.md` must confirm count ≥ 1.

Specific directive: keep quoted intent-detection literals on line 583 — reframe as GitHub-edition-specific; do not neutralize code literals.

## Selected Approach
**Option C — Hybrid**, with line 466 added to the scope (merge-sink triad) per advisor gap finding.

**Implementation steps:**
1. README:461 — claim row: add GitLab/Gitea script name triad
2. README:466 — merge-sink row: add triad (kaola-gitlab-workflow-sink-merge.js, kaola-gitea-workflow-sink-merge.js)
3. README:467 — PR/MR-sink row: add triad + forge-neutral CLI description
4. README:502 — release row: "advisory GitHub labels" → "advisory forge labels"
5. README:504 — watch-pr row: "when GitHub reports" → forge-neutral; note GitLab uses `watch-mr`
6. README:482 — "GitHub issue/PR state" → forge-neutral; preserve "No lease/session layer remains." verbatim
7. README:559 — "Fetch open GitHub issues" → "Fetch open forge issues"
8. README:583 — keep quoted intent literals; reframe as GitHub-edition-specific
9. README:595,601,602 — watch-pr bullets: "GitHub labels/reports" → forge-neutral
10. README:611 — "## GitHub roadmap cycle" → "## Roadmap cycle"; line 613 forge-neutral
11. README:704 — "GitHub issue state" → forge-neutral; preserve "Parallel active work" heading
12. Gitea workflow-next.md:154 — "MRs" → "PRs"

## Out of Scope (explicit)
- README lines 124-126, 247-249, 379-381, 449-451 (already forge-aware framing, install paths, version table)
- GitLab plugin `workflow-next.md` (already correct)
- Any script logic changes
- New README sections, footnotes, or restructuring
- `docs/api.md` (already correct, serves as reference)
- `scripts/validate-workflow-contracts.js` itself (guard assertions must survive, not be changed)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
