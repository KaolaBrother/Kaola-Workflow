# doc-updater record — bundle-712-716-717

doc-updater ran as plan node n3-documentation (role dispatch, subagent-invoked). Full evidence: kaola-workflow/bundle-712-716-717/.cache/n3-documentation.md.

## Checklist disposition (root CLAUDE.md Documentation Update Checklist)

- [x] README.md — no impact: internal detection/preflight bug fixes; no feature list, usage, or env-var surface change
- [x] API docs — docs/api.md updated (role_not_in_template delegated-scope wording; built-in non-delegable exemption at the three availability-check sites)
- [x] CHANGELOG.md — one [Unreleased] ### Fixed bullet covering #712, #716, #717 (bundle closes together)
- [x] Architecture docs — no impact: no structure/data-flow change
- [x] .env.example — no impact: no new environment variables (KAOLA_WORKFLOW_RUNTIME / KAOLA_AGENT_DIR pre-existing)
- [x] Inline comments — updated where the public detection-order contract changed (claude branch ahead of the #708 opencode pattern; cache-tuple branch after the source-tree pattern)

Anti-fabrication: every structured claim in the docs delta was checked against the shipped code by n3 (scripts/kaola-workflow-adaptive-node.js:784-824, 870-891; scripts/kaola-workflow-codex-preflight.js:2224, 2767-2770, 2786, 3021) and independently re-verified by the n4 certifier.
