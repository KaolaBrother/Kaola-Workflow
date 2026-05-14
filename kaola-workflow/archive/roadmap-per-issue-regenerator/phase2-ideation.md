# Phase 2 - Ideation: roadmap-per-issue-regenerator

## Approaches Evaluated

### Option A: Gated Regeneration (committed ROADMAP.md)
- Summary: ROADMAP.md stays tracked. Regenerated at exactly two gates: Phase 6 Step 7 and workflow-next Startup Step 2 (validate-only, no commit). Per-issue files at `kaola-workflow/.roadmap/issue-{N}.md` are the source of truth; phases 1-5 write only their per-issue file.
- Pros: zero conflict surface phases 1-5 (disjoint per-issue files); ROADMAP.md remains on GitHub; idempotency check straightforward; smallest deviation from current pattern
- Cons: residual Phase-6 vs Phase-6 race on ROADMAP.md (mitigation: idempotent generator + git rebase retry on generated artifact)
- Risk: Low
- Complexity: Medium (~250 LOC new script + ~6 file edits)

### Option B: Per-phase Regeneration
- Summary: Every phase runs roadmap.js generate after writing per-issue file and commits ROADMAP.md.
- Pros: ROADMAP.md always fresh after each phase commit
- Cons: reintroduces the conflict source this issue exists to eliminate; higher write amplification
- Risk: High
- Complexity: Low (fewer new files, but defeats the purpose)

### Option C: Gitignored Locally, Regenerated On Demand
- Summary: ROADMAP.md added to .gitignore; regenerated locally only, never committed.
- Pros: zero conflict surface
- Cons: ROADMAP.md disappears from GitHub; UX regression; onboarding friction
- Risk: Medium
- Complexity: Low

## Advisor Findings

Advisor confirmed Option A is sound. Key gotchas for Phase 3:

1. **current_phase + claim_holder: derive at generate-time** — regenerator reads workflow-state.md and .locks/{project}.lock; per-issue files store only stable fields (issue, title, status, workflow_project, next_step). Prevents per-issue file going stale vs workflow-state.
2. **workflow-next Startup Step 2 must NOT commit** — router is thin. Replace "regenerate and commit if dirty" with: run `kaola-workflow-roadmap.js validate` → if mismatch, print warning + suggest user runs generate. Commits stay phase-owned.
3. **Rules section preservation** — regenerator must reproduce `## Rules` block verbatim. Store as constant string in script.
4. **workflow-init.md bootstrap** — post-change: `mkdir -p kaola-workflow/.roadmap` + call `kaola-workflow-roadmap.js generate`. Produces valid empty-table file.
5. **migrate idempotency** — current ROADMAP.md has 6 active issues. migrate must skip rows where `.roadmap/issue-{N}.md` already exists. Re-running migrate is a no-op.

## Selected Approach

**Option A — Gated Regeneration**

Rationale: eliminates the ROADMAP.md merge conflict root cause (simultaneous phase commits) without sacrificing GitHub visibility or introducing gitignore complexity. The Phase-6-vs-Phase-6 residual race converges cleanly via the existing sink-merge.js rebase loop. Advisor confirmed no missed approaches and the recommendation is sound.

Key decisions:
- `scripts/kaola-workflow-roadmap.js` with subcommands: `generate`, `migrate`, `validate`
- Per-issue files: `kaola-workflow/.roadmap/issue-{N}.md` (key:value format, 5 stable fields)
- `current_phase` and `claim_holder` derived at generate-time from workflow-state.md + .locks/ (not stored in per-issue files)
- ROADMAP.md keeps existing 5-column schema; `<!-- generated -->` comment prepended
- Phases 1/4/5/6 update only their per-issue file; phases never touch ROADMAP.md directly
- workflow-next: validate-only (no commit); Phase 6 Step 7: generate + commit
- Pre-commit hook: add `grep -v '^kaola-workflow/\.roadmap/'` exclusion (blocking requirement)
- migrate is idempotent: skips existing per-issue files

## Out of Scope (explicit)

- Issue #6 open/closed classifier (Stage 4 feature)
- .locks/.sessions semantics changes
- Closed-issue archival in .roadmap/
- workflow-state.md schema changes
- Renaming ROADMAP.md
- Serializing a lock on ROADMAP.md generation

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
