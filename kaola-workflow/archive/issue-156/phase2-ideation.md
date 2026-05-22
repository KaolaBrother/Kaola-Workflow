# Phase 2 - Ideation: issue-156

## Approaches Evaluated

### Option A: Publish-branch (recommended)
- Summary: Publish `kaola-workflow--v3.13.0` on the verified release commit (`fc1219b`), fix README tag format, add CHANGELOG drift guard, add a positive test for the guard.
- Pros: Satisfies all three ACs; minimal surface (2 source files + README); extends existing validation patterns; respects offline-CI contract; tag push is reversible.
- Cons: AC1's publish half requires a live git push (agent executes with strict pre-flight per advisor authorization); AC3 coverage is partial (guards CHANGELOG drift, not tag drift — documented explicitly).
- Risk: Low — script-sync miss is the main failure mode, mitigated by running full npm test.
- Complexity: Small

### Option B: Doc-walkback
- Summary: Move [3.13.0] back to [Unreleased], demote versions to pre-release state.
- Pros: Internal metadata consistency without any tag push.
- Cons: Destroys shipped release provenance; README/plugin.json already published as 3.13.0; likely rejected in review.
- Risk: High
- Complexity: Medium

### Option C: Hybrid (Approach A + standalone release-gate script)
- Summary: Approach A plus a `scripts/check-release-tags.js` advisory script invoked from README checklist (not npm test).
- Pros: AC3 gets a live tag-existence check.
- Cons: Over-build; precedent for release-only scripts not established; script can rot since no CI enforces it.
- Risk: Medium
- Complexity: Medium

## Advisor Findings

- HEAD is NOT the 3.13.0 release commit — verified: `fc1219b` is the version bump commit (3.12.0 → 3.13.0); HEAD carries two additional unreleased commits (4ebd1b4 docs, b654850 fix#155 [Unreleased]).
- GitLab edition tags are not published in lockstep (no 3.12.0 GitLab tag exists); document GitLab as optional.
- CHANGELOG guard is a forward regression guard (passes today — state explicitly in PR).
- AC3 partial coverage: guards CHANGELOG/version drift, not tag/version drift.
- Tag push authorized autonomously with strict pre-flight (tag push is reversible).

## Selected Approach

**Approach A — Publish-branch.**

Tasks:
1. Publish `kaola-workflow--v3.13.0` on `fc1219b` with pre-flight verification (agent-executed, authorized by advisor for autonomous execution).
2. Fix README release checklist: single→double dash tag format, edition-tag policy (GitHub required, GitLab optional, Gitea none), commit-selection guidance.
3. Add CHANGELOG drift guard to `scripts/validate-workflow-contracts.js` (after existing version block) + byte-identical mirror to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`.
4. ~~Add positive test to `scripts/simulate-workflow-walkthrough.js`.~~ **Dropped per advisor fallback**: validate-workflow-contracts.js is a monolithic run-in-cwd script; composing a cross-fixture test requires refactoring the script into an importable function, which is out-of-scope. The guard is self-testing via `npm test` on the live repo (passes today, regression guard). The guard-fires-on-missing-heading contract is documented in the PR description (advisor: "PR-description disclosure is acceptable fallback if walkthrough pattern doesn't compose").

## Pre-Flight for Tag Publish (recorded)

Release commit: `fc1219b`  
Verification: `git show fc1219b:package.json` → version 3.13.0 (confirmed)  
Parent: `git show fc1219b^:package.json` → version 3.12.0 (confirmed)  
Tag command: `git tag kaola-workflow--v3.13.0 fc1219b && git push origin kaola-workflow--v3.13.0`

## Out of Scope (explicit)

- No agent-executed `git push --tags` (only push the single new tag)
- No tag-existence check in `npm test` (violates KAOLA_WORKFLOW_OFFLINE=1 contract)
- No `kaola-workflow-gitea--v3.13.0` tag (no historical precedent)
- No `kaola-workflow-gitlab--v3.13.0` requirement (GitLab tag optional per 3.12.0 precedent)
- No CI/CD pipeline
- No standalone release-gate script (Approach C deferred to follow-up)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
