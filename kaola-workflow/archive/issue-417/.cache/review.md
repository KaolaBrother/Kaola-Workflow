c6427fba8517
evidence-binding: review c6427fba8517

## review — code-reviewer evidence

**Scope**: Cross-edition prose parity + docs accuracy sweep for issue-417 (post-v5.15.0 staleness).

### Findings

**R1 (blocking, now fixed):** `docs/api.md:326` — the #390 sentence said "fires at `--freeze` time" which contradicted its own "Point-of-use" heading and misstated the mechanism. Actual: `model_invalid` fires at the point of use in `computeNextAction` (`open-next`/dispatch), not at `--resume-check`. Verified against `scripts/kaola-workflow-next-action.js:66-80`. Fixed before closing this node by dropping the review baseline, editing `docs/api.md`, and re-recording the baseline.

**R2 (advisory, non-blocking):** `docs/api.md:326` over-long concatenated #381/#388/#389/#390 bullet — readability nit, no defect.

### Checks passed

1. **Six-surface parity** — PASS. All 6 plan-run surfaces carry both edits: frontmatter description updated to running-set scheduler wording, `(current Claude Code)` parenthetical replaced with "background subagent dispatch". No surface missed.
2. **Contract-literal `frontier unit`** — PASS. Token present in `description:` frontmatter of all 6 files.
3. **No `(current Claude Code)` residue** — PASS in scope. 3 remaining hits are in `workflow-next.md` (pre-existing, out of scope).
4. **No code changes** — PASS. Only `.md` files touched.
5. **Prose accuracy** — PASS (after R1 fix).

verdict: pass
findings_blocking: 0
