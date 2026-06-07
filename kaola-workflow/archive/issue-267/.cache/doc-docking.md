# Documentation Docking — issue #267

## Changed files reviewed (git diff vs origin/main merge-base)
- `scripts/simulate-workflow-walkthrough.js` — additive test coverage only (+279 lines): `validateSelectFixture` helper + 4 new registered test functions (G1–G5) + `nextActionScript` const. No production behavior.
- `CHANGELOG.md` — `[Unreleased] ### Added` entry for #267.

## Documents checked
- **README.md** — NO IMPACT. No new feature, command, env var, or usage; the `select()`/role-library surface was already documented (#263/#250/#271/#274).
- **docs/api.md** — NO IMPACT. No new CLI flag, `--json` field, schema, or refusal class. The `select()` grammar, `selector_source`, G-SEL-1..4, `--selector-check`, `next-action`'s ready-set contract, and `computePlanHash`'s ledger-exclusion are all already documented from #263/#271/#274. (The sibling `--verdict-check` api/architecture doc gap is tracked separately in #257, out of this scope.)
- **docs/architecture.md** — NO IMPACT. No structural/data-flow change; tests characterize existing behavior.
- **docs/conventions.md** — NO IMPACT. Tests follow the existing hand-rolled-assert convention.
- **.env.example** — NO IMPACT. No new environment variable.
- **CHANGELOG.md** — UPDATED (the finalize node's declared write set).

## doc-updater
SKIPPED with explicit reason: no public behavior, API, setup, architecture, environment, or roadmap impact — purely additive test coverage in a single test file; the only doc surface (CHANGELOG `[Unreleased]`) is the finalize node's own declared write and is authored here. (Per project guidance, a drift-prone duplicate from doc-updater is avoided for a no-doc-impact change.)

## Acceptance criteria ↔ evidence
1. G1a–G1d in-grammar (+ G1d negative post-dominance control) — `testAdaptiveSelectComposition` PASSED.
2. G2 multi-group in-grammar — `testAdaptiveSelectComposition` PASSED.
3. G3 n/a propagation, real `next-action.js`, n/a arm absent from readySet — `testAdaptiveSelectNaPropagation` PASSED.
4. G4 `--resume-check` ok on partial (frozen) select plan — `testAdaptiveSelectResumeCheck` PASSED.
5. G5 selector_source-as-fanout-member pinned (in-grammar) — `testAdaptiveSelectSelectorSourceFanoutMember` PASSED.
6. `node scripts/simulate-workflow-walkthrough.js` exits 0 — confirmed; `npm test` green across all four editions.

## Verdict
DOCKED
