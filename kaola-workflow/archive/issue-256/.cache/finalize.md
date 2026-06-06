# finalize (sink) — issue-256

The finalize sink appended the #256 entry to `CHANGELOG.md` under the `## [Unreleased]`
heading (inserted immediately after `## [Unreleased]`, before the `### Honest opt-in …
(issue #246)` block). This is a docs/state-only change: the entry records the
deferred-from-#246 regression test (`testWorktreeNativeSurfacesProvisionFailure()` plus the
two `worktree_error === undefined` regression asserts) added to
`scripts/simulate-workflow-walkthrough.js` by the `impl` node.

Declared write set for this node is exactly `CHANGELOG.md`. No source or code file was
touched by the finalize node.

## Evidence
- CHANGELOG.md: one new `### Commit the deferred worktree_error provision-failure regression test (issue #256)` section under `## [Unreleased]`.
- Upstream node evidence: `.cache/impl.md` (RED exit 1 → GREEN exit 0), `.cache/review.md` (G1 gate verdict APPROVE, no blocking findings).
- Suite: `node scripts/simulate-workflow-walkthrough.js` exits 0 ("Workflow walkthrough simulation passed") with the new test registered.
