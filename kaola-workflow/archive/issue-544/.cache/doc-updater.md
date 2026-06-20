# Doc Update — issue-544

## Documentation Update Checklist (CLAUDE.md)
- [x] README.md — fixed the dangling `PROVIDER_EFFORT_TABLE` pointer at line 361 (renamed by this change) → `mapTier + CONTRACT_EFFORT_TABLE + contractForProvider` (contract-keyed). Trivial Inline Edit (allowband; one token, mechanically obvious). No other README impact.
- [x] docs/opencode-edition.md — node n3: contract-keyed table + callout, line ref → CONTRACT_EFFORT_TABLE + contractForProvider, GLM `thinking` example (32000/16000), unknown→safe-default prose, new "Switching models (resilience)" subsection, 283→300 assertion-count fix.
- [x] CHANGELOG.md — node n5: #544 entry under `## [Unreleased]` → `### Changed`.
- [x] Architecture/decision docs — node n3: new `docs/decisions/D-544-01.md` (contract-keying + safe default + documented re-sync).
- [x] install-opencode.sh — node n3: seed_config comment block + echo (contract + re-sync ⚠).
- N/A API docs / .env.example — no API/env-var changes (effort-tier mapping is internal schema data + generator comments).

## Anti-fabrication
All doc claims trace to verified ground truth: the GLM `thinking` example matches the generator output (`KAOLA_OPENCODE_INHERIT_MODEL=zhipuai-coding-plan/glm-5.2 node scripts/sync-opencode-edition.js --write-config-to /tmp/... --adapt`); the contract-keyed table matches `CONTRACT_EFFORT_TABLE` in the schema; function names verified by Read.
