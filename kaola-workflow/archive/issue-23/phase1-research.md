# Phase 1 - Research: issue-23

## Deliverable

Harden the Kaola parallel issue classifier so it extracts exact repository file paths from GitHub issue bodies, offline roadmap metadata, and claimed project phase artifacts, then classifies exact path overlap as `red` before falling back to area-level heuristics.

## Why

Parallel workflow startup currently uses a coarse area classifier. That can allow two sessions touching the same shared infrastructure file to proceed as only `yellow`, which is too weak for common Kaola changes to startup scripts, command prompts, and plugin copies.

## Affected Area

- `scripts/kaola-workflow-classifier.js` - primary classifier implementation.
- `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` - packaged Codex plugin copy.
- `scripts/simulate-workflow-walkthrough.js` - root regression coverage for classifier scenarios.
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` - plugin/Codex regression coverage if the plugin copy exercises classifier behavior.
- `scripts/validate-workflow-contracts.js` - static contract assertions for root workflow.
- `scripts/validate-kaola-workflow-contracts.js` - static contract assertions for plugin workflow.
- `README.md` and `CHANGELOG.md` - user-facing classifier contract documentation if behavior changes need documenting.

## Key Patterns Found

1. `scripts/kaola-workflow-classifier.js:104` - `FILE_PATH_REGEX` extracts only coarse paths under `scripts`, `commands`, `hooks`, and `kaola-workflow`.
2. `scripts/kaola-workflow-classifier.js:107` - `extractCoarseAreas(text)` discards exact path detail and keeps only the top-level area.
3. `scripts/kaola-workflow-classifier.js:186` - `scanClaimedOverlap(...)` already reads claimed projects' `phase1-research.md` and `phase3-plan.md`; this is the natural source for claimed exact paths.
4. `scripts/kaola-workflow-classifier.js:246` - `classify(...)` currently applies dependency, coarse overlap, area-label, and unknown-scope rules in one deterministic function.
5. `scripts/kaola-workflow-claim.js:536` - bootstrap accepts `green` and `yellow` verdicts as claimable; `red` and `blocked` are skipped by falling through to later issues.
6. `scripts/kaola-workflow-claim.js:544` - yellow verdicts create `kaola-workflow/{project}/.cache/parallel-classifier.md`; directory-only shared-infra yellow behavior must remain available.
7. `scripts/simulate-workflow-walkthrough.js:788` - Epic Case 6 is the existing root classifier regression block.
8. `scripts/validate-workflow-contracts.js:227` - static root contracts already know classifier files exist; marker assertions can be extended if useful.
9. `scripts/validate-kaola-workflow-contracts.js:145` - plugin contract validation checks the packaged classifier path too.

## Test Patterns

- Framework: Node.js stdlib assertions inside simulation scripts; static assertions inside validator scripts.
- Location: `scripts/simulate-workflow-walkthrough.js`, `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`, `scripts/validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`.
- Structure: create temporary repos with `fs.mkdtempSync`, write `.locks`, `.roadmap/issue-N.md`, phase artifacts, and `gh` shims, then run scripts through `execFileSync(process.execPath, ...)`.
- Required regression expansion: green, yellow, red, blocked, exact-path shared infra red, area-label-only yellow, unknown-scope Phase <= 2 red, and offline `touches:` or explicit path metadata.

## External Docs

None. This change uses existing local Node.js stdlib patterns and established `gh` CLI calls.

## Completeness Score

9/10

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | inline | .cache/code-explorer.md | Spawned agents require explicit user request in this Codex session; equivalent read-only exploration was performed inline. |
| docs-lookup | N/A | .cache/docs-lookup.md | Local stdlib/script behavior only; no external docs needed. |
