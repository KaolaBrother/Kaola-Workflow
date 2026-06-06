# Phase 6 - Summary: issue-263

## Delivered

Classify-And-Act selective execution (issue #263): a `select(<group>)` grammar shape
that lets the plan declare a group of mutually-exclusive arms, where a read-only
`selector_source` node emits a `selector: <arm-id>` verdict and the unselected arms
are marked `n/a` — exactly one arm runs, post-dominance gates hold over the full
superset, and freeze/barrier integrity is untouched.

Three primitives shipped across all four editions (root/Codex/gitea/gitlab):
1. `parseNodeSelector` in `kaola-workflow-adaptive-schema.js` ×4 (column-0-anchored,
   fence-blind, last-match-wins, returns `{ found, selector }`, cross-edition
   byte-identical).
2. `--selector-check --node-id X --json` mode in `kaola-workflow-plan-validator.js` ×4
   (G-SEL-1..4 rules: exactly-one membership, gates-never-selectable, post-dominance
   over superset, disjoint-or-identical arm write sets); fail-closed on
   missing/foreign selector (exit 1).
3. Blocking `selectorCheck` step in `kaola-workflow-commit-node.js` ×4 (shells
   `--selector-check`; `armsToNa` field returned for contractor n/a transcription;
   `overallOk` goes false on exit 1; backward-compatible via null when no `--node-id`).

Test coverage: `parseNodeSelector` unit tests (5), `--selector-check` CLI tests (4),
G-SEL typed-refusal cases (5). Tripwire in `testAdaptivePatternLibrary` flipped from
`refuse` to `in-grammar`.

## Files Changed

**Schema ×4**: `scripts/kaola-workflow-adaptive-schema.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js`

**Validator ×4**: `scripts/kaola-workflow-plan-validator.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js`

**Commit-node ×4**: `scripts/kaola-workflow-commit-node.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js`

**Tests**: `scripts/simulate-workflow-walkthrough.js`

**Docs**: `README.md`, `CHANGELOG.md`, `docs/api.md`, `docs/architecture.md`,
`docs/workflow-state-contract.md`

## Test Coverage

All 100 named tests in simulate-workflow-walkthrough.js pass. All 4 npm test suites
(claude/codex/gitlab/gitea) pass. `npm test` exits 0. Test-commit-node: 27 assertions.
Test-next-action: 33 assertions. validate-script-sync: 13 common scripts + 5 byte-identical
groups in sync.

## Final Validation Evidence

| Command | Result | Evidence |
|---------|--------|----------|
| `--resume-check --json` | exit 0 — plan_hash verified | barrier checks above |
| `--gate-verify --json` | exit 0 — unsatisfied:[] | barrier checks above |
| `--barrier-check --json` | exit 0 — pass, 0 errors | barrier checks above |
| `--verdict-check --json` | exit 0 — ok:true | barrier checks above |
| `node scripts/simulate-workflow-walkthrough.js` | exit 0 — 100 tests PASSED | `.cache/final-validation.md` |
| `npm test` | exit 0 — all 4 suites PASSED | `.cache/final-validation.md` |

## Documentation Docking

DOCKED — `.cache/doc-docking.md`. All normative docs updated. Minor cosmetic gap:
`docs/investigations/2026-06-06-six-workflow-patterns.md` still frames Classify-And-Act
as future/planned (investigation file, not normative; recommended as follow-up).

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items

1. (MEDIUM) G-SEL-1b phantom-arm gap: arms with blank `selector_source` in the plan
   column pass G-SEL-1b validation silently (`.filter(Boolean)` drops them). Worst case:
   both arms run (pre-#263 cost). Recommend a follow-up to tighten G-SEL-1b to require
   every select-group member to carry a non-empty `selector_source`.
2. (LOW) `selectGroups` keyed by bare `n.shape.group` (unlike fanout's `(label, origin)`
   keying). Only ever over-blocks; note for fanout-parity.
3. (COSMETIC) `docs/investigations/2026-06-06-six-workflow-patterns.md` still describes
   Classify-And-Act as future/planned. Investigation doc, not normative; follow-up only.
4. The USE side (contractor prompt wiring to write n/a rows based on `armsToNa`) is
   implemented at the script level (`--selector-check` + `selectorCheck.armsToNa`
   in commit-node) but not yet wired into the orchestrator prompt / contractor dispatch
   instructions. This plan IMPLEMENTS the grammar; an `orchestrator-update` follow-up
   is needed to wire the USE side.

## Closure Decision

Closure scan complete. Items 1-4 above are all non-blocking follow-ups; none require
user decision before closing #263. Items 1-2 are reviewer-noted improvement opportunities;
item 3 is cosmetic; item 4 is a known deferred USE-side wiring confirmed in plan.md §0a
note 5. Issue #263's 6 acceptance criteria all pass. No advisor consultation required.

## Commit And Push

Pending final Git gate. Final hash reported after push.

## GitHub Issue

Will be closed after sink-merge (issue #263 linked; all ACs pass).

## Roadmap

Will be updated by cmdFinalize + roadmap regen in Step 7.

## Archive

Will be moved to `kaola-workflow/archive/issue-263/` by cmdFinalize.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | `.cache/doc-updater.md` | |
| documentation docking | invoked | `.cache/doc-docking.md` | |
| closure advisor gate | N/A | closure scan recorded above | No user-decision items; all follow-ups are non-blocking |
| final-validation fix executors | N/A | `.cache/final-validation.md` — all tests passed on first run | |
| roadmap refresh | pending | cmdFinalize step 7 | runs with finalize |
| archive completed folder | pending | cmdFinalize step 8b | runs with finalize |
| final commit and push | ready | git status clean; sink: merge | final gate runs after this file |

## Status
READY FOR FINAL GIT GATE
