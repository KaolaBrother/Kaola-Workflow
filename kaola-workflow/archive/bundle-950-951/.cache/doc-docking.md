# Documentation docking — bundle-950-951 (commit 8b6eeb48)

## Verdict: DOCKED

## Changed files reviewed

| file | kind | docking obligation |
|---|---|---|
| `docs/conventions.md` | prose rule | is itself the documentation; repaired in place |
| `docs/decisions/0017-the-mission-list.md` | ADR watch list | is itself the documentation; one row appended |
| `scripts/test-route-reachability.js` | comment-only | inline comment, repaired in place |
| `CHANGELOG.md` | changelog | `[Unreleased]` entries written and twice corrected under review |

No behaviour, API, schema, CLI, config or environment change. `scripts/sync-opencode-edition.js` is
deliberately untouched: the user ruled #951 is recorded, not fixed, so the absence of a code change
is the decision rather than an omission.

## Documents checked

`README.md` · `docs/README.md` · `docs/architecture.md` · `docs/api.md` ·
`docs/workflow-state-contract.md` · `docs/opencode-edition.md` · `docs/kimi-edition.md` ·
`docs/decisions/*.md` · `CHANGELOG.md` · `.env.example` (absent) · roadmap mirror.

## No-impact reasons

- **`README.md`** — overview and install only; carries no worked example, no assertion count, no
  reference to the repaired rule. Swept for `test-route-reachability|325|stays green|331`: no hits.
- **`docs/api.md`** — no CLI surface, JSON envelope or schema changed, so nothing to restate.
- **`docs/architecture.md`** — no structural change; no component, data flow or seam moved.
- **Inline comments** — the one comment implicated is in this diff. No public interface changed, so
  no other comment surface is reached.
- **Roadmap mirror** — closure owns it; not hand-edited here.

## Gaps found and fixed

None. The one gap that could have existed — a fourth surface still carrying the now-false "stays
green under forge deletion" claim — was swept for independently three times (code reviewer,
adversarial verifier, doc-updater) and does not exist. Two near-miss hits were read in context rather
than accepted from a grep:

- `docs/opencode-edition.md:402` and `docs/kimi-edition.md:364` both say the existing
  `test-route-reachability.js` suite "stays green". Different claim, still true: they assert that
  *adding an edition surface* does not perturb the suite's baseline, not anything about the
  forge-deletion mutation. Verified live — 331 assertions, exit 0. No edit owed.
- `docs/decisions/D-514-01.md`, `D-636-01.md`, `D-637-01.md` and siblings quote assertion counts
  (146, 239, 283) as of their own dates. These are dated point-in-time build-decision records, which
  is the same convention this change applied to the five-defect table row — historical, not living
  documentation. Left untouched deliberately.

## Ground truth re-verified rather than assumed

- `node scripts/test-route-reachability.js` → `passed (331 assertions)`, exit 0.
- `scripts/test-generate-routing-surfaces.js:239` still carries the literal
  `eq(GENERATED_SURFACES.length, 18, 'registry derives 18 surfaces (3 topics x 6)')`.
- `simulate-workflow-walkthrough.js:12024` computes
  `routing.FORGES.length * (2 + runtimeEditionCount)`; `FORGES` derives from the edition tables at
  `generate-routing-surfaces.js:134-141`, so 3×4 = 12 and one forge deleted gives 2×4 = 8 — the
  12→8 figure quoted in both the repaired prose and the CHANGELOG.
- The walkthrough's own header comment already stated the fact the repaired doc now points at, so
  the repoint cites an existing recorded measurement rather than introducing a new claim.
