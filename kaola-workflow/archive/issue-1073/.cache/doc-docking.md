# Documentation docking — issue-1073

Candidate: `813c868e4371a53246662c489383d1fe6a2a27fa` on `workflow/issue-1073` (base `2b1af448`).
Checklist source: `AGENTS.md` → Documentation (README, docs/api.md, CHANGELOG `[Unreleased]`,
architecture/ADR when design changes, public-interface comments, docs/README.md index).

## Checked files

| file | outcome | what changed / why no impact |
|---|---|---|
| `README.md` | fixed (813c868e) | one sentence after the subagent-binding paragraph: rendered profiles carry only the behavior body; the receipt triple lives in `agents/generated-agent-manifest.json`, never in agent-visible text. Named by the issue's acceptance. |
| `docs/api.md` | fixed (5bd758d0) | `generate-agent-profiles.js` row: no receipt hashes / no runtime-adapter appendix in renders; manifest fields `behavior_sha256`, `adapter_capabilities_sha256`, `resolved_profile_sha256` per `runtime`/`variant`/`role`; new exports `manifestProfileEntry`, `adapterHash`, `MANIFEST_PATH`; removed `normalizeResolvedProfileHash`, `verifyResolvedProfileHash`, `ZERO_HASH`. `grep agentProfileContract\|profile_contracts docs/api.md` → no hits to retire. |
| `CHANGELOG.md` | fixed (5bd758d0) | `[Unreleased] → Changed` bullet: what moved, where the triple lives, installer/kernel changes, retained fail-closed path, `profiles_stale` upgrade note. |
| `docs/agents-source.md` | fixed (5bd758d0) | "Identity and proof boundary" rewritten to the sidecar; table row for the manifest names the triple. |
| `docs/architecture.md` | fixed (5bd758d0) | render/hash paragraph and `delegation_guidance` paragraph use the manifest field names and state no digest is rendered into profile text. |
| `docs/conventions.md` | fixed (5bd758d0) | manifest table row ("6 renders per role and the receipt triple"), hash-semantics paragraph ("Both live in the generated manifest sidecar, never in profile bodies"). |
| `docs/runtime-capabilities.md` | fixed (5bd758d0) | field names + "(both recorded in `agents/generated-agent-manifest.json`, not in the profile text)". |
| `docs/decisions/0020-agents-first-runtime-bridges.md` | fixed (5bd758d0) | one appended sentence: superseded in part by #1073 (the ADR specified the in-body hash). Historical text not rewritten. |
| `docs/decisions/D-696-01.md` | fixed (5bd758d0) | same one-sentence supersession note on the zeroed-self paragraph. |
| `docs/decisions/0021-runtime-native-orchestration-guidance.md` | no impact | mentions `resolved_profile_hash` only as the digest routing guidance is excluded from; the statement stays true of `resolved_profile_sha256`. Dated design record; not rewritten. |
| `docs/decisions/0019-the-heavy-reasoning-tier.md` | no impact | "contract hashes re-stamp" is a historical implementation note in a retired-tier ADR. |
| `docs/README.md` (index) | no impact | no new or moved documents; every linked file still exists. |
| `AGENTS.md` / `CLAUDE.md` | no impact | source layout, commands, and validation instructions unchanged. |
| Public-interface comments | fixed (5bd758d0) | generator comment describing the appendix deleted with the code; kernel comment naming `agentProfileContract` trimmed; installer/preflight comments naming the retired helper updated. |
| `scripts/prose-census-baseline.json` | no impact | `captured_at_commit: 6ae5374b` snapshot for ADR 0013 P5; lines 418–419 list `resolved_profile_hash_count` / `resolved_profile_hash_mismatch` as codes present at that commit, which is true. No script or npm chain reads it (`grep -rn prose-census-baseline package.json scripts/*.js` → only `kaola-workflow-prose-census.js`); `--compare` is documented as diagnostic, never a verdict. Regenerating would overwrite the reference measurement, not correct it. |
| `scripts/fixtures/issue-1055-render-baseline.json` | fixed (5bd758d0) | recaptured with `--write-baseline`: its documented policy requires recapture when the render legitimately changes. |

## Verification of the docking

- `npm run test:kaola-workflow:claude` (inside the receipt) includes `test-release-surface-drift.js`, `test-route-reachability.js`, `test-issue-1044-prompt-bundle.js` — all exit 0 at `813c868e`.
- `git grep -n -E 'resolved_profile_hash|behavior_contract_hash|adapter_capabilities_hash|runtime-adapter:start' -- docs README.md CHANGELOG.md` → only the historical ADR lines listed above plus the CHANGELOG bullet that names the removed lines.

DOCKED
