# Documentation update — bundle-900-901-902-903

**No `doc-updater` dispatch. Documentation was authored during the run by a dedicated prose agent
(`impl-prose`, four rounds) and every item was verified by the orchestrator directly.** A second pass
was declined for a specific reason, not convenience: `docs/api.md` is test-consumed, so a
finalize-time edit re-stales the four-chain receipt and costs a ~7-minute re-run. Churning it to
re-derive work already done and verified would trade a real cost for no gain.

## What was updated, and how it was verified

| surface | change | verification |
|---|---|---|
| `templates/routing/finalize.skeleton.md` | consumer recipe now names all three required column-0 fields and the `record` command; `--check` wording corrected from "clear everything it lists" to `reasons`; recipe states the record lands in the main-resident run folder | `generate-routing-surfaces.js --check` → all 18 byte-match, exit 0 |
| `templates/routing/slots.js:126` | `fz-closure-audit-run` now passes `--project {project}` for all three forges, with a commented `--execute` twin | same |
| 6 tracked rendered + 6 dot-dir edition surfaces | regenerated / edition-synced | **14/14 carry both `validated_candidate_hash` and the recorder command**, `.opencode*` and `.kimi*` named explicitly (ugrep skips dot-dirs); 12/12 rendered carry the landing sentence |
| `docs/api.md` | `:211` sync typed in **both** directions; `:219-222` `--check` envelope gains the `authority` block and `pending_mirror`; `:856-859` scoped audit forms + `--help`; `:447-469` `record` added; `:971` sharpened to name `workflow-state.md` as the only unconditionally required artifact; sink's three new fields | read directly |
| `README.md:958` | consumer recipe (14th surface, different wording) | read directly |
| `CHANGELOG.md` | new `[Unreleased]`, `### Added` for #900/#903 and `### Fixed` for #901/#902, +192 lines | hashed refs are **exactly** `#900 #901 #902 #903`; all background and cross-forge citations hashless, verified with the release verifier's own parser |
| `docs/conventions.md` | new section `## Specify the result; the method is the agent's (#900–#903)`, +44 lines, owner-directed | read directly |
| `CLAUDE.md` | new rule folded into the existing conventions pointer; **file shrank 198 → 197 lines** | `validate-workflow-contracts.js` exit 0 (cap is `wc -l` ≤ 198) |

## Checklist reconciliation (`CLAUDE.md:151-152`)

- `README.md` — **updated**.
- API docs — **updated** (five regions of `docs/api.md`).
- `CHANGELOG.md` under `[Unreleased]` — **updated**.
- architecture docs *if structure changed* — **no-impact, stated explicitly.** `docs/architecture.md:134-135`
  already says the consumer records a column-0 `verdict: pass` and a `validated_candidate_hash` bound to
  the tree, and that remains accurate. No structure changed: a subcommand and two flags were added, and
  the command reference belongs in `docs/api.md` (updated) and the shipped surfaces (updated). Editing it
  would have staled the receipt for a non-gap.
- inline comments where public interfaces changed — **updated** by each implementer in its own files;
  one comment was corrected as *false* (the symlink exclusion's claim that neither a symlink nor its
  target becomes a blob — `git add -f` stages a symlink as `120000`).

**Anti-fabrication:** every documented contract detail was measured against the real CLI rather than
transcribed — flag sets, output keys and exit-code semantics for `record` and the scoped audit came
from live `--json` output, and the prose agent stated so explicitly.
