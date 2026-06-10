# docs — doc-updater evidence (issue #358)

Both dictated edits applied verbatim (orchestrator-dictated text; no invented content):
1. docs/conventions.md §"Testing — Cross-Edition Validation (issue #307)": the "Run the four chains sequentially, not in parallel" bullet replaced with the test:parallel (#358) bullet — documents the runner as the recommended way to record the four-chain requirement, the TEST_PARALLEL=1 probe-margin mechanism (probeTimeoutEnv 300ms→2000ms), the ad-hoc-parallel caveat, and npm test as the canonical sequential gate.
2. CHANGELOG.md [Unreleased]/### Added: new #358 bullet inserted after the #328 bullet (which is byte-unchanged).

Verification: git diff --stat → CHANGELOG.md | 1 +, docs/conventions.md | 2 +-, exactly 2 files changed. grep: conventions.md:39 contains "test:parallel" in the #307 section; CHANGELOG.md:8 contains "(#358)".
