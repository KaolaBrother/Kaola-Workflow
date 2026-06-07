# Documentation Docking — issue-261

## Changed files reviewed (git diff main...worktree working tree)
- scripts/kaola-workflow-claim.js + plugins/kaola-workflow/scripts/kaola-workflow-claim.js (cmdFinalize narrowed staging, AC2)
- scripts/kaola-workflow-plan-validator.js + plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js (barrier-check archive carve-out, AC3)
- commands/kaola-workflow-phase6.md + gitlab + gitea editions (Staging Guard FOREIGN_ARCHIVE block, AC1)
- scripts/simulate-workflow-walkthrough.js (testFinalizeNarrowStagingExcludesForeignArchive)
- scripts/test-commit-node.js (foreign-archive barrier assertions)
- docs/api.md, docs/architecture.md (this docking's doc updates)
- CHANGELOG.md ([Unreleased] ### Fixed entry)

## Documents checked
- docs/api.md — --barrier-check flag desc gains foreign-archive refusal (c); JSON-shape note; cmdFinalize narrowed-staging note. DOCKED.
- docs/architecture.md — #231 enforcement-boundary barrier-check sentence extended with the foreign-archive clause + defense-in-depth companions. DOCKED.
- CHANGELOG.md — [Unreleased] ### Fixed entry covering AC1/AC2/AC3 + the S1 follow-up. DOCKED.
- README.md — no impact (no install/feature/env-var surface change; the barrier/staging are internal merge-gate mechanics). SKIP (explicit no-impact).
- .env.example — no new env vars. SKIP (explicit no-impact).
- docs/workflow-state-contract.md — no durable-state schema change (no new state fields). SKIP (explicit no-impact).

## Gaps found and fixed
- None. The doc-updater node applied 4 verbatim, code-grounded edits; spot-checked present.

## Acceptance-criteria ↔ doc mapping
- AC1 (Staging Guard foreign-archive block) → CHANGELOG + architecture.md companion clause.
- AC2 (cmdFinalize narrowed staging) → api.md Roadmap Closure Cleanup note + CHANGELOG.
- AC3 (--barrier-check foreign refusal) → api.md flag desc (c) + JSON note + architecture.md.
- AC4 (×4 editions green) → not a doc; verified by full npm test (final-validation evidence).

## Final verdict: DOCKED
