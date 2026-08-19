# Documentation docking — grok-cli-edition (#1008)

## Changed files reviewed

- New: `install-grok.sh`, `scripts/sync-grok-edition.js`, `scripts/test-grok-edition.js`, `docs/grok-edition.md`
- Wired: `install-all.sh`, `package.json`, `.gitignore`, `scripts/generate-routing-surfaces.js`, `scripts/kaola-workflow-claim.js`, `scripts/runtime-edition-forge.js`, `scripts/test-install-all.js`, `scripts/test-relative-tmpdir-escape.js`, `scripts/test-route-reachability.js`, `scripts/simulate-workflow-walkthrough.js`
- Docs: `README.md`, `CHANGELOG.md` [Unreleased], `CLAUDE.md`, `docs/README.md`, `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/kimi-edition.md`, `docs/opencode-edition.md`

## Documents checked

| Document | Status |
| --- | --- |
| README.md | Five product runtimes; install table + grok section; roles mention `.grok/agents/`; axiom commentary points at the test count |
| docs/api.md | `--runtime …\|grok`; sync-grok-edition.js in the edition-sync row; `--refresh-present` verify command split |
| docs/architecture.md | Grok column, inherited + pointer |
| docs/grok-edition.md | Matches generator + installer (doc-updater verified --help) |
| docs/README.md | Indexes grok-edition.md |
| CHANGELOG.md [Unreleased] | #1008 bullet |
| CLAUDE.md | Additive sentence + install-grok.sh |
| .env.example | Absent — no-impact |
| docs/workflow-state-contract.md | No grok-specific fields — no-impact |

## Gaps found and fixed

- README lede/bullets still said four product runtimes — updated to five.
- README roles paragraph omitted Grok — added `.grok/agents/` + inherit note.
- Axiom-width commentary in README + conventions still described 14/12 after grok joined the constructed set — pointed at `testAxiomBlockByteIdentity` / `NEXT_SURFACES` (15) instead of restating a stale number.

## No-impact reasons

- `.env.example` does not exist and this edition adds no env contract beyond `GROK_HOME` already documented in install-grok.sh --help and docs/grok-edition.md.
- Consumer `KW-CLAUDE-TEMPLATE` stays runtime-neutral (no vendor/model names).

## Verdict

DOCKED
