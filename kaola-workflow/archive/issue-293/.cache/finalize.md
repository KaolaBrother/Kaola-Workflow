# Node `finalize` (sink) — issue #293

Docs/state bookkeeping deliverable: authored the `[Unreleased]` CHANGELOG.md entry for #293 inline
(Trivial Inline Edit Exception / finalize-node deliverable, per the #291 precedent).

## CHANGELOG.md
Added a `### Fixed` bullet under `[Unreleased]` describing:
- The `crossCheckStatus` ↔ `runOrient` AC#5 alignment on single-`in_progress` + non-matching-manifest
  (closes the #291 F1 divergence); one-predicate `ip.length <= 1` hoist; `runOrient` production
  unmodified; multi-`in_progress` orphan path preserved.
- The shared anti-drift fixture `fixtures-orphan-legality.js` imported by both test files.
- Cross-edition parity (all four editions); G1 verdict pass / findings_blocking 0; npm test green.
- The non-blocking R1 follow-up (orient test shares only the manifest axis; the in_progress axis is
  unshareable by construction).

Write set: CHANGELOG.md only (docs/state). No production/source write at this node.
