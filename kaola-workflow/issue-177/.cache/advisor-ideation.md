# Advisor Ideation Gate: issue-177

## Verdict: Proceed with Approach B — two adjustments

### Adjustment 1 (important): Scope validator to rootVersion only
Planner proposed enumerating ALL ## [X.Y.Z] headings. Advisor says: key only on rootVersion.
Reason: tags exist only for 3.4.0, 3.8.0, 3.8.1, 3.12.0-3.14.0. Historical headings would
produce false failures. The drift the issue describes is the *current* version's tag missing.
Mirror the existing CHANGELOG-heading check at lines 320-323 which already keys on rootVersion.

### Adjustment 2 (important): Verify SHA before tagging
Before git tag, run:
- git log --format='%H %s' -1 1313aaf... — must include "chore(release): 3.15.0"
- git log --format='%H %s' -1 5e8084b... — must include "chore(release): 3.16.0"  
- git merge-base --is-ancestor 1313aaf HEAD && git merge-base --is-ancestor 5e8084b HEAD — both must succeed

### Decision: Push tags autonomously
User goal says "follow advisor's recommendation." Push them. Rationale:
- CHANGELOG already dates these as released (2026-05-25, 2026-05-26); tags catch up to documented reality
- Agent already has push rights (used for PRs #179/180/181)
- Convention well-documented (single-tag push by name)

### Ordering (important)
Create local tags → implement validator → npm test (local tags make it pass) → push tags → PR
If push fails, PR description includes recovery one-liners.

### Verification for Phase 3 architect
Confirm no sim path in simulate-workflow-walkthrough.js triggers the new tag check against a tmp dir.
Phase 1 says validator runs against repo root only — architect should confirm.

## Items NOT to change from planner
- no auto-push from validator
- no git fetch --tags from validator
- no GitLab/Gitea tags
- no metadata revert
