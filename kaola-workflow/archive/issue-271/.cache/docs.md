# docs node evidence — issue #271

## File changed
`docs/api.md`

## Section changed
Line 252 — **G-SEL rules (Classify-And-Act, #263)** paragraph, within the **Grammar** block.

## What changed
Extended the G-SEL-1 clause to document the globally-unique group name requirement shipped in #271.

### Before (G-SEL-1 clause only)
> G-SEL-1: a select group needs ≥ 2 arms; all arms must name the same `selector_source` (which must exist in the plan, be read-only, and be listed in every arm's `depends_on`).

### After (G-SEL-1 clause only)
> G-SEL-1: a select group needs ≥ 2 arms; all arms must name the same `selector_source` (which must exist in the plan, be read-only, and be listed in every arm's `depends_on`); additionally, group names are a **global namespace** — if a name is shared by arms whose `selector_source` nodes differ, the validator emits a typed refusal: `G-SEL-1: select group name "<name>" used by arms with different selector_source nodes; use distinct group names for independent groups` (issue #271; additive — no existing gate is relaxed). Authoring rule: independent select groups MUST use distinct group names.

## Rationale
- The refusal message was copied verbatim from `scripts/kaola-workflow-plan-validator.js` line 607 (verified via grep before editing).
- The new text is appended to the existing G-SEL-1 clause; G-SEL-2 through G-SEL-4 are unchanged.
- No other files were touched.
- The change is purely additive: it documents a new refusal, does not relax any existing gate.
