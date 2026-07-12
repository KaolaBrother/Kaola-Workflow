evidence-binding: n2-release-docs b0c7df3e5d4b
<!-- docs_updated: paste docs_updated here -->
docs_updated: docs/conventions.md, docs/api.md, CHANGELOG.md

## Fact confirmed against real code before writing

- `scripts/kaola-workflow-release.js:178`:
  `if (latestRowsForOtherVersion(rows || [], o.version) || (rows || []).some(r => r.step === 'prepare_binding' && r.version !== o.version)) return refuse(o.jsonMode, 'stale_release_receipt');`
  where `latestRowsForOtherVersion` (line 60) is
  `rows && rows.some(r => r.step === 'prepared' && r.status === 'done' && r.version !== version)`.
  So `--prepare` for a new version typed-refuses `stale_release_receipt` when
  `.cache/release-receipt.jsonl` still holds a completed `prepared` row (or a
  `prepare_binding` row) for a different version.
- `scripts/test-release.js:57` proves it directly:
  `reason(d, ['--prepare', '--version', '5.2.0'], 'stale_release_receipt');` — run
  immediately after a completed `--prepare --version 5.1.0` transaction, with no
  receipt cleanup in between.
- `.cache/release-receipt.jsonl` path is `receiptPath()` at line 53
  (`path.join(root, '.cache', 'release-receipt.jsonl')`). No flag or automated
  disposal step exists in the script for this file — the only remedy is deleting
  it (plus the unrelated-but-stale `.cache/chain-receipt.json`, which pins a
  prior candidate's `headSha` and would otherwise gate `--release-check`/
  `--finalize-check` on stale evidence once a new release cycle starts).
- Confirmed `#434-b` RED-control assertions exist at `scripts/test-adaptive-node.js:8359-8379`
  (`runRepairNode` output assertions) before writing the CHANGELOG summary line
  referencing them.
- Neither `docs/api.md` nor `docs/conventions.md` mentioned `stale_release_receipt`
  by name before this edit (`grep -n "stale_release_receipt" docs/api.md
  docs/conventions.md` returned nothing pre-edit).

## Edits made (docs-only, leg-scoped)

1. `docs/conventions.md` — appended one sentence to the existing "Prepare receipt
   and resume boundary" bullet (§ Release), after "...fail closed before
   preparation mutation.":
   > Starting the next release's `--prepare` requires first deleting
   > `.cache/release-receipt.jsonl` (and the stale `.cache/chain-receipt.json`),
   > because a completed `prepared` row for a prior version makes the next
   > `--prepare` refuse `stale_release_receipt`.

2. `docs/api.md` — appended one sentence to the "Release transaction CLI"
   paragraph (end of the refusal-reason-families paragraph, before the
   `--release-check` cross-reference paragraph):
   > A completed `prepared` row for a prior version in
   > `.cache/release-receipt.jsonl` makes `--prepare` for the next version
   > refuse `reason:"stale_release_receipt"`; delete
   > `.cache/release-receipt.jsonl` (and the stale `.cache/chain-receipt.json`)
   > before starting the next release's `--prepare`.

3. `CHANGELOG.md` — inserted one new `[Unreleased]` bullet as the first entry
   under the existing `### Fixed` heading (all pre-existing `### Fixed`/
   `### Added` bullets and every `## [<version>]` heading left untouched),
   summarizing the #668 hygiene batch: the `#434-b` repair-harness assertion
   now observes real output, the release-receipt disposal step is documented,
   and the GitLab clean-nonzero stderr-leak case has a wired output assertion.
   Provenance (`#668`) lives only in this CHANGELOG bullet, not in any
   agent-facing prompt surface.

## Verification

- `node scripts/simulate-workflow-walkthrough.js` run from the leg root: exit 0,
  final line `Workflow walkthrough simulation passed` (all listed cases,
  including `testHarnessSelfCheck` and `testGateEvidenceNonceRotation654`,
  reported PASSED).
- Post-edit spot check: `CHANGELOG.md` still opens with `# Changelog` /
  `## [Unreleased]` / `### Fixed` and the pre-existing `#666` bullet
  immediately follows the new bullet, unmodified; `docs/conventions.md` and
  `docs/api.md` each show exactly one occurrence of `stale_release_receipt`
  (the newly added sentence) with no other structural change.
- No files outside `docs/conventions.md`, `docs/api.md`, `CHANGELOG.md`, and
  this evidence file were touched; no `git add`/`git commit` performed.
