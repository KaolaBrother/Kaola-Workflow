# Planner output — closure-audit placement (model=opus)

Question posed: WHERE should closure-audit live? Option A (subcommand in claim.js)
vs Option B (dedicated scripts/kaola-workflow-closure-audit.js). Drift classes &
JSON shape were locked and explicitly out of scope for the planner.

## Option A — cmdClosureAudit subcommand inside claim.js
- Pros: every helper already in-scope; zero new exports; one file/dispatch table.
- Cons: claim.js already ~1097 lines mixing claim/release/finalize/audit-labels/worktree;
  a cross-source drift aggregator bloats it; byte-identical plugin copy doubles every diff.
- Risk: Medium (size creep, domain mixing). Complexity: Low.

## Option B — dedicated scripts/kaola-workflow-closure-audit.js  [RECOMMENDED]
- Pros: exact precedent = kaola-workflow-sink-merge.js (requires helpers from claim.js,
  listed in COMMON_SCRIPTS at validate-script-sync.js:46). Single-purpose module separates
  read-mostly audit from claim mutation; claim.js stays leaner.
- Cons: two new files (root + plugin mirror), one COMMON_SCRIPTS entry; planner assumed
  3 additive exports (ghExec/output/parseArgs) from claim.js.
- Risk: Low (pattern proven, exports additive). Complexity: Low.

## Architectural fit
Repo segregates audit/migration tooling from claim.js (sink-merge, active-folders,
repair-state, validate-workflow-contracts). A multi-source drift aggregator belongs in
that family, not in the claim-lifecycle hotspot.

## Recommendation: Option B — mirror sink-merge.

## Do not build
- No shared "utils" module extraction (scope creep).
- Do not redesign drift classes / JSON shape (locked).
- Do not touch plugins/kaola-workflow-gitlab/ or -gitea/ (COMMON_SCRIPTS only syncs
  scripts/ ↔ plugins/kaola-workflow/scripts/).
- Do not split claim.js.

## Verify before wiring (planner)
Confirm sink-merge's invocation + helper-import convention and match it.
