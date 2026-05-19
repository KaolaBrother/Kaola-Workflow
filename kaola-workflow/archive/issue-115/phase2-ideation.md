# Phase 2 - Ideation: issue-115

## Approaches Evaluated

### Option A: Surgical gitea) case in install.sh + manifest version fix
- Summary: Mirror gitlab) branch, swap names, update .claude-plugin version to 3.10.0
- Pros: Minimal change, no regressions, exactly what issue specifies
- Cons: None
- Risk: Low
- Complexity: Small

### Option B: Refactor to data-driven forge dispatch
- Summary: Replace case/esac with a forge-config lookup table
- Pros: DRY
- Cons: Scope creep, not requested, risk of regressions in existing forge paths
- Risk: High
- Complexity: Large

## Advisor Findings
Option A confirmed as correct. No missed approaches. Marketplace entry already present is noted.

## Selected Approach
Option A: surgical gitea) case + manifest version fix.

## Out of Scope (explicit)
- Refactoring install.sh architecture
- Adding env var handling for GITEA_SERVER_URL/GITEA_TOKEN in install.sh
- Updating .codex-plugin version (separate versioning scheme, keep 1.5.0)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
