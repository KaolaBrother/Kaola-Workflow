# Node finalize (Phase-6 sink evidence) — issue #290

Phase-6 work performed as the finalize node's evidence:
- Final validation: full `npm test` EXIT 0, all four editions green (.cache/final-validation.md).
- Adaptive barrier gates: resume=0 gate=0 barrier=0 verdict=0 (barrier-check pass, verdict-check ok for review+adversary).
- Acceptance: AC1 (removing the findings-emission section from any reviewer body fails npm test) proven per-edition by the pin RED proofs and the adversarial-verifier A1–A4; AC2 (edition-aware, no .md-vs-.toml false-flag) confirmed.
- Documentation: CHANGELOG.md [Unreleased]/### Added entry written (finalize node declared write-set). doc-docking → DOCKED (.cache/doc-docking.md). doc-updater skipped-with-reason (internal test-infra; no API/README/.env impact).
- Closure decision: no deferred items / conflicts / partial work for #290.
- Summary: phase6-summary.md (READY FOR FINAL GIT GATE).

Write-set delta for this node vs its baseline: CHANGELOG.md only (matches declared write-set). Reviewer bodies zero-diff.
