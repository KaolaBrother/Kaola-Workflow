# Documentation Docking — issue-615

## Changed files reviewed
- scripts/kaola-workflow-adaptive-node.js (+ 3 forge ports, regenerated)
- scripts/test-adaptive-node.js
- CHANGELOG.md, docs/decisions/D-615-01.md, docs/architecture.md (n5-docs plan node)
- docs/api.md (finalize-stage fix, below)

## Documents checked
- CHANGELOG.md — `### Fixed` entry added under `[Unreleased]` by n5-docs, evidence `.cache/n5-docs.md`.
- docs/decisions/D-615-01.md — new ADR created by n5-docs documenting the two-horned deadlock,
  the three candidate directions, the selected direction and rationale, and validation evidence.
- docs/architecture.md — the "Lane-group co-open and group-scoped close barrier" section updated
  by n5-docs with a new paragraph on the parent-cleanliness formation precondition.
- docs/api.md — GAP FOUND during docking: the `speculativeWriteExcluded.reason` enum was
  documented as exactly `'no_leg_capability' | 'overlaps_live_writer'`; the fix adds a third
  value `'parent_dirty'`. Fixed at finalize stage (docs/** is barrier-exempt) — added the third
  value to the existing paragraph, verified against the actual code shape
  (`scripts/kaola-workflow-adaptive-node.js:4271-4284`), matching the paragraph's existing style.
- README.md — no update needed: the running-set scheduler description (line 742) is a high-level
  summary that does not describe formation-precondition-level detail; that level of detail lives
  in docs/architecture.md (updated).
- .env.example — no update needed: no new environment variable was introduced; the fix reuses the
  existing `parallelWritesDefaultOn`/`legCoupled` machinery and the existing `KAOLA_PARALLEL_WRITES`
  toggle, already documented.
- Inline comments — updated as part of the code fix itself (WHY-comments on the new helper and
  both gated call sites).

## Gaps found and fixed
- docs/api.md `speculativeWriteExcluded.reason` enum — fixed (see above).

## Explicit no-impact reasons
- README.md: no public setup/usage change; internal scheduler formation-precondition fix.
- .env.example: no new environment variable.

## Final verdict
DOCKED
