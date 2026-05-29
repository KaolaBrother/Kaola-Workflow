# Advisor — Ideation Gate: Issue #196

## Verdict: Approach A confirmed, proceed

Approach A (minimal inline patch) is the right call. The env override is correct: the subprocess
re-evaluates `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` at module load, so
forcing `'0'` in the spawn env neutralizes both the claim-script guard (line 1053) and the forge
guard (line 20) in one shot. Keep `KAOLA_GLAB_MOCK_SCRIPT` alongside it.

## Empirical verification results

Run before finalizing scope per advisor directive:

```
KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
```
→ FAILS at `testAuditAndRepairLabels` sub-case A: `stale.length===1`, got 0. Bug reproduced.

```
KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js
```
→ PASSES. `testAuditAndRepairLabels: PASSED`. Gitea already compliant.

## Scope confirmed

Fix scope: **GitLab walkthrough only** — 3 env objects in `testAuditAndRepairLabels`.
No Gitea changes needed. The issue reporter likely never reached Gitea (npm test aborts at GitLab).

## Mandate: all 3 sub-cases

Sub-cases A (audit-labels), B (repair-labels dry-run), and C (repair-labels --execute) all fail
under OFFLINE=1 (via claim-script guards at lines 1053 and 1061). Phase 3 write set and Phase 4
verification must assert all three go green after the fix.

## No missed approaches

The analysis is complete. Approaches B (helper refactor) and C (docs-only) are correctly rejected.
