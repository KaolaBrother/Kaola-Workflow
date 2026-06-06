# Documentation Docking — issue-263

## Changed files reviewed

**Implementation (production code)**
- `scripts/kaola-workflow-adaptive-schema.js` — parseNodeSelector added
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js` — byte-identical copy
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js` — byte-identical copy
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js` — byte-identical copy
- `scripts/kaola-workflow-plan-validator.js` — parseShape select branch + selector_source column + G-SEL-1..4 + --selector-check CLI
- `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` — byte-identical to root
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` — same changes
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` — same changes
- `scripts/kaola-workflow-commit-node.js` — selectorCheck blocking step + armsToNa field
- `plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js` — byte-identical to root
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js` — same changes
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js` — same changes

**Tests**
- `scripts/simulate-workflow-walkthrough.js` — parseNodeSelector unit tests, --selector-check CLI tests, G-SEL typed-refusal cases, tripwire flip to in-grammar

**Docs (changed by doc-updater)**
- `README.md` — Classify-And-Act row added to Supported adaptive patterns (doc-updater also fixed two "three shapes" → "four shapes" occurrences)
- `CHANGELOG.md` — [Unreleased] entry added for #263
- `docs/api.md` — parseNodeSelector, --selector-check, selectorCheck JSON field, G-SEL-1..4, select shape documented
- `docs/architecture.md` — "three shapes" → "four shapes (sequence / fan-out / bounded loop / selective-execution select)"
- `docs/workflow-state-contract.md` — selector_source column and select(<group>) shape added to Nodes schema

**Workflow artifact**
- `kaola-workflow/.roadmap/issue-263.md` — staged (roadmap entry for in-progress issue)

## Documents checked

| Document | Status |
|----------|--------|
| README.md | Updated — Classify-And-Act row supported; "four shapes" correct |
| CHANGELOG.md | Updated — [Unreleased] entry for #263 |
| docs/api.md | Updated — all three new APIs (parseNodeSelector, --selector-check, selectorCheck) documented with real signatures and JSON shapes |
| docs/architecture.md | Updated — "four shapes" |
| docs/workflow-state-contract.md | Updated — selector_source column, select shape in Node schema |
| docs/decisions/ (ADRs) | No new ADR required — this is an additive grammar extension fully covered by ADR 0002/0003; the design doc (docs/investigations/2026-06-06-six-workflow-patterns.md) still frames Classify-And-Act as future/planned (stale) but that file is the investigation, not normative documentation |
| docs/investigations/2026-06-06-six-workflow-patterns.md | Not updated — this is an investigation/design-doc, not normative API/architecture docs. The stale "planned" framing is a known limitation noted in .cache/docs.md; acceptable as a follow-up |
| .env.example | No change needed — no new environment variables |
| Inline comments | Present — new functions carry // #263: rationale comments |

## Gaps found

**Minor (acceptable):** `docs/investigations/2026-06-06-six-workflow-patterns.md` still describes Classify-And-Act as future/planned. This file is an investigation document (not API/architecture docs) and is outside the declared write set for any node in this plan. It is a cosmetic inconsistency only; the normative docs (README, api.md, architecture.md) are all updated correctly. Recommended for a follow-up issue or trivial update in a subsequent doc run.

## No-impact reasons for skipped classes

- API endpoint docs: not applicable (CLI/script project, no HTTP API)
- .env.example: no new environment variables introduced
- Security docs: no security surface changes (G-SEL is purely grammar validation; the design doc confirmed zero blast radius for the selector_source)

## Issue acceptance criteria match

| AC | Verified |
|----|----------|
| AC1: select(<group>) validates in-grammar with ≥2 arms + read-only selector_source | ✅ tripwire flip confirmed |
| AC2: parseNodeSelector unit-covered, cross-edition byte-identical | ✅ 5 unit tests + validate-script-sync passes |
| AC3: routing step marks unselected arms n/a; missing/foreign selector halts | ✅ --selector-check fail-closed confirmed |
| AC4: gate post-dominance and write-attribution hold over superset | ✅ G-SEL-3 no-op (existing G1/G2); --gate-verify exit 0 |
| AC5: walkthrough tripwire flips from refuse to in-grammar | ✅ npm test exit 0 |
| AC6: README moves Classify-And-Act from Planned to supported | ✅ new table row present |

## Final verdict

DOCKED

All normative documentation is updated with ground-truthed content. The single stale investigation file is a known minor cosmetic gap, not a docking blocker.
