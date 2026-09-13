# Documentation docking — issue-1072

verdict: DOCKED
candidate: 2c5e66f5101f7e523a6ead6c96bb5bd64a625248

## Checked files

- `AGENTS.md` — the changed surface itself (75→60 lines, 558→410 words at 2c5e66f5, `wc -l -w`). Local facts only: run-record paths, one-line pointers to `docs/decisions/0017-the-mission-list.md` and `kaola-workflow/.roadmap/_rules.md`, Source layout, Commands and validation, Change discipline (`:61-67` bullets retained; instruction-file meta-rule compressed to one bullet), Documentation checklist. Seven A1 pinned tokens and the five `validate-workflow-contracts.js:355-361` concept tokens present.
- `CLAUDE.md` — updated: bridge-narration line removed; exactly one `@AGENTS.md` line and the word "Claude" retained (A2).
- `CHANGELOG.md` — updated under `[Unreleased]` → `### Changed`: one entry for #1072 naming what was removed, the 75→60 line count, the seven pinned tokens, and the CLAUDE.md trim. No version bump; no release requested.
- `README.md` — no-impact: it does not quote or describe the removed AGENTS.md sentences; `grep -F` for "Product and design authority", "design of record", and "AGENTS.md:" returns 0 hits in README.md at 2c5e66f5.
- `docs/api.md` — no-impact: no public API, command, flag, or schema changed (3 files, all Markdown; `git diff --stat 2b1af448 2c5e66f5`).
- `docs/README.md:57,110`, `docs/task-quality.md:78` — no-impact: their "design of record" wording describes ADR 0017 itself, not a quotation of the removed AGENTS.md paragraph; links still resolve to `docs/decisions/0017-the-mission-list.md`.
- `docs/decisions/` — no-impact: no design change; ADR 0017 remains the Mission List record and AGENTS.md still points to it by path.
- `templates/routing/`, `templates/agents/`, `templates/global/` — no-impact: no skeleton, slot, contract, or adapter changed; the global contract that now solely carries the removed rules is untouched. `generate-routing-surfaces.js --check` reported all 24 surfaces byte-match inside `npm test` (`/tmp/kw-1072/npm-test-2.log`).
- Public-interface comments — no-impact: no JavaScript or shell changed.

## Correction carried forward

The mission-1 `result` in `mission-list.md` records "75→59 lines / 558→401 words"; that measurement predates the restoration of the `kaola-workflow/.roadmap/_rules.md` line that `validate-workflow-contracts.js` pins. The frozen candidate measures 60 lines / 410 words (`wc -l -w` on `git show 2c5e66f5:AGENTS.md`). Completed mission results are immutable; this file and `finalization-summary.md` carry the corrected figure.

## Evidence

- `git show 2c5e66f5:AGENTS.md` / `:CLAUDE.md` grep walk: 0/8 forbidden phrases, 7/7 A1 tokens, 5/5 concept tokens, 0 A1 must-not patterns, 4/4 retained `:61-67` bullets, 1 `@AGENTS.md`, 1 "Claude".
- Focused gates at the exact commit: `node scripts/test-runtime-agent-architecture.js` exit 0, `node scripts/validate-workflow-contracts.js` exit 0 (`/tmp/kw-1072/*-2c5e66f5.log`).
- Documentation residue grep over `README.md` and `docs/` (excluding `docs/decisions/`): reported in `finalization-summary.md`.
