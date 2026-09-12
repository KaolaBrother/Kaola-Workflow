# Agent Behavior Sources and Provenance

Kaola-Workflow has one runtime-neutral behavioral authority for every installed role. Native Claude,
Codex, Grok, and Cursor role profiles are generated outputs, not authoring surfaces; OpenCode, Kimi,
ZCode, and Devin install no Kaola role profiles (native-only runtimes, ADR 0025).

## Canonical source graph

| Source | Owns | Must not own |
| --- | --- | --- |
| `templates/agents/behavior-contracts.json` | The complete seven-role inventory; purpose, inputs, authority/custody, writes, deliverable, verification, stop conditions, and capability requirements | Runtime brands, native model names, tool syntax, home paths, hooks, or provenance narration |
| `templates/agents/runtime-capabilities.json` | Evidence-backed instruction loading, native carriers, dispatch, model/effort mapping, tool binding, hook scope, and ten closed adapter variants | Universal role behavior or arbitrary prompt extensions |
| `templates/agents/provenance.json` | Source classification (`source_kind`) for all seven roles, plus an optional `history` record — origin, pinned commit, license, copyright, upstream path/blob/content hashes, and measurement — for roles that carry one | Agent-facing prompt content or runtime behavior |
| `scripts/generate-agent-profiles.js` | Schema validation, deterministic composition, behavior/render hashes, native profile rendering, generated manifest, and check/write modes | Project migration, installation policy, release mutation, or a second behavior source |
| `agents/generated-agent-manifest.json` | The 7-role, six-adapter, 42-render inventory and source/output hashes | Provenance prose or independent policy |

The inventory spans eight runtime families through ten adapter variants: Claude; Codex for GitHub,
GitLab, and Gitea; and one each for opencode, Kimi, Grok, Cursor, ZCode, and Devin. Six adapters
install role profiles (Claude, the three Codex plugins, Grok, Cursor); the four `native_only`
adapters (OpenCode, Kimi, ZCode, Devin) render commands, skills, hooks, and the global contract
only. The three Codex variants
are forge-neutral for role behavior and render byte-identical profile bodies.

## Identity and proof boundary

`behavior_contract_hash` is calculated from the deterministic runtime-neutral role record. It
excludes the adapter, package version, forge, and provenance. Every runtime render of one role must
therefore carry the same behavior identity.

`resolved_profile_hash` binds one complete native render after its own hash field is normalized to
64 zeroes. It changes when native frontmatter, permissions, model/effort values, or presentation
bytes change. The two hashes prove deterministic source and filesystem artifacts; they do not prove
that a proprietary runtime loaded private prompt bytes or that stochastic executions produce the
same prose or verdict.

Shared-contract mutation tests require a role change to reach all six profile-installing
adapters. Adapter mutation
tests require a runtime-only change to remain isolated to that runtime family. This semantic and
native-render proof replaces cross-runtime sentence-paraphrase equality.

Claude's native render already carries `behavior_contract_version`, `behavior_contract_hash`, and
`resolved_profile_hash` in YAML frontmatter, so its runtime-adapter appendix
(`scripts/generate-agent-profiles.js`, `runtimeAppendix`) records only `runtime: claude` plus the
capability-boundary prose. No installer, preflight, or test reads a second copy from that appendix
for Claude. Every other runtime has no frontmatter equivalent, so its appendix carries the full
block instead: `behavior_contract_version`, `behavior_contract_hash`, `adapter_capabilities_hash`,
and `resolved_profile_hash`.

## Source classification

`templates/agents/behavior-contracts.json` is the current authoring authority for every role; all
seven role contracts are Kaola-authored. Together with `templates/agents/runtime-capabilities.json`
it generates 42 renders (7 roles × 6 profile-installing adapters) through
`scripts/generate-agent-profiles.js`. Before ADR 0025 (#1062) the roster had fourteen roles across
ten adapters — 140 renders; that inventory remains readable in git history.

`templates/agents/provenance.json` (`schema_version: 2`) records, for each of the seven roles:

- `source_kind` — `kaola_authored` for every role today.
- an optional `history` object, present only for a role whose earlier contract came from elsewhere:
  `origin`, `upstream_path`, `upstream_url`, `source_commit`, `source_blob_sha`, `source_sha256`,
  `derived_through`, `retired_by`, and `measurement`. `origin` names a key in the file's top-level
  `origins` object (currently `everything_claude_code`), which carries the repository, pinned
  commit, license, and copyright for that origin.

Two scripts check these fields:

- `scripts/generate-agent-profiles.js` (`validateProvenance`) requires `schema_version === 2` and an
  `origins` object; for every role in `ROLES` it requires a record whose `source_kind` is
  `kaola_authored`, and, when a record carries a `history` object, that `history` includes `origin`,
  `upstream_path`, `source_commit`, `source_blob_sha`, `source_sha256`, and `retired_by`, and that
  `history.origin` names a key present in `origins`.
- `scripts/validate-vendored-agents.js` asserts every role's `source_kind` is `kaola_authored`, and,
  for any role whose `history.origin` is `everything_claude_code`, that `history.source_commit`
  stays pinned to `922d2d8f8b64f4e50936e24465cb3bcac81ac0e1`.

Generated prompt bytes deliberately contain no origin, issue, license, or attribution narration
(`validate-vendored-agents.js` asserts no rendered role file matches
`source-commit:|source-blob-sha:|source-sha256:|copyright:`); the durable attribution is this
document plus `templates/agents/provenance.json`.

## Historical origin

Three surviving roles — `code-explorer`, `doc-updater`, and
`tdd-guide` — carry a `history` record in `templates/agents/provenance.json` because an earlier
version of their contract was derived from Everything Claude Code (ECC). Before ADR 0025 (#1062),
`build-error-resolver`, `code-architect`, and `planner` also carried ECC `history` records; those
records were removed with the retired roles, and the earlier provenance remains in git history:

- Repository: <https://github.com/affaan-m/everything-claude-code>
- Pinned commit: `922d2d8f8b64f4e50936e24465cb3bcac81ac0e1`
- License: MIT License
- Copyright: Copyright (c) 2026 Affaan Mustafa

| Role | Upstream path | Upstream blob SHA |
| --- | --- | --- |
| `code-explorer` | `agents/code-explorer.md` | `a391679941f71b8ff0e12cc6d9bb025a899eabb7` |
| `doc-updater` | `agents/doc-updater.md` | `0da663329128a5a03ff811c39c0c01004cab5ac1` |
| `tdd-guide` | `agents/tdd-guide.md` | `1d0849840f0f5ed76541a48b2b4b0912b8926024` |

Each of these three records carries `relationship: "historical (retired by #1054)"` and
`retained_material: "none in the current role contracts; earlier derived contracts remain in git
history and kaola-workflow/archive/ under this license"`. This describes where an earlier contract
came from, not the current one: the current body for all seven roles, including these three, is
Kaola-authored, and the earlier ECC-derived contracts remain readable in git history and in
`kaola-workflow/archive/` under the MIT License above. The other four roles —
`code-reviewer`, `implementer`, `investigator`, and `knowledge-lookup` — carry no `history`
record; they have no
earlier non-Kaola origin.

## Measurement

The upstream files were re-fetched read-only at the pinned commit (their SHA-256 matched the
recorded `source_sha256`), then compared with the pre-#1054 body and the rewritten body of each
role (body plus description, lower-cased, punctuation stripped). A shingle is a run of eight
consecutive words; "longest run" is the longest sequence of consecutive words both texts share.
The table below is historical: `build-error-resolver`, `code-architect`, and `planner` were
retired under ADR 0025 (#1062) and no longer carry provenance records.

| Role | Shared 8-word shingles, before #1054 | Longest shared run, before | Shared 8-word shingles, after #1054 | Longest shared run, after |
| --- | --- | --- | --- | --- |
| `build-error-resolver` | 73.1% (562 of 769) | 400 words | 0 | 4 words |
| `code-architect` | 40.2% | 139 words | 0 | 0 |
| `code-explorer` | 67.4% | 157 words | 0 | 0 |
| `doc-updater` | 61.1% | 250 words | 0 | 0 |
| `planner` | 60.1% | 283 words | 0 | 0 |
| `tdd-guide` | 14.6% | 136 words | 0 | 0 |

Each role's `history.measurement` field in `templates/agents/provenance.json` carries its own
figures; the full method and the command output are in the #1054 run record
(`kaola-workflow/archive/bundle-1054/.cache/source-classification.md` once archived).

## Changing a role

Every role's positioning, deliverable, authority/custody, and stop condition live in
`templates/agents/behavior-contracts.json`. There is no re-vendor procedure for any role, including
the three that carry a historical origin record above.

1. Edit the role's entry in `templates/agents/behavior-contracts.json` (and, for a role's runtime
   carriers, `templates/agents/runtime-capabilities.json`).
2. Regenerate and verify:

   ```bash
   node scripts/generate-agent-profiles.js --write
   node scripts/generate-agent-profiles.js --check
   node scripts/validate-vendored-agents.js
   node scripts/test-runtime-agent-architecture.js
   npm run test:kaola-workflow:editions
   ```

3. Inspect the generated manifest and native runtime diffs. Never hand-edit a rendered role profile.

The old reviewer-only generator, reviewer-only template directory, and sentence-parity suite are
retired. Historical changelog and ADR entries may name them as past architecture; no active
maintenance instruction should invoke them.
