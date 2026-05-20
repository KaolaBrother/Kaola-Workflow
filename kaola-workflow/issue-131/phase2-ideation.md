# Phase 2 - Ideation: issue-131

## Approaches Evaluated

### Option A: Fix usage string + add validator assertion
- Summary: Add `|watch-mr` to the GitLab claim usage string; add `assertIncludes(claimScript, 'watch-mr')` to the validator.
- Pros: Minimal surgical fix; validator prevents future drift.
- Cons: None.
- Risk: Low
- Complexity: Small

### Option B: Fix usage string only (no validator)
- Summary: Just add `|watch-mr` to the usage string.
- Pros: Even simpler.
- Cons: Drift can happen again silently. Issue specifically requests a validator guard.
- Risk: Medium (incomplete)
- Complexity: Small

## Selected Approach
**Option A** — fix usage string AND add validator assertion. Issue explicitly requests both.

## Out of Scope (explicit)
- No changes to GitLab test-gitlab-sinks.js (usage string isn't tested there)
- No changes to Gitea (already correct)
- No changes to GitHub claim script

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | N/A | | single obvious option; no architectural decision needed |
| advisor ideation gate | N/A | | trivial fix; no missed approaches or risks |
