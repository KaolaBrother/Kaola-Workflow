# Planner Output: issue-177

## Recommendation: Approach B
Create missing tags + add CHANGELOG↔tag check to validate-workflow-contracts.js

## Approaches

### Option A — Create tags only (no code change)
- Pros: smallest diff, AC1+AC3 satisfied in minutes
- Cons: AC2 not satisfied (validation gap remains)
- Risk: Low for change; high that root-cause gap persists
- Complexity: Trivial

### Option B — Create tags + add validation (RECOMMENDED)
- Pros: satisfies AC1, AC2, AC3; headings-driven sweep catches historical drift; zero network calls; reuses existing assertion idiom
- Cons: adds obligation to tag before running npm test on release bump commits
- Risk: Medium-low — must handle no-.git / offline skip correctly
- Complexity: Small (one helper + one loop + byte-identical mirror edit)

### Option C — Skip tags, revert metadata (ELIMINATED)
- package.json is 3.16.0, CHANGELOG has dated release sections — reverting contradicts AC1

## Implementation Steps
1. Verify SHAs are on main ancestry
2. git tag kaola-workflow--v3.15.0 1313aaf837e67d6a1bc1a0ea65eb5d504cd7a6b0
3. git tag kaola-workflow--v3.16.0 5e8084b438bf084f7efc5ad59412821c8c69204b
4. git push origin kaola-workflow--v3.15.0 && git push origin kaola-workflow--v3.16.0
5. Verify with git ls-remote
6. Extend validate-workflow-contracts.js: enumerate ## [X.Y.Z] headings in CHANGELOG, assert git tag -l returns match; skip if KAOLA_WORKFLOW_OFFLINE=1 or .git absent
7. Mirror to Codex plugin copy (byte-identical)
8. npm test
9. CHANGELOG entry + docs/conventions.md release-ordering note

## NOT to build
- No auto-create/push tags from validator
- No git fetch --tags from validator
- No new standalone script
- No GitLab/Gitea tags (optional/none by design)
- No revert of 3.15.0/3.16.0 metadata

## Missing facts
- Push permission: if executing agent lacks write access, Phase 1 reduces to one-liners for maintainer
- npm registry state: whether 3.15.0/3.16.0 were ever npm published (informational only)
- Release docs home: verify docs/conventions.md vs skills during execution
