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

`templates/agents/provenance.json` keeps one `retired_roles` record per retired role
(`source_kind: kaola_authored`, `retired_by: "#1101"`). Three of them — `code-explorer`,
`doc-updater`, and `tdd-guide` — also keep a `history` record because an earlier version of their
contract, retired by #1054, was derived from Everything Claude Code (ECC):

- Repository: <https://github.com/affaan-m/everything-claude-code>
- Pinned commit: `922d2d8f8b64f4e50936e24465cb3bcac81ac0e1`
- License: MIT License
- Copyright: Copyright (c) 2026 Affaan Mustafa

| Role | Upstream path | Upstream blob SHA |
| --- | --- | --- |
| `code-explorer` | `agents/code-explorer.md` | `a391679941f71b8ff0e12cc6d9bb025a899eabb7` |
| `doc-updater` | `agents/doc-updater.md` | `0da663329128a5a03ff811c39c0c01004cab5ac1` |
| `tdd-guide` | `agents/tdd-guide.md` | `1d0849840f0f5ed76541a48b2b4b0912b8926024` |

No current file contains that material. The earlier ECC-derived contracts remain readable in git
history and in `kaola-workflow/archive/` under the MIT License above; each `history` record carries
the upstream path, blob and content hashes, and the #1054 shingle measurement
(`kaola-workflow/archive/bundle-1054/.cache/source-classification.md`).
`scripts/test-issue-1101-native-only.js` exempts only this file from its retired-reference scan.
