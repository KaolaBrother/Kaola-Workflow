# Documentation docking — issue-928

Verdict: **DOCKED**

## Changed files reviewed

12 code files + `CHANGELOG.md`:

- `kaola-workflow-adaptive-schema.js` ×4 (the byte-identical anchor) — deleted `NODE_MODEL_TIERS`,
  `TIER_ALIASES`, `normalizeTier`, `dispatchEffort` and the `dispatchEffort` export entry.
- `kaola-workflow-resolve-agent-model.js` ×4 — comment only; no behaviour change.
- `validate-workflow-contracts.js` ×2 — comment only; no behaviour change.
- `test-agent-model-resolver.js` — removed the 5 `dispatchEffort` assertion lines and the now-false
  "asserted below" parenthetical.
- `test-opencode-edition.js` — comment only.

## Documents checked

| Document | Finding |
|---|---|
| `CHANGELOG.md` | **Updated.** New `## [Unreleased]` / `### Removed` entry. The only doc edit owed. |
| `docs/api.md` | No impact — measured, names none of the four symbols. `:33` documents the envelope constructors (`refuse` / removed `answer`/`emit`), unrelated. `:541` "Kernel validation exports" tables `classifyRepoKind` and the validation surface; `dispatchEffort` was never listed there. |
| `README.md` | No impact — names none of the four symbols. |
| `docs/architecture.md` | No impact — no structural change; the anchor's role as the ×4 drift anchor is unchanged and it remains byte-identical. |
| `docs/opencode-edition.md` | No impact — its only tier/effort sentence (`:102`) is #927's past-tense record of the retired per-role effort tier, which this change neither revives nor contradicts. |
| `docs/conventions.md` | No impact — no convention added or changed. |
| `.env.example` | No impact — no environment surface touched. |
| `kaola-workflow/ROADMAP.md` | Generated mirror; closure regenerates it. Not hand-edited. |
| Issue #928 comments | The closing comment carries the measurement, including the two premise corrections. |

## Gaps found and fixed

None. The single owed edit (CHANGELOG) was authored **before** the chain-receipt run, so the receipt
is not staled by documentation — confirmed afterwards by `finalize --check`, which reports
`validation: chains_green`.

## No-impact reasons

The change removes a module export that **no documentation ever named**. That is the same measurement
that settled the issue itself: `codex_reasoning_effort` appears in no command, agent, SKILL or routing
template in any edition, and none of the four symbols appears in `docs/` (outside `docs/decisions/`,
which is history and is deliberately not rewritten) or in `README.md`. There is therefore no public
behaviour, API, setup, architecture, environment or validation change to dock beyond the changelog
entry — the deleted function was unreachable from every documented surface.

Generated surfaces are unaffected: `generate-routing-surfaces.js --check` reports all 18 surfaces
byte-matching their skeletons.
