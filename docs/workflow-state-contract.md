# Workflow State Contract

This map is the detailed state inventory for Kaola-Workflow. Keep root memory
files such as `CLAUDE.md` and `AGENTS.md` limited to durable invariants and link
here for the full contract.

## Durable Sources

- GitHub issues are the canonical backlog and closure source when online.
- `kaola-workflow/.roadmap/issue-*.md` files are the durable local source for
  active roadmap rows. Do not purge the directory; closing an issue removes only
  that issue source file before regenerating the mirror.
- `kaola-workflow/{project}/workflow-state.md` is the active resume pointer. It
  records status, phase, step, pending gates, next command or skill, issue
  number, sink mode, branch, and worktree path when known.
- Phase artifacts under `kaola-workflow/{project}/` are durable evidence while
  the project is active: `phase1-research.md`, `phase2-ideation.md`,
  `phase3-plan.md`, `phase4-progress.md`, `phase5-review.md`, and
  `phase6-summary.md`.
- Fast-path projects use `fast-summary.md` instead of the full Phase 1-5 set.
- `.cache/` files under an active project hold supporting evidence referenced by
  phase artifacts or summaries.
- `kaola-workflow/archive/{project}/` keeps completed, abandoned, or stale
  project folders after finalize or discard.

## Generated Mirrors

- `kaola-workflow/ROADMAP.md` is generated from
  `kaola-workflow/.roadmap/issue-*.md`. Treat it as a mirror, not a source.
- Regenerate the mirror after issue state changes, after removing the source file
  for a closed issue, or after creating a new per-issue source file.
- `kaola-workflow-roadmap.js generate` must not replace a generated roadmap that
  still lists active issues with `none` solely because `.roadmap/` is missing.

## Legacy Or Transitional State

- `.locks/`, `.sessions/`, `.tickers/`, heartbeat files, lease blocks,
  startup receipts, and session id environment state are legacy coordination
  mechanisms. They may appear in archived historical artifacts only.
- Do not document legacy coordination folders as permanent contract items in
  generated root memory.
- If legacy state appears in an active folder, repair or migrate it toward the
  active-folder contract rather than preserving it as authoritative state.
