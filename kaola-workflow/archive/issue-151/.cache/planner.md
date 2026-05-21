# Planner — issue-151: Forge-neutral README and Gitea workflow wording fix

## Summary
README body sections drifted to GitHub-only wording. Plan makes them forge-neutral, adds triad mappings where commands differ, and fixes one "MRs" leak in Gitea workflow-next.md.

## Approaches

### Option A — Pure forge-neutral prose
Replace every "GitHub" in body with generic phrasing ("the configured forge"); never name specific scripts.
- Pros: Minimal churn; clean prose.
- Cons: Hides concrete script names backing each edition; loses reference value of operational-scripts table.
- Risk: Low. Complexity: Low.

### Option B — Pure inline-triad expansion
Expand every forge mention to full `(GitHub) / (GitLab) / (Gitea)` triad inline, including narrative paragraphs.
- Pros: Maximally explicit.
- Cons: Bloats narrative prose; over-engineered for explanatory text.
- Risk: Low correctness, high readability cost. Complexity: Medium.

### Option C — Hybrid (RECOMMENDED)
Triad mappings in reference cells (scripts table, subcommand table); forge-neutral phrasing in explanatory prose; generic headings.
- Pros: Matches established `docs/api.md` convention; surgical; readable.
- Cons: Requires judgment per occurrence.
- Risk: Low. Complexity: Low-Medium.

## Recommended: Option C

## Implementation Steps

1. Operational scripts table claim row (README:461) — add GitLab/Gitea script name triad
2. Operational scripts table PR sink row (README:467) — add triad + forge-neutral CLI description
3. Subcommand table release row (README:502) — "GitHub labels" → "forge labels"
4. Subcommand table watch-pr row (README:504) — "when GitHub reports" → forge-neutral; note GitLab uses `watch-mr`
5. Active folder paragraph (README:482) — "GitHub issue/PR state" → forge-neutral; preserve "No lease/session layer remains." verbatim
6. Agent issue selection (README:559) — "Fetch open GitHub issues" → "Fetch open forge issues"
7. PR sink narrative (README:583) — keep intent literals, reframe as GitHub-edition-specific; do not neutralize code literals
8. watch-pr bullets (README:595, 601, 602) — "GitHub labels/reports" → forge-neutral
9. Roadmap cycle heading (README:611) — "## GitHub roadmap cycle" → "## Roadmap cycle"; line 613 "GitHub issues" → forge-neutral
10. Parallel active work (README:704) — "GitHub issue state" → forge-neutral; preserve "Parallel active work" heading
11. Gitea workflow-next.md line 154 — "MRs" → "PRs"

## Explicitly NOT to build
- No changes to README lines 124-126, 247-249, 379-381, 449-451 (already forge-aware)
- No changes to GitLab plugin workflow-next.md (correct)
- No script logic changes
- No new README sections
- No edits to docs/api.md

## Success Criteria
- README body forge-neutral; reference cells have triads
- "No lease/session layer remains." preserved verbatim
- Gitea workflow-next.md line 154 says "PRs"
- validate-workflow-contracts.js passes
- simulate-workflow-walkthrough.js passes

## Missing facts
None material.
