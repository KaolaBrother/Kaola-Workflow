# Phase 2 - Ideation: issue-108

## Approaches Evaluated

### Option A: Archive-Aware Receipt
- Summary: In `postMergeCleanup()`, check if project is archived; if so, write receipt into `kaola-workflow/archive/{project}/.cache/sink-fallback.json` instead of live path. Add archive check in `cmdSinkFallback`.
- Pros: Preserves audit trail; mirrors `resolveProjectFile` live-first/archive-fallback pattern
- Cons: Relaxes `testFallbackGuardsAfterArchive` byte-equality invariant from issue #83; mutates a contracted-terminal directory; no current consumer of receipt contents makes audit trail theoretical
- Risk: Medium
- Complexity: Small

### Option B: Skip Receipt When Archived (Selected)
- Summary: In `postMergeCleanup()`, check if project archived; if so, skip receipt write and log to stderr. Add archive check in `cmdSinkFallback`. Tests assert no receipt anywhere.
- Pros: Satisfies AC explicitly (AC second branch: "Phase 6 consumes it without recreating the live folder"); preserves byte-equality invariant; simpler; no current consumer of receipt means no audit trail loss in practice
- Cons: Receipt not written for post-archive exit-3 case (no current consumer, so negligible)
- Risk: Low
- Complexity: Small

### Option C: Top-Level Quarantine Receipt
- Summary: Redirect receipt to `kaola-workflow/.cache/sink-fallback-{project}-{timestamp}.json` when archived.
- Pros: Decouples from archive layout
- Cons: New undocumented state-contract convention; no existing reader; larger scope than a bug fix
- Risk: Medium
- Complexity: Medium

## Advisor Findings
Advisor overrode planner's recommendation:
- Audit trail argument for Option A is hollow — `cmdSinkFallback` never reads `sink-fallback.json`; no downstream consumer
- Option A relaxes `testFallbackGuardsAfterArchive` byte-equality contract (issue #83) — this is not a "minor" cost
- AC explicitly allows the skip path ("or Phase 6 consumes it without recreating the live folder")
- `resolveProjectFile` pattern is a read pattern; extending it to writes mutates a contracted-terminal directory
- No missed approaches; Option B's "loses audit trail" con is null in practice

## Selected Approach
**Option B: Skip Receipt When Archived**

- **Part A** (`sink-merge.js postMergeCleanup`, lines 192–201): Before writing receipt, check `!fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir)`. If archived: write one-line stderr notice, return `{exitCode:3}` without writing any file.
- **Part B** (`claim.js cmdSinkFallback`, lines 571–585): Add archive-existence check before existing live-path check, returning same `{updated:false, reason:'project archived'}` shape.
- **Tests**: New `test-gitlab-sinks.js` Block 3+1 — asserts exit 3 + no live dir + no receipt anywhere. Extend `testFallbackGuardsAfterArchive` in `simulate-gitlab-workflow-walkthrough.js` with a sink-merge dispatch step; keep existing byte-equality assertion intact.

## Out of Scope (explicit)
- GitHub `scripts/kaola-workflow-claim.js` `cmdSinkFallback` archive check (GitLab-specific receipt-write bug; no companion script)
- Phase 6 ordering changes
- Archive path convention changes
- Extracting shared `isArchived()` helper (inline check sufficient)
- Refactoring `updateState` empty-content behavior
- Webhook/MR sink path changes
- Any changes to `testFallbackGuardsAfterArchive` byte-equality assertion scope

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
