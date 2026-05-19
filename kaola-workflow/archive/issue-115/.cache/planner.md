# Planner: issue-115

## Approaches Evaluated

### Option A: Add gitea) case to install.sh, update manifests/marketplace
- Mirror the gitlab) branch exactly, substituting gitea names
- Manifests already exist (minor version fix needed)
- Marketplace already has Gitea entry (no-op)
- Risk: Low
- Complexity: Small

### Option B: Refactor to data-driven forge dispatch
- Replace case/esac with a forge-config map
- Risk: High (scope creep, not requested)
- Complexity: Large

## Selected Approach
Option A — surgical gitea) case + manifest version fix.

## Out of Scope
- Refactoring install.sh
- Adding new env var handling in install.sh
- Updating .codex-plugin version (separate versioning scheme)
