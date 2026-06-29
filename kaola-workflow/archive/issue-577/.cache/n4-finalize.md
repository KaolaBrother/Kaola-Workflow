evidence-binding: n4-finalize d485308900b8

## Finalize (main-session-direct)

Node write set: `CHANGELOG.md`.

- Added a `## [Unreleased]` section to `CHANGELOG.md` with the `### Fixed` entry for #577
  (opencode hooks plugin tracked canonical source; install + clean-worktree test fix).
- Entry records the opencode-additive scope (D-530-02): no #307 four-chain obligation; gate is
  `node scripts/test-opencode-edition.js` (green: 496 assertions, exit 0, verified by n3 in a clean worktree).

Remaining finalize choreography (barrier gates, doc-docking, finalization-summary, impl commit,
chain receipt, contractor archive, sink) is owned by the finalize procedure and recorded there.
