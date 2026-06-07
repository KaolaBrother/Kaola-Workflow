# docs node evidence — issue #262

## Files Edited

### docs/workflow-state-contract.md — EDITED

Added one new bullet under `## Generated Mirrors`, immediately after the existing
"Regenerate the mirror after issue state changes..." bullet (between lines 117-118
in the original file).

**Exact text added:**

```
- **Single-owner finalize invariant**: during issue finalize, the per-issue source
  removal (`kaola-workflow/.roadmap/issue-N.md`) and `ROADMAP.md` regeneration are
  performed exactly once by `cmdFinalize` / `archiveProjectDir` (Phase-6 Step 8b).
  The Phase-6 Mechanical-Finalization Step 7 (in `agents/contractor.md`) only stages
  the result with `git add`; it does not re-run the rm or the regenerate.
```

**Code verification before edit:**
- `scripts/kaola-workflow-claim.js` lines 796-806: `archiveProjectDir` performs
  the `.roadmap/issue-N.md` removal and calls `roadmapModule.regenerateRoadmap(root)` —
  confirmed single owner.
- `agents/contractor.md` Step 7 (lines 158-167): explicitly states "Step 7 only stages
  the result of that closure" and instructs only `git add kaola-workflow/.roadmap/issue-N.md
  kaola-workflow/ROADMAP.md` — no rm or regenerate call present.

## Files Skipped

### docs/architecture.md — SKIPPED

Skip reason: The Merge Sink and PR Sink data-flow diagrams (lines 159 and 185)
already depict roadmap closure as a single step ("Clean up .roadmap/issue-N.md
and regenerate ROADMAP.md"). There is no drift to correct. Skipping to minimize
merge-conflict surface with parallel issue #266, which also edits this file.

## Verification Results

- `node scripts/simulate-workflow-walkthrough.js`: exit 0 — "Workflow walkthrough simulation passed"
- `node scripts/validate-workflow-contracts.js`: exit 0 — "Workflow contract validation passed"
- `git status --porcelain`: shows `M docs/workflow-state-contract.md` within the
  declared write set; other modified files (agents/contractor.md, commands/kaola-workflow-phase6.md,
  plugins/) are pre-existing implementation changes from the issue, not introduced by this node.
