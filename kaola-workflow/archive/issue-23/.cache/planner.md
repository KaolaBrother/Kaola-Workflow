# Planner Notes - issue-23

Scope: compare implementation strategies for exact-path conflict classification without expanding workflow startup into a heavy scheduler.

## Candidate Strategies

1. Extend the existing classifier in place with exact-path sets and keep the current area fallback.
   - Adds `extractFilePaths`, normalizes `touches:` metadata and Markdown path mentions, and checks exact overlap before current area logic.
   - Minimal impact on claim bootstrap because existing `green`/`yellow`/`red`/`blocked` verdict contract stays intact.

2. Introduce a richer per-issue metadata schema and make classifier depend mainly on `.roadmap/issue-N.md`.
   - Useful long term, but incomplete for online GitHub issues unless every issue author follows the schema.
   - Higher migration burden and still needs fallback path extraction.

3. Add pre-claim git merge simulation or semantic analysis.
   - Could catch conflicts that metadata misses.
   - Explicitly out of scope for issue #23 and too heavy for deterministic startup routing.

## Recommended Plan Shape

- Implement exact path extraction as a pure deterministic helper inside both classifier copies.
- Represent candidate and claimed scope as `{ paths, areas, areaLabels }`.
- Check exact path overlap first and return `red`.
- Keep existing unknown-scope, shared-infra yellow, area-label yellow, and dependency behavior.
- Expand Epic Case 6 in the root simulation; add plugin/Codex coverage or static markers so packaged copy cannot drift.
- Update docs and changelog only for user-visible classifier behavior.
