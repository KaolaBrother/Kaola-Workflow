# Documentation docking review — Issue #1032

status: DOCKED

## Scope reviewed

- Issue #1032 body and owner refinement, plus ADR 0017.
- Production behavior for fresh claim-state serialization and legacy-field removal, Mission List
  write moments/resume, routing generation, role/test custody, model metadata, hook manifests, and
  installer retirement of the dispatch-log hook.
- Active documentation: `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `docs/api.md`,
  `docs/architecture.md`, `docs/conventions.md`, `docs/workflow-state-contract.md`, and the five
  additive-runtime edition guides.

## Documentation changes

- `CLAUDE.md`: reconciled Test custody with independent acceptance meaning plus meaning-preserving
  mechanical test maintenance; removed the retired dispatch-log hook from Validation Policy.
- `README.md`: reconciled role descriptions, task-sensitive/runtime-native model selection, direct
  natural-language handoff guidance without a slot schema, one-hook installation/verification, and
  singular compact-hook policy.
- `docs/conventions.md`: removed the retired routing-generator dependency and Codex SKILL roster row
  that described the deleted fixed per-spawn model carrier.
- `docs/opencode-edition.md`: removed the nonexistent generated runtime-neutral shell-hook row.
- `docs/grok-edition.md` and `docs/cursor-edition.md`: removed claims that a canonical
  `Agent Model Dispatch` section is substituted; documented the current model-free command render.
- `docs/zcode-edition.md`: closed the retained one-item hook list after dispatch-hook retirement.
- `CHANGELOG.md` `[Unreleased]`: added the independent-acceptance/mechanical-maintenance boundary and
  retirement of fixed per-spawn pairs and the seven-label handoff schema.

## Deliberately unchanged

- `docs/api.md`, `docs/architecture.md`, `docs/workflow-state-contract.md`, and
  `docs/kimi-edition.md` already describe the shipped claim-only state, compact natural-language
  handoff, converged review, runtime-native model handling, and retained compact hook.
- Historical `CHANGELOG.md` entries, decisions, audits, and investigations remain chronological
  evidence and were not rewritten to pretend retired mechanisms never existed.
- No code, tests, generated command/skill surfaces, or issue acceptance wording was changed by this
  documentation review.

## Verification

- `node scripts/generate-routing-surfaces.js --check` — exit 0; all 18 surfaces byte-match.
- `node scripts/validate-kaola-workflow-contracts.js` — exit 0.
- `git diff --check` — exit 0.

## Unresolved documentation gaps

None found on the active documentation surfaces reviewed.
