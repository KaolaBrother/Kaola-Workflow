# Documentation Docking — issue-580

## Changed files reviewed (git diff vs origin/main)
- `scripts/kaola-workflow-adaptive-schema.js` (+ 3 byte-identical edition mirrors under `plugins/kaola-workflow{,-gitlab,-gitea}/scripts/`) — added exported `SHARED_STATE_FIELDS` constant (13 shared engine fields).
- `scripts/test-active-folders-field-parity.js` (NEW) — root-only behavior parity gate.
- `package.json` — appended the gate to all four `test:kaola-workflow:{claude,codex,gitlab,gitea}` chains.
- `docs/decisions/D-580-01.md` (NEW) — ADR for the SHARED_STATE_FIELDS convention.
- `docs/conventions.md` — cross-edition-discipline note under the #307 four-chain section.
- `CHANGELOG.md` — `[Unreleased] ### Added` entry for #580.

## Documents checked vs change
| Doc class | Impact | Reflected? |
|-----------|--------|------------|
| CHANGELOG.md | new internal contract + gate | YES — `[Unreleased] ### Added` entry written (n4) |
| docs/decisions/ (ADR) | new convention | YES — `D-580-01.md` (n2) |
| docs/conventions.md | cross-edition discipline | YES — note appended under the #307 section (n2) |
| README.md | none — no install/feature/env-var change | no-impact |
| docs/api.md | none — no new public API/schema/event; the gate is an internal test, `SHARED_STATE_FIELDS` is an internal constant | no-impact |
| docs/architecture.md | none — no structural/data-flow change | no-impact |
| .env.example | none — no new env var | no-impact |
| Inline comments | none — no public interface changed | no-impact |

## Gaps found and fixed
None. Every doc class with impact (CHANGELOG, ADR, conventions) is reflected; all other classes have explicit no-impact reasons (internal contract test, no public API/CLI/env/architecture surface).

## Final verdict
DOCKED
