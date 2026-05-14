# Advisor Ideation Gate — roadmap-per-issue-regenerator

## Verdict: Option A is sound. Proceed.

Planner's analysis is correct. No missed approaches. Option B correctly rejected; Option C correctly downgraded. A hypothetical Option D (symlink to .roadmap/INDEX.md) adds complexity without benefit.

## Risk accuracy

Residual Phase-6-vs-Phase-6 race is real, especially for multi-machine sessions. It falls out clean: Phase 6 regenerates locally → commits → sink-merge.js handles non-fast-forward via rebase loop → rebase reapplies a generated artifact that re-converges on regeneration. Phase 3 must ensure roadmap.js generate runs BEFORE sink-merge's rebase loop.

## Gotchas for Phase 3 architect

1. **current_phase + claim_holder: derive at generate-time (Option a)**
   - Regenerator reads workflow-state.md and .locks/{project}.lock to fill these fields when rendering.
   - Per-issue files store only stable fields (issue, title, status, workflow_project, next_step).
   - Single source of truth; no risk of per-issue file going stale vs workflow-state.

2. **workflow-next Startup Step 2 should NOT commit**
   - Router is explicitly "thin". Replace "regenerate and commit if dirty" with:
   - Run `kaola-workflow-roadmap.js validate` → if mismatch, print warning + suggest user runs generate.
   - Commits stay phase-owned.

3. **Rules section preservation**
   - Regenerator must reproduce ## Rules block verbatim.
   - Store as constant string in script. Architect decides whether to deduplicate vs workflow-init.md template.

4. **workflow-init.md bootstrap**
   - Post-change: `mkdir -p kaola-workflow/.roadmap` + call `kaola-workflow-roadmap.js generate`.
   - Produces valid empty-table file. Add to modify list.

5. **migrate idempotency**
   - Current ROADMAP.md has 6 active issues. migrate must skip rows where .roadmap/issue-{N}.md already exists.
   - Re-running migrate is a no-op.

## Date
2026-05-15T00:30:00Z
