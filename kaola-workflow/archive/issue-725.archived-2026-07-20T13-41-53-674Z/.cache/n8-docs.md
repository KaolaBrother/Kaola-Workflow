evidence-binding: n8-docs 475e1d2880ad
<!-- docs_updated: paste docs_updated here -->
docs_updated: CHANGELOG.md [Unreleased] gains 2 new bullets (### Added: mutation spot-check gate; ### Removed: overlap prune + bundle-claim consolidation) recording Phase E; docs/conventions.md § Testing — Cross-Edition Validation gains 1 new additive bullet on the two-altitude test division of labor.
upstream_read: n1-dedup-map b15c42d5d73d
upstream_read: n2-overlap-prune c5205c75b0d9
upstream_read: n4-bundle-claim-consolidate 6859243b6b47
upstream_read: n6-mutation-spotcheck 285f0b82afae
upstream_read: n7-falsify-mutation 056912cb74d4

## CHANGELOG.md — two new bullets under the existing `## [Unreleased]` header (no new version header added)

### Added (inserted as the new first bullet, before the existing `run-chains.js` bullet)

"New persistent mutation spot-check gate proves the Phase E mega-test prune lost no real
coverage — final phase of the adaptive-only consolidation, closing #725." Records: the 5
reintroduced historical bug shapes (#611 delegation-outcome vocabulary bypass; inverted
`deriveGateMode`; inverted `deriveGateEffect`; `reduceReviewReceipts` partitioned-refuted-swallowed,
all three schema-2 review-engine per #693/#696/#697/#698; and #328's bundle `issue_numbers` order
corruption); the isolated `fs.mkdtempSync`-copy mechanism (never the working tree, no network
calls); the baseline-GREEN-before-mutation + demonstrated-ESCAPED-on-no-op non-vacuity proof; the
run command `node scripts/test-mega-mutation-spotcheck.js` (~20s, exit 0 = 5/5 caught); and that it
is a persistent on-demand gate artifact, NOT wired into `npm test` or any `test:kaola-workflow:*`
chain.

### Removed (inserted as the new first bullet, before the existing "Prompt diet + validator
narrowing..." Phase D bullet)

"Overlap-band test prune removes 13 duplicate asserts from the mega-test files, and the
bundle-claim entrypoint consolidates to a single keeper — Phase E (mega-test prune) of the
adaptive-only consolidation (#725)." Records: the measured overlap band (before=32 asserts across
3 clusters, prunable=13, ~40% reduction, exceeding the >=25% target); the exact prune split (8 from
`simulate-workflow-walkthrough.js` — the #611 AC5 `checkEvidenceShape` block + the review-v2 R6
corpus-conformance header, 0 from `test-adaptive-node.js`; 5 VALUE re-asserts from
`test-bundle-state.js`'s `testBundleStateParsing()`, 0 from `test-claim-hardening.js`); the
post-prune band (32->19, ~40% reduction); the content-match-before-deletion discipline; the
untouched-as-distinct-subjects list (active-folders reader-shape asserts, review-v2 R5 cross-edition
block, classifier/orient `bundle_state_incoherent` blocks); and the closing statement that Phase E
completes the adaptive-only consolidation epic (#725) alongside Phases A-D.

## docs/conventions.md — 1 new additive bullet in § Testing — Cross-Edition Validation (issue #307)

Inserted as a new bullet immediately before the existing "Lifecycle and boundary coverage for
frozen dispatch fields." bullet (no existing bullet text touched, no heading added/removed,
section heading and issue #307 provenance in the existing heading left exactly as-is). New bullet
lead: "Two-altitude division of labor between the mega-test files." Records: `test-adaptive-node.js`
owns refusal seams / envelope shapes / fault injection (deep single-module altitude);
`simulate-workflow-walkthrough.js` owns end-to-end journeys (claim -> freeze -> nodes -> barrier ->
sink) and cross-process/cross-edition behavior (shallow integration altitude); the
don't-duplicate-an-invariant-at-both-altitudes rule; the bundle-claim entrypoint's single keeper
(`test-bundle-claim.js` + the walkthrough's own bundle-lane E2E journey); and
`scripts/test-mega-mutation-spotcheck.js` as the standing regression floor (isolated `$TMPDIR`
copies, must stay red on each reintroduced bug shape, run command + exit-0 meaning, not wired into
`npm test` or any `test:kaola-workflow:*` chain). Per the dispatch card's provenance rule, this note
carries NO issue/ADR references (unlike most of the file's other bullets) — provenance for this
change lives in CHANGELOG.md only.

## Pinned-phrase check

`git diff docs/conventions.md` shows exactly one contiguous insertion (14 new lines) between the
"Edition behavioral coverage (issue #342)." bullet's paragraph and the "Lifecycle and boundary
coverage for frozen dispatch fields." bullet; every pre-existing line in the file, including the
section heading, all prior bullet text, and the `### Hermetic unit-chain fixtures` subsection
below, is byte-unchanged (verified by reading the full pre/post diff — no existing line is
modified or removed, only new lines added). No validator (`validate-workflow-contracts.js`,
`test-opencode-edition.js`, `validate-kaola-workflow-contracts.js`, and the gitlab/gitea contract
validators) parses `docs/conventions.md` content for pinned phrases — each only emits the literal
string `docs/conventions.md` as a pointer inside its own refusal message — so there is no
machine-enforced pin surface in this file to violate; the check above is nonetheless a byte-level
confirmation, not a reliance on that absence.

## Write-set discipline

`git status --porcelain` shows exactly two modified tracked files: `CHANGELOG.md` and
`docs/conventions.md`. No other tracked file was touched. (Untracked `.cache/*`,
`workflow-plan.md`, `workflow-state.md`, `workflow-tasks.json`, and `scripts/test-mega-mutation-spotcheck.js`
present in `git status` belong to other nodes' write sets / the scheduler and were not created or
modified by this node.)
