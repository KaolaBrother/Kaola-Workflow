verdict: DOCKED

## Changed files reviewed

- Authored behavior: `templates/routing/{next,finalize}.skeleton.md` sets the live Codex standard-tier pair to `gpt-5.6-luna` / `max`, sets reasoning to `gpt-5.6-sol` / `high`, and forbids exceptions for either tier.
- Generated behavior: the six GitHub/GitLab/Gitea Codex next/finalize `SKILL.md` files carry the authored wording; `node scripts/generate-routing-surfaces.js --check` reported all 18 surfaces byte-matched.
- Contract coverage: `scripts/test-route-reachability.js` independently binds both complete live pairs and mutation-checks alternate pairs/fallbacks; `scripts/validate-kaola-workflow-contracts.js` asserts the live README pairs while retaining the separate historical preflight-migration binding.
- Existing documentation changes: `README.md`, `CHANGELOG.md` under `[Unreleased]`, and `docs/decisions/D-687-01.md` accurately state the live pair, preserve the historical #925 and stale-profile facts, and qualify the old omission probe as historical rather than proof of current routing.

## Documents checked

- Issue #1010 body and owner correction comment.
- Repository documentation checklist in `CLAUDE.md`.
- `README.md`, `CHANGELOG.md`, `docs/decisions/D-687-01.md`, `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/README.md`, `docs/workflow-state-contract.md`, and `.env.example`.

## Gaps found and fixed

- `docs/api.md`, `docs/architecture.md`, and `docs/conventions.md` still claimed that live dispatch values were authored/bound through the `CODEX_STANDARD_*` and `CODEX_REASONING_*` preflight constants. Verified implementation makes those constants historical stale-profile migration inputs and gives live routing its own complete-pair assertions. The three directly corresponding paragraphs now state that separation and the actual guard ownership.

## No-impact reasons

- No API signature, schema, CLI option, configuration key, environment variable, setup step, or role classification changed; no structured examples or `.env.example` update is required.
- No architecture component or workflow-state contract changed; only the documented ownership relationship between live routing assertions and historical migration constants required correction.
- No new document or navigation target was added, so `docs/README.md` needs no index change.
- Non-Codex runtimes, initialization, profiles/installers/preflight behavior, parent-session configuration, concurrency, waiting, lifecycle, sink, and release behavior are unchanged by the verified diff.

## Validation

- `git diff --check -- README.md CHANGELOG.md docs/decisions/D-687-01.md docs/api.md docs/architecture.md docs/conventions.md` passed.
- Repository-wide prose search found no remaining claim that live pairs are authored from or effort-bound to the historical preflight constants.
- `node scripts/generate-routing-surfaces.js --check` passed: all 18 surfaces byte-match the skeleton.
