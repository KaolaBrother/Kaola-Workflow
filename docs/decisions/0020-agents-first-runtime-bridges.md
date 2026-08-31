# ADR 0020 — AGENTS-first runtime bridges

Status: Superseded in part by ADR 0023; role/adaptor clauses remain active and orchestration/model
routing is refined by ADR 0021 · Date: 2026-08-27 · Issues: #1033, #1034

## Context

Kaola-Workflow previously treated Claude-formatted repository instructions and most Claude Markdown
role profiles as cross-runtime source material. Root `AGENTS.md` redirected every reader into
`CLAUDE.md`; additive runtimes then transformed or paraphrased Claude-shaped prose into their own
carriers. Three reviewer roles had a narrower generated contract, while the remaining roles relied
on maintained Markdown/TOML parity.

That direction was incompatible with switching one Kaola-formatted repository among all supported
runtimes. A universal rule should not require a vendor-specific entrypoint, and a native adapter
should not need to recognize another runtime's arbitrary prose before it can express a capability.

First-party evidence establishes that Codex, opencode, Kimi Code, Grok, Cursor, and ZCode load
`AGENTS.md` directly within documented scopes. Claude Code loads `CLAUDE.md` and documents
`@AGENTS.md` as the bridge. The evidence, versions, precedence, and unknowns are recorded in
`../runtime-capabilities.md` and `templates/agents/runtime-capabilities.json`.

## Decision

### Project instructions

Root `AGENTS.md` is the single runtime-neutral repository authority. It owns universal project,
workflow, validation, documentation, and release behavior. Universal managed content uses the
`KW-AGENTS-MANAGED` region.

Root `CLAUDE.md` is a thin native bridge and overlay. It begins with `@AGENTS.md`; its managed region
contains only Claude-specific discovery, profile, and local-chain facts. No universal rule is copied
into it.

Every other runtime reads root `AGENTS.md` directly according to its documented discovery scope.
If a future runtime cannot, it must add the smallest native bridge. A bridge is never a second
universal source.

### Role behavior and adapters

All 14 roles have one complete runtime-neutral behavioral authority in
`templates/agents/behavior-contracts.json`. The closed intent vocabulary is `standard`, `reasoning`,
and `heavy`; it expresses relative intent, not a vendor model or fixed per-spawn pair.

`templates/agents/runtime-capabilities.json` owns only measured runtime differences: instruction
loading, native profile/dispatch carriers, model and effort mapping, tool binding, hooks, and install
scope. The inventory is seven runtime families and nine adapter variants: Claude; Codex for three
forges; and opencode, Kimi, Grok, Cursor, and ZCode. Fourteen roles across those variants produce 126
deterministic renders.

`scripts/generate-agent-profiles.js` composes behavior plus adapter. Claude Markdown, Codex TOML,
and every additive runtime profile are render targets. A runtime adapter may use native capability
fields, but it may not copy or independently restate universal behavior. An unavailable required
capability becomes an explicit `capability_gap`, not a broadened permission or silent omission.

`behavior_contract_hash` binds runtime-neutral behavior. `resolved_profile_hash` binds one complete
native render. Cross-runtime proof is semantic reachability plus adapter isolation, not sentence or
byte equality. True forge-neutral twins remain byte-identical.

### Provenance

`templates/agents/provenance.json` records exact upstream repository, commit, license, copyright,
paths, blob/content hashes, role classifications, and local overrides. Provenance is validated and
documented in `../agents-source.md`, but excluded from role behavior hashes and agent-facing prompt
bytes.

### Consumer migration

`scripts/kaola-workflow-project-instructions.js` owns project instruction migration through three
explicit modes:

- `plan` classifies and reports proposed hashes without writing;
- `check` is read-only and reports drift;
- `apply` writes only a safe planned migration, using atomic replacement.

Known workflow-owned redirects and managed regions may be replaced. Bytes outside owned markers are
preserved, including non-UTF-8 bytes and restrictive file modes. Distribution-owned consumer
templates prevent this producer repository's richer `AGENTS.md` from leaking into other projects;
one shipped module is the only consumer wording, and workflow-init surfaces do not restate it. The
byte-exact v9.17.2 redirect/CLAUDE pair and byte-exact released consumer-template pair have
one-time whole-file migrations, while the producer itself is preserved. A legacy
`KW-CLAUDE-MANAGED` region with changed outer bytes is owner-ambiguous and remains untouched. A
second apply is a byte-identical no-op. Active older workflow runs are preserved under the contract
they started with. Malformed markers, non-regular carriers, owner-only instruction authorities, or
any ambiguous split return `decision_required` and write nothing.

No migration uses symlinks, deletes nested or local runtime files, or silently moves owner-authored
instructions.

### Edition-suite orchestration

The additive edition lane attempts opencode, Kimi, Grok, Cursor, and ZCode even when an earlier
suite fails, and reports aggregate failure after all attempts. Behavior-level uninstall checks
observe a sandboxed filesystem result; they do not pin local source identifiers.

## Consequences

- One consumer repository can switch runtimes without changing its universal Kaola contract.
- Adding or repairing a universal role clause changes one source and must reach all nine adapter
  variants under mutation proof.
- Runtime-native optimization is permitted where the capability map supports it, without turning
  native syntax into universal policy.
- Runtime support claims require first-party evidence. Unknown size, precedence, version, or path
  behavior remains explicitly unknown.
- Generated profiles and runtime trees are not authoring surfaces. Direct edits are overwritten or
  rejected by checks.
- Installed-file convergence is necessary evidence but is not presented as proprietary prompt-load
  attestation or deterministic model output.

## Supersession

ADR 0023 supersedes this record's project-instruction ownership, marker, fixed consumer-template,
and script migration clauses. Root `AGENTS.md` remains the normal cross-runtime project authority
and Claude still uses the smallest native bridge, but an Agent now maintains those project files
from verified repository facts. The old migration text remains above as historical context rather
than current implementation guidance.

This ADR supersedes active guidance that made `CLAUDE.md` the universal authority, treated Claude
role Markdown as the cross-runtime semantic source, maintained Markdown-to-TOML sentence parity, or
gave only reviewer roles a generated source. Historical changelog, investigation, and ADR text may
retain those facts as history.

ADR 0019's runtime-neutral intent classes remain, but its Claude-shaped source details are
superseded here. ADR 0021 retains ADR 0019's owner-approved runtime binding matrix as default
dispatch policy and supersedes this ADR's statements that routing surfaces select no model/effort
pair or must reject all runtime-native default routing. ADR 0017's mission-list architecture and
ADR 0018's forge-as-backlog decision remain unchanged.

## Rejected alternatives

- Duplicate the universal contract in every runtime's native file.
- Keep Claude Markdown canonical and add more regex rewrites.
- Force byte-identical prompt prose across runtimes.
- Claim every runtime loads `AGENTS.md` without current first-party evidence.
- Put provenance narration in prompts.
- Rewrite owner-authored project instructions automatically.
- Reintroduce fixed per-spawn model routing, scheduler state, role fields, or a mandatory dispatch
  pipeline.
