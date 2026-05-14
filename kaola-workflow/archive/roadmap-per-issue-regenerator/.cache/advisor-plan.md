# Advisor Plan Gate — roadmap-per-issue-regenerator

## Verdict: 4 gaps found. Route back to architect before writing phase3-plan.md.

## BLOCKER #1 — Phase 1 calling `migrate` won't work for new issues

Task 4 says Phase 1 runs `kaola-workflow-roadmap.js migrate` to create the per-issue file. But `migrate` parses rows from existing ROADMAP.md — a brand-new issue starting Phase 1 isn't in ROADMAP.md yet. Chicken-and-egg.

**Fix**: add a fourth subcommand `init-issue --issue N --title ... --status open --workflow-project ... --next-step ...` that writes one per-issue file directly. Phase 1 calls `init-issue`. `migrate` stays for the one-time bootstrap.

## GAP #2 — Phases 4 and 5 don't update the per-issue file

Phase 1 research says "Phases 1/4/5/6 update only their own .roadmap/issue-{N}.md". Architect modifies only phase1.md and phase6.md. `next_step` freezes at Phase 1 value until Phase 6 deletes the file.

**Options**: (A) Add tasks to modify phase4.md and phase5.md with `set-next-step --issue N --step "..."` subcommand; (B) explicitly record that `next_step` is set once at Phase 1 and document that choice.

## GAP #3 — Initial bootstrap migration is undocumented

Current ROADMAP.md has 7 active rows (#10, #5, #6, #7, #8, #9, #2). After landing, those rows need to exist as `.roadmap/issue-{N}.md` or the first `generate` will wipe them. No explicit "run `migrate` once during implementation, commit per-issue files, then run `generate` and confirm output" step in the build sequence.

**Fix**: add explicit bootstrap step to Phase 4 build sequence.

## GAP #4 — `gh issue list` enrichment silently dropped

Phase 1 research and code-explorer both say regenerator should read `.roadmap/issue-*.md` PLUS `gh issue list` (OFFLINE-aware). Architect's `cmdGenerate` only reads `.roadmap/`. Deviation unexplained.

**Recommendation**: Drop gh enrichment (simpler, deterministic, OFFLINE-trivial, per-issue files as single source of truth). Record the choice explicitly.

## What IS Sound (don't change)

- D1: Not rendering current_phase/claim_holder — cleaner than advisor gotcha #1 suggested. Eliminates stale-risk entirely.
- D4: Phase 6 race accepted, validate detects — sound.
- D6: Byte-diff write — sound.
- Hook exclusion placement and needle escaping in Task 8 — correct.
- Parallelization plan and Epic Case 5 structure — comprehensive.

## Date
2026-05-15T05:30:00Z
