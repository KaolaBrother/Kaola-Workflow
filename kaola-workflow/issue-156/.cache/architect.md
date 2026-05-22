# Architect — issue-156

## Key Design Decisions

- Two independent work products: Task A (git tag publish) and Task B (code changes).
- CHANGELOG guard: `assert(read('CHANGELOG.md').includes('## [' + rootVersion + ']'), ...)` inserted after line 281 of validate-workflow-contracts.js.
- Tag: `kaola-workflow--v3.13.0` on `fc1219b` (confirmed release commit). Push only the single tag, never `--tags`.
- Mirror via `cp` only (not hand-edit) to guarantee byte-identity.
- README: fix single-dash to double-dash, add edition policy and commit-selection guidance.

## Build Sequence

**Task A (independent git op):**
1. `git tag kaola-workflow--v3.13.0 fc1219b`
2. `git push origin kaola-workflow--v3.13.0`
3. Verify: `git ls-remote --tags origin | grep kaola-workflow--v3.13.0`

**Task B (code changes → PR):**
1. Insert CHANGELOG guard into `scripts/validate-workflow-contracts.js` after line 281
2. Mirror: `cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
3. Fix README release checklist (lines 426-435)
4. Validate: `node scripts/simulate-workflow-walkthrough.js` + `npm test`

## Write Sets

| Task | Files |
|------|-------|
| A | none (git refs only) |
| B1 | `scripts/validate-workflow-contracts.js` |
| B2 | `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` |
| B3 | `README.md` |

No write-set overlaps.

## CHANGELOG Guard (exact insert)

```js
assert(
  read('CHANGELOG.md').includes('## [' + rootVersion + ']'),
  'CHANGELOG.md must contain "## [' + rootVersion + ']" heading matching package.json version (' + rootVersion + ')'
);
```

## README Region (lines 426-435) to replace

Current (wrong):
```
git tag kaola-workflow-v<X.Y.Z>
git push origin main --tags
```

Replacement:
```bash
npm test
git diff --check
git tag kaola-workflow--v<X.Y.Z> <release-commit>
git push origin kaola-workflow--v<X.Y.Z>
```
Plus: (1) tag the specific release commit (the commit that bumped package.json), not HEAD; (2) GitHub/main tag required, GitLab optional, Gitea no separate tag; (3) never `--tags`.
