# doc-updater report — issue #444

**Date:** 2026-06-13
**Issue:** #444 (D-421 P1+P2 dispatch descriptor + record-evidence --verify)

---

## Files Updated

### `docs/api.md`

**Why:** The `dispatch` sub-object added to `opened` by `buildDispatch()` (D-444-01 §2) and the new `record-evidence --verify` READ-ONLY subcommand (D-444-01 §4) had no documentation. Both are external-facing API surfaces that orchestrators consume.

**What was added** (after the existing `### Export: ROLE_TOKEN_REGISTRY` section, before `## Configuration`):

1. `### opened payload — dispatch sub-object (issue #444 / D-444-01)` — documents the stable field set of `opened.dispatch` transcribed verbatim from `buildDispatch()` in `scripts/kaola-workflow-adaptive-node.js` (lines 745–763); documents the `deriveGuards` guard vocabulary from lines 715–722 and the function comment lines 704–714.

2. `### record-evidence --verify (issue #444 / D-444-01 §4)` — documents the CLI invocation, the three return shapes (ok / evidence_absent / shape-failed family), and the no-side-effect contract; transcribed from `runVerifyEvidence()` lines 778–824.

Ground truth verified: all field names, reason codes, and guard strings were read directly from the source before writing.

### `docs/architecture.md`

**Why:** The dispatch descriptor / single-builder pattern is an architectural invariant (closes the #411-class drift by construction). The evidence seeding lifecycle paragraph at line 307 is the natural home for this note. A reference to `docs/api.md` for the field-level schema keeps the architecture doc at the right altitude.

**What was added:** One paragraph after the existing `Evidence seeding lifecycle (#433)` paragraph, titled `Dispatch descriptor single builder (#444 / D-444-01)`, naming `buildDispatch`, `deriveGuards`, and `record-evidence --verify`, and pointing to `docs/api.md` for the schema details.

---

## Files Skipped

### `README.md`

README.md at line 644 already documents evidence seeding at the right altitude (`evidence_file` and `required_tokens` in the `opened` payload). The `dispatch` sub-object is a machine-consumed field introduced as a schema consolidation, not a user-visible feature change. The README does not contain a subcommand reference list for `adaptive-node.js`, so no `--verify` entry belongs there. No change needed.

### `CHANGELOG.md`

Already done (stated in task description). Not touched.

### `.env.example`

No new environment variables were introduced by #444. Not touched.

### Inline comments

The inline comments in `scripts/kaola-workflow-adaptive-node.js` for `buildDispatch`, `deriveGuards`, and `runVerifyEvidence` (lines 704–714, 724–733, 736–743, 766–777) are already present and accurate — they were the ground-truth source for the docs/api.md entries. No change needed.

---

## Anti-fabrication attestation

All field names, reason codes, guard strings, and function signatures in the documentation additions were transcribed from `scripts/kaola-workflow-adaptive-node.js` and `docs/decisions/D-444-01.md`. No field was invented.
