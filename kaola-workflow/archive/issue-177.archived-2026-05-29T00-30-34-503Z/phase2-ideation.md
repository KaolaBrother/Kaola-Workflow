# Phase 2 - Ideation: issue-177

## Approaches Evaluated

### Option A: Tags Only
- Summary: Create and push kaola-workflow--v3.15.0 and kaola-workflow--v3.16.0 lightweight tags; no code change
- Pros: Smallest diff, AC1+AC3 satisfied immediately
- Cons: AC2 (validation gap) persists — drift can recur silently
- Risk: Low for change; high that root-cause gap persists
- Complexity: Trivial

### Option B: Tags + Validator (SELECTED)
- Summary: Create/push both tags AND add rootVersion-scoped tag-existence check to validate-workflow-contracts.js (+ byte-identical Codex mirror)
- Pros: Satisfies AC1, AC2, AC3; zero network calls in validator; reuses existing assertion idiom; future releases are guarded
- Cons: Adds obligation to tag before running npm test on release bump commits; must handle no-.git / offline skip correctly
- Risk: Medium-low
- Complexity: Small (one helper + one check + byte-identical mirror edit)

### Option C: Revert Metadata (ELIMINATED)
- Summary: Revert package.json and CHANGELOG to pre-3.15.0 state
- Eliminated: package.json is 3.16.0, CHANGELOG has dated release sections — reverting contradicts AC1 and reality

## Advisor Findings

The advisor approved Approach B with two important adjustments:

**Adjustment 1 (Scope validator to rootVersion only):** Do NOT enumerate all `## [X.Y.Z]` headings in CHANGELOG — key only on `rootVersion`. Historical headings would produce false failures (tags exist only for 3.4.0, 3.8.0, 3.8.1, 3.12.0–3.14.0). Mirror the existing CHANGELOG-heading check at lines 320–323 which already keys on rootVersion.

**Adjustment 2 (Verify SHA before tagging):** Before `git tag`, verify:
- `git log --format='%H %s' -1 1313aaf` — subject must include "chore(release): 3.15.0"
- `git log --format='%H %s' -1 5e8084b` — subject must include "chore(release): 3.16.0"
- Both SHAs must be ancestors of HEAD via `git merge-base --is-ancestor`

**Autonomous push decision:** The advisor recommended pushing tags autonomously. CHANGELOG already dates these as released (2026-05-25, 2026-05-26); tags catch up to documented reality. Agent has push rights (used for PRs #179/180/181).

**Ordering:** Create local tags → implement validator → npm test (local tags make it pass) → push tags → PR

## Selected Approach
Approach B (tags + rootVersion-scoped validator), with advisor's two adjustments applied exactly as specified.

## Out of Scope (explicit)
- No auto-push from validator
- No git fetch --tags from validator
- No GitLab/Gitea tags (optional/none by design)
- No revert of 3.15.0/3.16.0 metadata
- No enumeration of all CHANGELOG headings (rootVersion only)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
