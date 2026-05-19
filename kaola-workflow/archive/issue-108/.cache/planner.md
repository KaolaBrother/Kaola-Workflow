# Planner — Issue #108

## 3 Approaches

### Approach 1 — Archive-Aware Receipt (write into archived `.cache/` when archived)
**Summary.** In `postMergeCleanup()`, before constructing the receipt path, probe `kaola-workflow/archive/{project}/`. If archived, write receipt into archive's `.cache/sink-fallback.json`. Add parallel archive check in `cmdSinkFallback`.
- **Pros:** Preserves audit trail; mirrors `resolveProjectFile` pattern (live-first, archive-fallback); Block 3 unchanged; strong architectural fit
- **Cons:** Minor: mutates a directory the archive contract treats as terminal (narrowly scoped to `.cache/sink-fallback.json`); couples sink-merge to archive layout (already coupled via import)
- **Risk:** Low
- **Complexity:** Small (~15–25 LOC across two files plus two new tests)
- **Architectural fit:** High

### Approach 2 — Skip Receipt When Archived (drop receipt; log to stderr)
**Summary.** In `postMergeCleanup()`, check if archived and if so skip receipt write entirely. Part B guard fix same as Approach 1.
- **Pros:** Simplest fix; no archive mutation; Block 3 unchanged; most conservative
- **Cons:** Loses audit trail for post-archive exit-3; inconsistent with `resolveProjectFile` philosophy
- **Risk:** Low
- **Complexity:** Small (~10–15 LOC)
- **Architectural fit:** Medium

### Approach 3 — Top-Level Quarantine Receipt
**Summary.** Redirect receipt to `kaola-workflow/.cache/sink-fallback-{project}-{timestamp}.json` when archived.
- **Pros:** Decouples from archive layout; provides top-level "post-archive merge failures" surface
- **Cons:** Introduces new state-contract convention not documented anywhere; requires docs updates; no existing reader
- **Risk:** Medium (new contract surface)
- **Complexity:** Medium (~25–40 LOC plus docs)
- **Architectural fit:** Low

## Recommendation: Approach 1 (Archive-Aware Receipt)

**Rationale:**
1. Mirrors `resolveProjectFile` pattern exactly — live first, archive as fallback
2. Preserves audit trail co-located with archive
3. Block 3 unaffected (live-first branch handles no-archive case identically)
4. Smallest blast radius among options that preserve audit trail

**Sub-decisions:**
- Use inline live-first/archive-fallback check (not shared helper) in both files — sufficient for this fix scope
- In claim.js, new archive check precedes existing live-path check, returning same `{updated:false, reason:'project archived'}` shape

## Regression Test Plan
1. **`test-gitlab-sinks.js` after Block 3 (line ~411):** Rename live → archive via `fs.renameSync`, run sink-merge with `FORCE_MERGE_IMPOSSIBLE=branch_protected OFFLINE=1`, assert: exit 3, no live dir, receipt at `kaola-workflow/archive/{project}/.cache/sink-fallback.json`
2. **`simulate-gitlab-workflow-walkthrough.js` extending `testFallbackGuardsAfterArchive`:** Add sink-merge dispatch step, assert live dir not recreated, whitelist `.cache/sink-fallback.json` as allowed new file in archive

## Explicitly Out of Scope
- GitHub `scripts/kaola-workflow-claim.js` `cmdSinkFallback` (GitLab-specific receipt-write bug)
- Phase 6 ordering changes
- Archive path convention changes
- Extracting shared `isArchived()` helper
- Refactoring `updateState` empty-content behavior
- Webhook/MR sink path changes
