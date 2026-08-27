# Documentation review — Issue #1036 / PR #1038

## Identity and scope

- Candidate reviewed: `0501f2527e04c1ecd896df418e50c97b279aa568`.
- Base used for the complete candidate diff: `a6d49c112581b49a151700c49c60971df411ec3e`.
- Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1036`.
- Complete candidate diff: 13 files — the eight public documentation surfaces named in the
  dispatch, `templates/agents/runtime-capabilities.json`, the Cursor generator, and three test
  files. The repair delta after the prior review is confined to
  `scripts/test-cursor-edition.js` and `scripts/test-install-model-rendering.js`.
- Codemap detection: neither `scripts/codemaps/` nor `docs/CODEMAPS/` exists. No codemap was
  invented or regenerated.
- Required evidence record read: `kaola-workflow/issue-1036/.cache/cursor-dual-surface.md`.
  The recorded Issue #1036 Cloud probes are the APP/Cloud evidence; the recorded local CLI probe is
  separate evidence.

## Acceptance and source reconciliation

The latest Issue #1036 owner correction and the candidate source/output agree on these boundaries:

- **APP/Cloud Path B:** the measured Cloud parents exposed only built-in Task types for Kaola
  dispatch. The consumer parent had 14 project profiles already on disk; the producer parent had no
  project profiles. The live members were used as themselves (`generalPurpose`, `explore` when
  reported). No custody-bearing Kaola name was impersonated.
- **CLI Path A:** a live enum containing a Kaola name permits named dispatch with omitted per-call
  model, so the generated profile pin carries the tier. The cache records local Cursor CLI
  `2026.08.25-3e8eec8` resolving `implementer`, `code-reviewer`, and `planner` to
  `cursor-grok-4.6-medium`, `cursor-grok-4.6-high`, and `cursor-grok-4.6-xhigh`; all three calls
  exited successfully without repository mutation.
- **Authority and fallback:** the live Task enum is authoritative. On Path B, omit-model follows
  the parent rather than a profile pin; a resolver-listed live-schema model slug is an effort lever.
  Files already present plus a still-built-in-only enum is a specific `capability_gap`, not an
  install miss. A missing exact role is considered per item; it does not create a run-wide inline
  policy.
- **Cloud boot-load:** remains explicitly unclaimed. Neither the source authority, generated
  consumers, nor the documentation treats the measured Cloud sessions as proof of boot-load.
- **No untraceable structured fact:** `BLOCK` conditions: none. The current CLI facts above are
  transcribed only from the exact-candidate cache record; the Cloud facts are transcribed only from
  the recorded Issue #1036 probes and their source authority entry.

The machine authority at `templates/agents/runtime-capabilities.json` keeps
`runtimes.cursor.capabilities.named_roles: true` because that remains a supported CLI fact. Its
`dispatch_carrier`, `native_routes`, `fallback_search`, and `availability` strings narrow that
boolean by the live host enum. Freshly rendered `workflow-next` and
`kaola-workflow-finalize` carry the same distinction: named omit-model only when the Kaola name is
present; built-in-only omit-model is parent inheritance, with resolver-listed model slugs as the
only measured model lever. This is consistent with the generated Path B oracle and does not infer
Cloud behavior from CLI evidence.

## Documentation checklist

| AGENTS.md requirement / surface | Checked content | Result and reconciliation |
| --- | --- | --- |
| `README.md` | Runtime map/model-intent summary, Cursor install overview, and Cursor detailed subsection | Already states the live-enum split, CLI named-profile omit-model, Cloud built-ins-as-themselves, `capability_gap` versus install miss, and no cross-surface claim. No edit needed; the concise overview intentionally retains the separately dated 2026.08.11 CLI evidence, while the detailed evidence pages now record the exact 2026.08.25 probe. |
| `CHANGELOG.md` under `[Unreleased]` | Lines 3–14 | Already has the #1036 host-split entry and all required Path A/Path B, capability-gap, model-slug, and unclaimed boot-load semantics. No edit needed. |
| `docs/README.md` | Runtime-edition index and ADR index | Cursor entry points to the live-enum host split and ADR 0021. No edit needed. |
| `docs/api.md` | Routing interface, generated-surface contracts, Cursor catalog helper, and model-resolution section | Already distinguishes named-catalog omit-model from Cloud built-ins and documents the generated/runtime authority. No edit needed. |
| `docs/conventions.md` | Runtime-native fallback rule | Already states live Task authority, named-profile omit-model only when the Kaola name is present, built-ins-as-themselves, and already-present `capability_gap` rather than install miss. No edit needed. |
| `docs/cursor-edition.md` | Cursor generation, tier/carrier explanation, CLI and Cloud probes, model contract, path selection, installer and hooks | Edited. The old heading and two paragraphs described every dispatch as model-free/profile-carried. They now qualify that as Path A and explicitly state Path B parent inheritance, resolver-listed model lever, and no profile pin. Added the verified local CLI 2026.08.25 Path A confirmation without treating it as Cloud evidence. |
| `docs/decisions/0021-runtime-native-orchestration-guidance.md` | Default carrier and Cursor honest-fallback decision | Edited. The profile-carrier sentence is now conditional on the active catalog and records the Path B parent/model-slug semantics. |
| `docs/runtime-capabilities.md` | Machine-map explanation, capability table, tier bindings, first-party evidence, explicit unknowns | Edited. Added the exact-candidate local CLI 2026.08.25 named-profile confirmation, kept it separate from the Cloud probe, and narrowed the unknown-version wording so the measured named-profile probe is not falsely listed as wholly unknown. The Cloud boot-load unknown remains explicit. |
| Architecture documentation | `docs/architecture.md` runtime-edition, routing-authority, capability-divergence, and model-intent sections | Checked. The architecture graph and authority chain did not change; it already points to `runtime-capabilities.md` for capability divergence and describes the marked generated block. No structural architecture edit was demonstrated or made. |
| Public-interface comments | Cursor generator and Cursor edition validator module comments | Edited as documentation-only comments. They now say named-profile cards omit static model overrides, while catalog-miss routing may use a resolver-listed live model slug; no executable behavior changed. |
| Setup/install surface | `install-cursor.sh`, Cursor installer section, `kaola-workflow-ensure-cursor-catalog.js` API row | Checked. The installer and catalog-materialization behavior did not change in the candidate; no setup documentation gap was found. |
| Generated next/finalize consumers | `.cursor/commands/workflow-next.md` and `.cursor/commands/kaola-workflow-finalize.md` (plus forge trees) | Checked from real generated output. Both contain the live-enum authority, Path A conditional omit-model/profile pin, Path B parent/not-profile-pin relation, resolver-listed model-slug lever, already-present `capability_gap`, and unclaimed Cloud boot-load wording. Generated trees are ignored outputs, so no tracked consumer edit was made. |
| Validation/documentation impact | Three changed test files and repair records | The Cursor semantic oracle/mutation fixture is test-only and proves generated-byte Path B meaning; no new user contract. The Codex version-test repair scopes child attestation and adds a hermetic fallback oracle; it changes no production API, setup, or runtime behavior. Their existing evidence records are `.cache/path-b-test-repair.md` and `.cache/codex-version-test-repair.md`; no extra changelog/API entry is warranted. |

## Edits made

1. `docs/cursor-edition.md` — changed the model-free heading to host-split native dispatch; qualified
   profile-carrier and omitted-model language to Path A; documented Path B parent inheritance and
   resolver-listed model slugs; added the exact local CLI Path A confirmation.
2. `docs/decisions/0021-runtime-native-orchestration-guidance.md` — qualified profile-carried tiers
   by active catalog and recorded the Path B model-carrier semantics.
3. `docs/runtime-capabilities.md` — added the exact local CLI probe and refined the explicit
   unknowns without weakening the Cloud boot-load boundary.
4. `scripts/sync-cursor-edition.js` and `scripts/test-cursor-edition.js` — corrected stale
   module-level explanatory comments only. No executable statements, exports, generated bytes, or
   acceptance meaning were changed by this review.

No other tracked files were edited. In particular, `README.md`, `CHANGELOG.md`, `docs/README.md`,
`docs/api.md`, `docs/conventions.md`, and `docs/architecture.md` were deliberately left unchanged
because their current text already docks the corrected contract (or, for architecture, the graph
is unchanged) and no additional demonstrated contradiction remained.

## Commands and observed results

All commands below ran from the exact candidate worktree unless a path is stated.

1. `git rev-parse HEAD` → `0501f2527e04c1ecd896df418e50c97b279aa568`.
2. `git rev-parse origin/main` → `a6d49c112581b49a151700c49c60971df411ec3e`.
3. `git diff --name-only origin/main...HEAD` → the 13-file candidate scope listed above.
4. `gh issue view 1036 --repo KaolaBrother/Kaola-Workflow --json number,title,state,body,comments,url` →
   latest owner correction confirmed CLI-only `named_roles: true`, live-enum Path A/Path B routing,
   built-ins-as-themselves, already-present `capability_gap`, and unclaimed Cloud boot-load.
5. `node scripts/generate-agent-profiles.js --check` → `agent profiles current: 14 roles, seven
   runtimes, 126 native renders`.
6. `node scripts/generate-routing-surfaces.js --check` → all 18 surfaces byte-match the skeleton.
7. `node scripts/test-runtime-agent-architecture.js` → `runtime-agent-architecture test passed
   (721 assertions)`.
8. `node scripts/sync-cursor-edition.js --forge=github --check`, followed by the same command with
   `--forge=gitlab` and `--forge=gitea` → each tree had 14 agents, 3 commands, and 2 hook files in
   parity. The generator reports the linked worktree's generated-tree root as the main checkout, as
   designed.
9. `node scripts/test-cursor-edition.js` → `cursor-edition test passed (854 assertions)` and all
   three generated trees were in parity.
10. `env -u KAOLA_CODEX_VERSION node scripts/test-install-model-rendering.js` → `Install model
    rendering tests passed`.
11. `node --check scripts/sync-cursor-edition.js` and `node --check scripts/test-cursor-edition.js`
    → both passed.
12. `git diff --check origin/main...HEAD` and `git diff --check` → passed with no whitespace errors.
13. A read-only local-link sweep over the seven changed/checked Markdown surfaces → 7 files checked,
    no missing local targets.
14. A stale-phrase scan over docs/source comments found no remaining unqualified `model-free` or
    `Task cards still omit` statements.

## Verdict

`pass`

- `findings_blocking: 0`.
- The demonstrated docking gap was repaired in the Cursor guide, ADR, and capability evidence map;
  source comments were aligned without executable changes.
- Path A CLI and Path B APP/Cloud evidence remain separate and source-traceable.
- Cloud boot-load remains `unclaimed`; no documentation promotes it to supported behavior.
- Both test-only repair deltas were accounted for and require no additional public documentation.
- No codemap update was applicable.
