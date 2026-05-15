# Architect Blueprint Notes - issue-23

## Shape

Keep one deterministic classifier implementation style and mirror it into the packaged Codex plugin copy.

## Interfaces

- `extractFilePaths(text) -> Set<string>`: exact repository-looking paths from Markdown, issue body text, `touches:` metadata, and phase artifacts.
- `extractCoarseAreas(text) -> Set<string>`: area fallback derived from exact paths and directory mentions.
- `scanClaimedOverlap(candidatePaths, candidateAreas, candidateAreaLabels, claimedLocks, root) -> overlap flags`.
- `classify(issue, claimedLocks, root) -> { verdict, reasoning }`: unchanged public output shape.

## Build Order

1. Update root classifier helpers and verdict precedence.
2. Mirror root classifier changes into plugin classifier.
3. Expand root simulation Epic Case 6.
4. Add packaged plugin classifier regression coverage.
5. Update static validators, docs, and changelog.
6. Run focused tests before full package tests.

## Validation

- `node scripts/simulate-workflow-walkthrough.js`
- `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- `node scripts/validate-workflow-contracts.js`
- `node scripts/validate-kaola-workflow-contracts.js`
- `npm test`
