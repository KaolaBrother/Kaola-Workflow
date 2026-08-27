# Documentation docking — Issue #1036 / PR #1038

candidate: `90cccd9b1793dba80b4bd5cf01a100147bbad7fe`

## Changed files reviewed

- Product authority and generation: `templates/agents/runtime-capabilities.json`, `scripts/sync-cursor-edition.js`.
- Acceptance: `scripts/test-cursor-edition.js`, `scripts/test-runtime-agent-architecture.js`, `scripts/test-install-model-rendering.js`.
- Public documentation: `CHANGELOG.md`, `README.md`, `docs/README.md`, `docs/api.md`, `docs/conventions.md`, `docs/cursor-edition.md`, `docs/decisions/0021-runtime-native-orchestration-guidance.md`, `docs/runtime-capabilities.md`.
- Run evidence: Issue #1036 filing/latest owner correction, the code-review and adversarial receipts/closures, and `.cache/cursor-dual-surface.md`.

## Documents checked

- `CHANGELOG.md` under `## Unreleased`: docks the user-visible Cursor host split, Path A/Path B carrier distinction, capability gap versus install miss, and unclaimed Cloud boot-load.
- `README.md`: docks installation/runtime overview and the live-enum split.
- `docs/api.md`: docks the generated routing interface and conditional omit-model carrier.
- `docs/conventions.md`: docks the per-item honest fallback and catalog-miss rule.
- `docs/cursor-edition.md`: docks the complete CLI named-profile and APP/Cloud built-in-only behaviors, including the current CLI 2026.08.25 medium/high/xhigh live probe.
- ADR 0021 and `docs/runtime-capabilities.md`: dock the architecture decision, evidence inventory, carrier boundary, and explicit unknowns without cross-surface inference.
- `docs/architecture.md`, setup/install surfaces, `.env.example`, and public API comments were checked; no structural, environment, dependency, or setup change required additional edits.

## Gaps found and fixed

- Fixed three unqualified statements that described all Cursor tiers as profile-carried even on APP/Cloud catalog-miss hosts. They now restrict the profile carrier to Path A and state that Path B omit-model follows the parent with only resolver-listed live-schema model slugs as an effort lever.
- Updated two explanatory source comments to the same verified boundary; executable behavior and acceptance meaning were unchanged by those comment edits.
- Added the exact current CLI named-profile evidence to the Cursor guide and runtime capability evidence page while retaining APP/Cloud evidence separately and Cloud boot-load as unclaimed.

## Explicit no-impact reasons

- The Path B mutation-oracle and Codex version-source repairs are test-only and change no production API, setup, architecture, environment, or runtime behavior beyond strengthening the oracle; their public behavior was already documented.
- No codemap structure exists in this repository, so none was invented.
- No dependency, config schema, command flag, environment variable, installer behavior, or public response envelope changed.

## Verification

- Three Cursor forge trees are in parity; Cursor suite passed 854 assertions.
- Runtime agent architecture passed 721 assertions.
- All 14 roles / seven runtimes / 126 profile renders are current.
- All 18 routing surfaces byte-match the skeleton.
- `git diff --check` and local-link checks passed.

verdict: DOCKED
