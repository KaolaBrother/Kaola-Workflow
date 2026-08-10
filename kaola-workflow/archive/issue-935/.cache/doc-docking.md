# Documentation docking — issue-935

Verdict: **DOCKED**

## Changed files reviewed (14)

`CHANGELOG.md` · `README.md` · `agents/adversarial-verifier.md` · `agents/build-error-resolver.md` ·
`docs/opencode-edition.md` · `install.sh` · `opencode.json` ·
`scripts/kaola-workflow-resolve-agent-model.js` + its 3 plugin copies ·
`scripts/generate-reviewer-profiles.js` · `scripts/test-agent-model-resolver.js` ·
`scripts/test-install-model-rendering.js`

## Documents checked

`README.md`, `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/opencode-edition.md`,
`docs/kimi-edition.md`, `docs/README.md`, `docs/workflow-state-contract.md`, all 60 files under
`docs/decisions/`, `templates/axioms.md`, `templates/routing/*.skeleton.md`, `commands/*.md`,
`CHANGELOG.md`, `opencode.json`.

## Gaps found and fixed

| gap | where | fix |
|---|---|---|
| Role tier column stated `standard` for both roles | `README.md:152`, `:156` | → `reasoning` |
| Model-badge visibility lists sorted both roles as Sonnet-dispatched | `README.md:~209-215` | moved to the Opus-dispatched list; lists now 7/7 |
| opencode reasoning-role **count** stale | `docs/opencode-edition.md:122` | "five" → "seven" |
| opencode reasoning-role **list** stale — a second defect the count fix would have masked | `docs/opencode-edition.md:123` | both roles added |
| No user-visible record of the change | `CHANGELOG.md` | new `[Unreleased]` with `### Changed` and `### Removed` |
| Inline comment asserted `adversarial-verifier` ships standard | resolver `:27-31` (×4 copies) | rewritten to the reasoning rationale |
| Inline comment asserted a retired wait-budget class **and** that Codex children inherit the parent pair (false since #925) | resolver `:18-19` (×4 copies) | rewritten to what the map actually governs |

## No-impact reasons

- **`docs/api.md` and `docs/architecture.md` — no change needed.** Both describe the tier→pair
  *mapping* (`standard` → `gpt-5.6-sol`/`medium`, `reasoning` → `gpt-5.6-sol`/`xhigh`), which this
  change does not touch. Neither enumerates role→tier *membership*; that lives solely in `README.md`'s
  table, which is fixed. Independently confirmed by `doc-updater`.
  This also means **no receipt-staling edit occurred** — `docs/api.md` is test-consumed, so leaving it
  untouched keeps the four-chain receipt valid.
- **`templates/routing/*.skeleton.md` and all generated command/SKILL surfaces — no change needed.**
  They carry the tier→pair mapping and the instruction to dispatch from the role's tier, never the
  role roster. Confirmed byte-clean: `generate-routing-surfaces.js --check` → all 18 surfaces match.
- **`docs/kimi-edition.md` — no change needed.** Kimi has no tier axis at all; a declared capability
  divergence, not drift.
- **`.env.example` — not present / no environment surface touched.**

## Deliberately left alone — historical records

Editing any of these would falsify a point-in-time record rather than correct a doc:

- `kaola-workflow/archive/**` — archived run records (e.g. `issue-927` still says "five reasoning roles").
- `docs/investigations/**` — dated design investigations, including
  `dynamic-workflow-composition-2026-06-02.md:1095`, which argues `adversarial-verifier` should default
  to `sonnet`. That was the reasoning at the time; #935 supersedes it in the code, not in the record.
- `docs/audits/opencode-edition-audit.md` — dated and self-marked superseded.
- `kaola-workflow/.origin/dead-exports-audit.md` and `kaola-workflow/.origin/877/*.md` — dated
  snapshots pinned to a commit.

`doc-updater` extended the historical-record rule to the last two on its own judgement and flagged it
for confirmation rather than applying it silently. **Confirmed — the extension is correct**; those are
the same class of artifact.

## Roadmap / run record

`kaola-workflow/ROADMAP.md` and `.roadmap/issue-935.md` are orchestrator-owned run state, not product
docs. Left to the finalize transaction and closure, which own them.
