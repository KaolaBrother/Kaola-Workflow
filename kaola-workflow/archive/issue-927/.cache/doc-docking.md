# Documentation docking — issue-927

**Verdict: DOCKED**

## Changed files reviewed (17, commit `162135a8`)

**Code, opencode-scoped**: `scripts/sync-opencode-edition.js`, `scripts/test-opencode-edition.js`,
`templates/opencode/plugins/kaola-workflow-hooks.js`, `install-opencode.sh`.
**Code, shared**: `scripts/kaola-workflow-adaptive-schema.js` + its three forge mirrors (84 lines
removed, 6 added, all six of them comments), `scripts/sync-kimi-edition.js` (one comment).
**Prose**: `CHANGELOG.md`, `README.md`, `docs/opencode-edition.md`, `docs/kimi-edition.md`,
`docs/audits/opencode-edition-audit.md`, `docs/decisions/D-544-01.md`, `docs/decisions/D-610-01.md`,
`docs/investigations/2026-08-03-opencode-inherited-effort-tiers-design.md`.

## Behaviour changes and where each is reflected

| change | reflected in |
|---|---|
| Per-role effort tiers removed; a subagent runs the session's model and effort | `CHANGELOG.md` `### Removed`, `README.md`, `docs/opencode-edition.md`, `docs/kimi-edition.md`, the generated agent badge |
| `--write-effort-tiers-to` and `--adapt` flags gone | `docs/opencode-edition.md`; no other doc named them |
| `effort-tiers.json` sidecar gone | `docs/opencode-edition.md` deploy-layout table |
| `chat.params` hook gone | `docs/opencode-edition.md`, design record |
| Config-drift reporting **resubjected** to "carries per-role effort that no longer does anything" | `CHANGELOG.md` `### Added`, `README.md`, `docs/opencode-edition.md` § config drift |
| `--adopt-config`, its disclosure, its collision-proof backup | `CHANGELOG.md`, `README.md`, `docs/opencode-edition.md`, installer `usage()` |
| Plugin load fix (`export default` only) | `CHANGELOG.md` `### Fixed`, as a user-visible entry — it is not cosmetic |
| Removed exports from the ×4 anchor | no doc named them; verified by grep, see below |

## No-impact reasons, each verified rather than assumed

- **`docs/api.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/README.md`** — grepped for
  every removed symbol; **zero hits**. The only `adapt` matches are `adaptive-schema` (a filename
  that still exists) and `adapters`. Run **before** the chain receipt, since `docs/api.md` is
  test-consumed.
- **`.env.example`** — no environment variable added or removed. `KAOLA_OPENCODE_INHERIT_MODEL`
  survives; it has a consumer outside tiering (`resolveRuntime()` in `kaola-workflow-claim.js`).
- **Other editions' behaviour** — nothing to document, because nothing changed. Census at base
  commit `c3938174` shows every consumer of every removed symbol was an opencode file or prose; no
  claude, codex, gitea, gitlab or kimi script referenced any of them. The kimi changes are one
  comment and prose describing opencode by comparison.

## Gaps found and fixed during docking

1. `docs/audits/opencode-edition-audit.md` listed `agent.<role>.variant` as emitted — superseded with
   a dated note rather than a rewrite, because restating a June measurement as validating an August
   key would fabricate provenance.
2. `docs/decisions/D-610-01.md` — citation broken twice by two heading renames; repaired by citing
   the subject rather than the moving title, with present-tense claims about deleted functions
   past-tensed.
3. `docs/decisions/D-544-01.md` — a later measurement contradicts its **premise**, not just its
   mechanism: `zhipuai-coding-plan` routes through `@ai-sdk/openai-compatible`. Recorded as a dated
   measurement with no verdict on the decision.
4. The design record would have quietly become a description of the final state; instead flipped to
   BUILT, MEASURED, THEN REMOVED with its original body preserved and probe C recording why.
5. The doc agent found, beyond its brief, that **the replacement repeated the defect it was written
   to fix** — `D-544-01` says "keyed on brand name, not on the API contract", and the shipped
   `contractForProvider` matched on the provider *id*. Verified against `git show HEAD`.

## Knowingly left

`docs/decisions/D-544-01.md:119` still says the change "gains a 'Switching models (resilience)'
subsection", a section deleted in this run. It records what that decision did at the time — the
category that stays — and the new dated note above it already states that nothing below describes
shipping behaviour. Repairing it would be editing a decision's account of itself.
`docs/decisions/D-703-01.md` and `D-646-01.md` are historical for the same reason.
