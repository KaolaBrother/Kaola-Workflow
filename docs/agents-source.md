# Agent Sources and Provenance

Kaola-Workflow defines no subagent roles, role profiles, or subagent model and effort bindings
([ADR 0029](decisions/0029-native-subagents-only.md), #1101). Every runtime dispatches through its
own native subagent tool, schema, and catalog. This page records what replaced the retired role
authority and where the attribution for the retired material lives.

## Current sources

| Source | Owns | Must not own |
| --- | --- | --- |
| `templates/agents/runtime-capabilities.json` (`schema_version: 2`) | Evidence-backed per-runtime facts: instruction loading, hook scope, native subagent routes and their availability, compact-recovery carrier, and install scope, for twelve adapter variants | Roles, profiles, subagent model or effort bindings, or dispatch policy |
| `scripts/runtime-adapter-facts.js` | Loading and validating those facts (it rejects every retired role capability) and rendering the `KW-RUNTIME-DELEGATION` adapter section beside the dispatch contract | A role catalog or a second behavior source |
| `templates/routing/dispatch-contract.md` | The native-only dispatch contract every Next/Finalization surface and always-loaded carrier renders | Runtime brands or native tool names |
| `templates/agents/provenance.json` (`schema_version: 3`) | Attribution for the retired role contracts that remain readable in git history and `kaola-workflow/archive/` | Agent-facing prompt content or current behavior |

The adapter facts span ten runtime families through twelve variants: Claude; Codex for GitHub,
GitLab, and Gitea; and one each for OpenCode, Kimi, Grok, Cursor, ZCode, Devin, Droid, and DSH. None
installs a Kaola role profile.

## Retired

#1101 deleted `templates/agents/behavior-contracts.json` (the seven-role authority),
`scripts/generate-agent-profiles.js`, `agents/generated-agent-manifest.json`, the seven
`agents/*.md` Claude profiles, the 21 `plugins/*/agents/*.toml` Codex profiles, the three
`plugins/*/config/agents.toml` registrations, the Grok and Cursor edition agent renders, and
`scripts/validate-vendored-agents.js`. `scripts/test-issue-1101-native-only.js` fails if any of
them, a role name or roster, a role call card, or a pinned subagent model or effort returns.

## Historical origin

`templates/agents/provenance.json` keeps one `retired_roles` record per role retired by #1101
(`source_kind: kaola_authored`, `retired_by: "#1101"`) and one `earlier_retired_roles` record per
role retired earlier by #1062 whose contract had an external origin (`retired_by: "#1062"`). Six
of those roles keep a `history` record because an earlier version of their contract was derived
from Everything Claude Code (ECC): `code-explorer`, `doc-updater`, and `tdd-guide` (retired by
#1101), and `build-error-resolver`, `code-architect`, and `planner` (retired by #1062). The derived
contracts themselves were rewritten by #1054.

- Repository: <https://github.com/affaan-m/everything-claude-code>
- Pinned commit: `922d2d8f8b64f4e50936e24465cb3bcac81ac0e1`
- License: MIT License
- Copyright: Copyright (c) 2026 Affaan Mustafa

| Role | Upstream path | Upstream blob SHA |
| --- | --- | --- |
| `build-error-resolver` | `agents/build-error-resolver.md` | `2ab19ac35497ae2e1b7a33f238a6953867fc5572` |
| `code-architect` | `agents/code-architect.md` | `e99b3c718087e3be05c1763182cf904b8b25edb4` |
| `code-explorer` | `agents/code-explorer.md` | `a391679941f71b8ff0e12cc6d9bb025a899eabb7` |
| `doc-updater` | `agents/doc-updater.md` | `0da663329128a5a03ff811c39c0c01004cab5ac1` |
| `planner` | `agents/planner.md` | `c311f492bd1d3bae077c86716163966789eefae2` |
| `tdd-guide` | `agents/tdd-guide.md` | `1d0849840f0f5ed76541a48b2b4b0912b8926024` |

No current contract and no file in the npm package contains that material. The earlier ECC-derived
contracts remain readable in git history, in `kaola-workflow/archive/`, and in the repository-only
migration fixtures under `scripts/fixtures/issue-1101/` — frozen installs of earlier releases that
the #1101 migration suites start from (for example the v6.8.0 and v9.4.0 OpenCode and v9.17.1 Kimi
`planner` renders). Those fixtures are excluded from the package by `package.json` `files`, and all
of it stays available under the MIT License above. Each `history` record carries the upstream path,
blob and content hashes, and the #1054 shingle measurement
(`kaola-workflow/archive/bundle-1054/.cache/source-classification.md`).
`scripts/test-issue-1101-native-only.js` exempts only this file from its retired-reference scan.
