# Advisor Gate: parallel-classifier Phase 3

## Ruling

Approach A is the right choice; build sequence and parallelization plan are sound.

## Blockers (both fixed in architect-revision-1.md)

**Bug 1 — OFFLINE classify() can't satisfy Epic Cases 6B/6C.**
`cmdClassify` OFFLINE branch passed `body: ''` to `classify()`. 6B/6C are body-driven: they write `body:` to roadmap files and rely on `extractCoarseAreas()`. With empty body, both fall through to `green`.
Fix: In OFFLINE mode, read the `body:` field from the roadmap file using `field(content, 'body')`, then pass it into `classify()`.

**Bug 2 — Tests 6D and 6E were the same code path.**
Both wrote `next_step: blocked by #N` under OFFLINE=1. No actual test exercised the online depends-on path.
Fix: Redesign as three tests:
- 6D = OFFLINE + depends-on label → blocked (conservative); assert reasoning.includes('OFFLINE')
- 6E = online + gh shim returns dep OPEN → blocked
- 6E' = online + gh shim returns dep CLOSED → not blocked

## Verifications Passed

**Check 3**: "Startup Step 0 - Sweep And Claim" exists at line 45 of `workflow-next.md` (211 lines). Task 2 heading rename is correct, not creation.

**Check 4 — N+1 explicit**: Router calls classifier.js once per candidate; each online call does one `gh issue view N`. For ≤50 open issues, acceptable. Batching is future optimization. Added to Out-of-Scope as item 9.

## Non-Blockers

- Exit code 2 for already-claimed is fine; bash router falls through correctly via empty `$VERDICT`.
- `node -e "...JSON.parse..."` jq-avoidance is correct.
- Yellow-warning via `.cache/parallel-classifier.md` is cleaner than mutating `phase1-research.md`.

## Date

2026-05-15T08:45:00Z
