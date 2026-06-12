evidence-binding: n12-docs 9fe1159b9e64
non_tdd_reason: documentation authoring — decision records and API docs; no behavioral logic
regression-green

## Summary

### docs/decisions/D-426-01.md (new)
Decision record for #426: copy-then-verify-then-delete is safer than rename for cross-filesystem
archive moves. Covers the problem (EXDEV cross-filesystem rename, no completion verify, worktree
live copy not deleted), the decision (unconditional copyDir → verifyArchiveComplete → deleteDir
for both roots), why rename-with-fallback was rejected, and consequences including the new
`anchored_root` receipt field.

### docs/decisions/D-427-01.md (new)
Decision record for #427: probe-before-close makes cmdFinalize and sink-merge independently
idempotent. Covers the problem (cmdFinalize never closed issues, no coordination with sink-merge
on already-closed), the decision (closeIssueIdempotent with probe-before-close in both callers),
why exclusive ownership was rejected, and consequences including the new `closure` receipt object.

### docs/decisions/D-428-01.md (new)
Decision record for #428: both roots must be cleaned to prevent stale roadmap source files.
Covers the problem (reconcileRoadmapForClosure only cleaned the main root, leaving a stale copy
in the worktree checkout), the decision (dual-root iteration in reconcileRoadmapForClosure),
why guard-at-sink-merge was rejected, and consequences including the new `roadmap_removed_by_root`,
`roadmap_residue` receipt fields and the `roadmap-residue-clean` closure invariant.

### docs/decisions/D-430-01.md (new)
Decision record for #430: defense in depth — check bundle coherence at claim, handoff, and orient
time. Covers the problem (bundle_id/issue_numbers inconsistency not caught after initial claim),
the decision (three independent guards: target_set_mismatch at cmdStartup, bundle_state_incoherent
at runHandoff, bundle_state_incoherent at orient), why a single gate was rejected, and consequences
including the two new refusal codes.

### docs/api.md (updated)
- Bundle claim refusal codes table: added `target_set_mismatch` and `bundle_state_incoherent`.
- Closure receipt schema: added `anchored_root` (string), `roadmap_removed` (per-root object),
  `roadmap_residue` (array), and `closure` (object with attempted/closed/failed/skipped_offline/kept_open).
  Added prose block documenting each new field with issue references and decision record links.
- Closure invariants list: added `roadmap-residue-clean` invariant (issue #428).

### docs/workflow-state-contract.md (updated)
- Bundle Project State Fields section: added "Bundle coherence invariant (issue #430)" subsection
  documenting the bundle_id == "bundle-" + sorted(issue_numbers).join("-") invariant, the three
  enforcement points (claim/handoff/orient), and the warning against hand-editing only one field.
