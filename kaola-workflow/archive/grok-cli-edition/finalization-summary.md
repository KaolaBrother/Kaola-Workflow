# Finalization — Summary: grok-cli-edition

## Delivered

Additive Grok CLI runtime edition (#1008). First-class install, not Claude-compat leftovers.

- `install-grok.sh` + `scripts/sync-grok-edition.js` + `scripts/test-grok-edition.js` (442 assertions).
- Named `.grok/agents/` (14 roles, `model: inherit`), `.grok/commands/` (`spawn_subagent`, `--runtime grok`), hooks with camelCase payload adaptation.
- Inherit-only model/effort (comment on #1008). `knowledge-lookup` loads after YAML-quoting descriptions — the filed MCP-frontmatter cause was corrected on the issue.
- `install-all.sh` fifth runtime; out of `npm test` / `edition-sync.js` / `install.sh`.
- Docs: `docs/grok-edition.md`, README, architecture grok column (inherited + pointer), CLAUDE.md, CHANGELOG [Unreleased].

## Files Changed

Worktree `workflow/issue-1008` (uncommitted at summary write; implementation commit is the finalize gate). New: `install-grok.sh`, `scripts/sync-grok-edition.js`, `scripts/test-grok-edition.js`, `docs/grok-edition.md`. Wired: install-all, package.json, claim help (all four trees), routing `--write` refresh, gitignore, axiom/reachability tests.

## Test Coverage

- `node scripts/test-grok-edition.js` — 442 passed (D0 three trees in parity).
- `node scripts/test-install-all.js` — 259 passed.
- `testAxiomBlockByteIdentity` — 17 surfaces.
- `test-route-reachability.js` — 376 passed (grok in RUNTIME_EDITIONS).
- `test-generate-routing-surfaces.js` — 434 passed.
- `validate-script-sync.js` — OK.
- `test-relative-tmpdir-escape.js` — 49 passed.
- Live `grok inspect` (1.0.5) from this checkout: 14 custom agents including knowledge-lookup from `.grok/agents/`; three commands from `.grok/commands/`.

HEAD-red of the new suite (tdd-guide): generator absent + install-all unnamed grok.

## Validation

(filled by the finalize transaction from the chain receipt)

## Changed Paths

(filled by the finalize transaction)

## Mission List

items: 6
carrying an outcome while their status is not `done`: 0

## Documentation Docking

DOCKED. Record: `.cache/doc-updater.md`, `.cache/doc-docking.md`.

## Run gaps

## Follow-Up Items

- Live SubagentStart in a session that started *before* hooks were installed did not fire. Adapted hook writes a log line when given a camelCase payload. A new Grok session is the live fire. Not filed — environment of this run, not a product defect.
- Opt-in reasoning-class model pin (opencode `KAOLA_OPENCODE_REASONING_MODEL` shape) remains recorded on #1008, not built.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/grok-cli-edition/.cache/chain-receipt.json
- kaola-workflow/archive/grok-cli-edition/.cache/dispatch-log.jsonl
- kaola-workflow/archive/grok-cli-edition/.cache/doc-docking.md
- kaola-workflow/archive/grok-cli-edition/.cache/doc-updater.md
- kaola-workflow/archive/grok-cli-edition/.cache/origin/selection-record.json
- kaola-workflow/archive/grok-cli-edition/.cache/run-gaps.json
- kaola-workflow/archive/grok-cli-edition/finalization-summary.md
- kaola-workflow/archive/grok-cli-edition/mission-list.md
- kaola-workflow/archive/grok-cli-edition/workflow-state.md
