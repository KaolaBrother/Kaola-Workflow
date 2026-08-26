# Agent Behavior Sources and Provenance

Kaola-Workflow has one runtime-neutral behavioral authority for every installed role. Native Claude,
Codex, opencode, Kimi, Grok, Cursor, and ZCode artifacts are generated outputs, not authoring
surfaces.

## Canonical source graph

| Source | Owns | Must not own |
| --- | --- | --- |
| `templates/agents/behavior-contracts.json` | The complete 14-role inventory; purpose, inputs, authority/custody, writes, deliverable, verification, stop conditions, capability requirements, and `standard` / `reasoning` / `heavy` intent | Runtime brands, native model names, tool syntax, home paths, hooks, or provenance narration |
| `templates/agents/runtime-capabilities.json` | Evidence-backed instruction loading, native carriers, dispatch, model/effort mapping, tool binding, hook scope, and nine closed adapter variants | Universal role behavior or arbitrary prompt extensions |
| `templates/agents/provenance.json` | Origin, pinned commit, license, copyright, upstream path/blob/content hashes, source classification, and local overrides for all roles | Agent-facing prompt content or runtime behavior |
| `scripts/generate-agent-profiles.js` | Schema validation, deterministic composition, behavior/render hashes, native profile rendering, generated manifest, and check/write modes | Project migration, installation policy, release mutation, or a second behavior source |
| `agents/generated-agent-manifest.json` | The 14-role, seven-runtime, 126-render inventory and source/output hashes | Provenance prose or independent policy |

The inventory has seven runtime families and nine adapter variants: Claude; Codex for GitHub,
GitLab, and Gitea; and one each for opencode, Kimi, Grok, Cursor, and ZCode. The three Codex variants
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

Shared-contract mutation tests require a role change to reach all nine variants. Adapter mutation
tests require a runtime-only change to remain isolated to that runtime family. This semantic and
native-render proof replaces cross-runtime sentence-paraphrase equality.

## Upstream provenance

Six role contracts are derived from Everything Claude Code (ECC); eight are Kaola-local. The exact
classification is authoritative in `templates/agents/provenance.json`.

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

The pinned content SHA-256 for each upstream role and every intentional local override also live in
`templates/agents/provenance.json`. Generated prompt bytes deliberately contain no origin, issue,
license, or attribution narration; the durable attribution is this document plus the machine source.

### Local Overrides

Each derived role's `local_overrides` array is the exact re-vendor checklist. An empty array means
the current runtime-neutral contract needs no separately recorded override. `doc-updater` retains
the documented Kaola tier adjustment; Kaola-local roles record their local authorship in the same
field. The machine-readable strings, not generated prompt prose, are authoritative.

## Kaola-local roles

`adversarial-verifier`, `code-reviewer`, `implementer`, `investigator`, `knowledge-lookup`,
`metric-optimizer`, `security-reviewer`, and `synthesizer` are recorded as `kaola_local`. Historical
derivation or earlier hand-authored profile format does not make a runtime render canonical.

## Refresh procedure

1. Choose and record the exact upstream commit, path, blob SHA, content SHA-256, license, and
   copyright in `templates/agents/provenance.json`.
2. Reconcile upstream behavior into the affected role record in
   `templates/agents/behavior-contracts.json`; do not copy a runtime-formatted upstream file into a
   generated output.
3. Reapply the explicit local overrides in the provenance record.
4. Regenerate and verify:

   ```bash
   node scripts/generate-agent-profiles.js --write
   node scripts/generate-agent-profiles.js --check
   node scripts/validate-vendored-agents.js
   node scripts/test-runtime-agent-architecture.js
   npm run test:kaola-workflow:editions
   ```

5. Inspect the generated manifest and native runtime diffs. Never hand-edit a rendered role profile.

The old reviewer-only generator, reviewer-only template directory, and sentence-parity suite are
retired. Historical changelog and ADR entries may name them as past architecture; no active
maintenance instruction should invoke them.
