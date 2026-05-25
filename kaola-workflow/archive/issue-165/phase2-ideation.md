# Phase 2 - Ideation: issue-165

## Approaches Evaluated

### Option A: cmdClosureAudit subcommand inside scripts/kaola-workflow-claim.js
- Summary: Add a `closure-audit` subcommand to the existing claim.js dispatch table.
- Pros: every helper already in-scope; zero new exports; one file.
- Cons: claim.js is already ~1097 lines mixing claim/release/finalize/audit-labels/worktree;
  a cross-source drift aggregator bloats the claim-lifecycle hotspot; the byte-identical
  plugin copy doubles every diff to that critical file.
- Risk: Medium (size creep + domain mixing in a sync-pinned file)
- Complexity: Small

### Option B: dedicated scripts/kaola-workflow-closure-audit.js  [SELECTED]
- Summary: A standalone single-purpose script, invoked directly
  (`node scripts/kaola-workflow-closure-audit.js [--execute]`), mirroring the
  kaola-workflow-sink-merge.js precedent. Byte-copied to the plugin tree and added
  to COMMON_SCRIPTS.
- Pros: matches the repo's established convention of separate single-purpose scripts
  (sink-merge, active-folders, repair-state); separates read-mostly audit from claim
  mutation; keeps claim.js untouched.
- Cons: two new files (root + plugin mirror) + one COMMON_SCRIPTS entry.
- Risk: Low (sink-merge proves the pattern)
- Complexity: Small

## Advisor Findings
Advisor confirmed Option B. Two refinements, both verified against sink-merge.js:
1. Reimplement the closed-issue+label query inline (~6 lines via ghExec); do NOT call
   cmdAuditLabels/cmdRepairLabels (they print their own JSON and exit).
2. Helper-import pattern: sink-merge.js INLINES ghExec/parseArgs/assert/isSafeName/getRoot
   and imports only domain helpers from claim.js. Verified directly (sink-merge.js:6,20,54).
   => closure-audit.js inlines the small utilities and imports domain helpers from the
   active-folders + roadmap modules, requiring **zero changes to claim.js**.

## Selected Approach
**Option B** — dedicated `scripts/kaola-workflow-closure-audit.js`.
Imports: `readActiveFolders, issueIsClosed, field, getRoot, isSafeName` from
`./kaola-workflow-active-folders`; `regenerateRoadmap, readRoadmapIssues, roadmapDir`
from `./kaola-workflow-roadmap`. Inlines `ghExec, parseArgs, output, assert`.
Byte-copy to `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js`; add both
to `COMMON_SCRIPTS` in validate-script-sync.js. Tests in simulate-workflow-walkthrough.js.

Reason: best architectural fit + minimal blast radius (claim.js untouched, no export
surface change, no risk to the most sync-critical file). JSON shape locked in
.cache/scope-decision.md (D2).

## Out of Scope (explicit)
- No subcommand added to claim.js; no new claim.js exports.
- No shared "utils" module extraction; no refactor of cmdAuditLabels.
- No changes to plugins/kaola-workflow-gitlab/ or -gitea/ trees (GitHub canonical only
  this cycle; ports filed as follow-ups to #161 — D1).
- Drift classes & JSON shape not redesigned (locked, D2).
- --execute never deletes active folders/worktrees (D3 safe-repair boundary).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md (model=opus) | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
