# Phase 2 - Ideation: issue-196

## Approaches Evaluated

### Option A: Minimal inline patch (SELECTED)
- Summary: Add `KAOLA_WORKFLOW_OFFLINE: '0'` to each of the 3 `Object.assign` env objects in `testAuditAndRepairLabels` in the GitLab walkthrough.
- Pros: Surgical; matches `test-gitlab-sinks.js:536` GitLab-local precedent exactly; neutralizes both claim-script guard (line 1053) and forge guard (line 20) in one shot; satisfies behavioral alignment AC.
- Cons: Repeats env literal 3 times (mild DRY cost, 3 adjacent call sites).
- Risk: Low
- Complexity: Small

### Option B: Extract `_runClaimOnline` helper (mirrors Gitea)
- Summary: Introduce a helper centralizing the `spawnSync` call with `OFFLINE: '0'` and `KAOLA_GLAB_MOCK_SCRIPT`, then call from the 3 sub-cases.
- Pros: Centralized env, structural symmetry with Gitea.
- Cons: Gitea's helper sets up git-repo + PATH-shim (`_initGitRepo`, `_teaMockEnv`) — not a 1:1 port; GitLab uses env-var injection only. New abstraction not required by AC; violates CLAUDE.md surgical-change mandate.
- Risk: Low-Medium
- Complexity: Medium

### Option C: Documentation-only
- Summary: Update docs to state offline suite is partial for GitLab.
- Pros: No code change.
- Cons: Leaves OFFLINE=1 npm test broken; contradicts what GitHub/Gitea/GitLab-sinks already implement; non-starter.
- Risk: High (degrades documented contract)
- Complexity: Small

## Advisor Findings

Approach A confirmed correct. The advisor mandated:
1. Empirical verification before finalizing scope (run both walkthroughs under OFFLINE=1).
2. All 3 sub-cases (A/B/C) must be patched and verified, not just the one in the stack trace.

**Empirical results:**
- GitLab: FAILS at sub-case A (`stale.length===1`, got 0) — bug reproduced.
- Gitea: PASSES (`testAuditAndRepairLabels: PASSED`) — already compliant; no changes needed.

Scope confirmed: GitLab walkthrough only. The issue reporter likely never reached Gitea since `npm test` aborts at the first failure (GitLab).

## Selected Approach

**Option A — Minimal inline patch.**

Reason: Exactly 3 lines changed, no new abstraction, matches the established `test-gitlab-sinks.js:536` GitLab-local precedent. The behavioral "all editions pass under OFFLINE=1" AC is already satisfied by GitHub and Gitea; this closes only the GitLab gap. Approach B would introduce an abstraction that is not a clean port of Gitea's helper (different env-injection vs PATH-shim mechanism). Approach C leaves the suite broken.

## Out of Scope (explicit)
- No `_runClaimOnline` helper extraction for GitLab
- No changes to `kaola-gitlab-workflow-claim.js` OFFLINE short-circuits (correct production behavior)
- No changes to GitHub or Gitea walkthroughs (already compliant)
- No README/docs changes describing a partial suite
- No changes to `validate-kaola-workflow-gitlab-contracts.js`

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
