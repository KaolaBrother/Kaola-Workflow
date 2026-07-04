evidence-binding: n5-docs 3b4b9b138f79

## Summary

Read `CHANGELOG.md`'s existing `[Unreleased]` conventions (Added/Changed/Fixed sections, one
bolded-title bullet per item with an inline `— #NNN` issue ref and a "Cross-edition (#307): ..."
closer where applicable) and two recent ADRs (`D-611-01.md`, `D-608-01.md`) for structure before
writing.

**CHANGELOG.md** — added a new `### Fixed` section under `## [Unreleased]` (after the existing
`### Changed` section, matching the Added→Changed→Fixed ordering used by prior releases, e.g.
6.20.0). The entry describes the fix in user-facing terms: the plan-run scheduler's lane-group
co-open no longer deadlocks when the parent worktree carries uncommitted production dirt from
already-closed serial siblings; it now degrades to a single serial open (normal co-open path) or
excludes the write candidate from the speculative open (speculative-write path) instead. Names the
new `parentCarriesProductionDirt` precondition, the two-horned deadlock it prevents
(`parent_dirty` vs `write_set_overflow`), points at `docs/decisions/D-615-01.md`, and closes with
the standard cross-edition (#307) receipt line for `kaola-workflow-adaptive-node.js`.

**docs/decisions/D-615-01.md** — confirmed no existing `D-615-*` file (`ls docs/decisions/` —
highest prior numbers were `D-611-01.md`; nothing for #612–#614 either) before creating it. Wrote
a new ADR matching the established structure (Title / Date / Status / Issue / Related / Context /
Decision / Consequences / Non-goals / Alternatives considered), citing `D-419-01`/`D-542-01` (the
lane-group co-open machinery whose last-member close hits the deadlock) and `D-596-01` (the
speculative-write co-open path, the second formation site) in `Related`. Context section records
the two-horned deadlock (Horn A: parent-clean fence refuses `parent_dirty` on the uncommitted
serial file; Horn B: committing it to clear the fence lands it in the merge commit, outside the
group's declared union, tripping `write_set_overflow`). Decision section records the selected
direction (new `parentCarriesProductionDirt` helper reusing the identical `--parent-clean-check`
fence the last-member close already runs, fail-closed on any non-`pass` result, gating both the
normal co-open site and the speculative-write site — the latter noted as caught in a subsequent
code-review pass after being initially missed) and why it was chosen per the project's
accuracy-first / contract-preserving / cheapest-sufficient precedence. Consequences section
records both formation sites gated, no change to either fence or to the serial
finalize-owned-commit contract, and the validation evidence (hermetic RED→GREEN tests in
`scripts/test-adaptive-node.js`, edition-sync byte-consistency, all four cross-edition chains +
walkthrough + test-adaptive-node green, adversarial-verifier NOT-REFUTED). Alternatives considered
records the two rejected directions (attributed-allowband classification of complete nodes'
write sets; re-anchoring the group barrier baseline at parent HEAD) with their rejection rationale.
No inline issue-number noise beyond the ADR's own `Issue:`/`Related:` metadata fields and the
Context section's natural scene-setting — the Decision/Consequences/Non-goals/Alternatives prose
itself carries no scattered `#615` references.

**docs/architecture.md** — read the "Lane-group co-open and group-scoped close barrier" section
(the D-419 Part 2 / #437 implementation description, default-on since D-542-01) plus the adjoining
"Cross-lane runtime protection" and "Serial opt-out invariant" paragraphs (lines ~277–356). This
section documents lane-group formation preconditions at function/line-number granularity
(`tryFormLaneGroup`, `runOpenReady`, the disjointness check, the close-side group barrier), so it
would now be incomplete without the new parent-cleanliness precondition — an update was warranted,
not skipped. Inserted one new paragraph, "Parent-cleanliness precondition on formation
(D-615-01)," between the existing "Cross-lane runtime protection" and "Serial opt-out invariant"
paragraphs, grounded directly against the shipped code (`parentCarriesProductionDirt` in
`adaptive-node.js`, the exact `--parent-clean-check` reuse, the fail-closed non-`pass` handling,
and the two gated call sites — the normal `liveNodes.length === 0 && writeNodes.length > 0`
co-open branch degrading to serial, and the `openingSpeculative` branch excluding write candidates
via `speculativeWriteExcluded: { reason: 'parent_dirty' }`) — verified by reading the actual
`scripts/kaola-workflow-adaptive-node.js` source (lines ~3694–3715 for the helper, ~4261–4335 for
the two call sites) rather than inferring from the task brief alone.

Write set respected: only `CHANGELOG.md`, `docs/decisions/D-615-01.md`, and `docs/architecture.md`
were touched (`git status --porcelain` confirmed no other file in this worktree was modified by
this node).
