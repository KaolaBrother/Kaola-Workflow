# Documentation Docking — issue-599

## Changed files reviewed (commits 67464e62 + 23d4df98 merge + 0152abb2)
- Code: adaptive-node.js ×4 (selectSpeculativeWriteGroup fail-closed branch)
- Tests: test-adaptive-node.js (1310→1314; T599-1a/1b/1c)
- Prose: docs/decisions/D-599-01.md (new), docs/api.md (one-line fail-closed posture note in the speculative-open kernel section), CHANGELOG.md (### Fixed entry, written by n4-finalize)

## Documents checked
- CHANGELOG.md — #599 entry accurate (fail-open→fail-closed, RED tests, the live #596 exercise note, D-599-01 ref).
- docs/api.md — posture note transcribed from code by n3 (verified against writeOverlapRelaxable/--parallel-safe emission by the n2 gate's shape enumeration).
- docs/architecture.md — deliberately untouched (declared-but-unwritten): its speculative-write paragraph documents static eligibility/discard mechanics, not the runtime open-time re-verification; no natural anchor (grep-verified by n3).
- docs/decisions/D-599-01.md — follows D-595/D-596 structure.
- README / .env.example — no impact (internal scheduler error-posture change).
- kaola-workflow/ROADMAP.md — regenerated at closure by cmdFinalize.

## Gaps found
None. n2-review (opus) enumerated every --parallel-safe output shape against the new branch and confirmed the docs match shipped behavior.

final verdict: DOCKED
