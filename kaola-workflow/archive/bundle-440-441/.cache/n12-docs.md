evidence-binding: n12-docs cf43cd012dc2

## Node: n12-docs
## Role: doc-updater
## Status: complete

## Changes made

### README.md

1. **Environment variables table** — added `KAOLA_GOAL` row (after `KAOLA_BUNDLE_MAX_ISSUES`) describing the operator-side goal text env var, its transcription into `## Meta` via `workflow-planner`, scout clustering via `KAOLA_GOAL`, and the advisory `goal_check` finalize receipt field.

2. **Adaptive workflow section** — added two new named paragraphs immediately after the existing "Evidence seeding (#433)" paragraph:
   - **Consent-halt triage payload (#440)** — describes `triage: { class, offending paths, proposed_repair?, testDelta? }` on `write-halt` and `barrier_failed`; the three `write_set_overflow` subtypes; the classification table in `adaptive-schema.js`; the structured `proposed_repair` using #434 primitives; and the single shape on both channels.
   - **Goal-conditioned bundles (#441)** — describes the optional `goal:` line in `## Meta`, `parseGoal`, hash-coverage, `KAOLA_GOAL`, `issue-scout` `goal_alignment`, and the advisory `goal_check` closure receipt field.

### docs/conventions.md

1. **Barrier and write-halt triage payload (#440)** — new section added immediately after the `.md` files as production surfaces (#424) section. Covers: three subtypes, classification table location, same shape on both channels, `proposed_repair` structured object, `proposed_repair` absent for `sensitive_write_unreviewed`/`foreign_archive`, threading via `--triage-json`, `barrierCheck` as single source. References `docs/decisions/D-440-01.md`.

2. **Goal-conditioned bundles — `KAOLA_GOAL` and `goal_check` (#441)** — new section immediately after the triage section. Covers: reader-only no-gate `parseGoal`, hash-covered for free, `KAOLA_GOAL` operator entry and dispatch-prompt travel, scout `goal_alignment`, advisory `goal_check` attestation in `cmdFinalize`. References `docs/decisions/D-441-01.md`.

### docs/README.md

Added two new entries to the decisions index, inserted before D-442-01 (preserving chronological order):
- D-440-01 — consent-halt triage payloads (D-420 Part 2, issue #440)
- D-441-01 — goal-conditioned bundles (D-420 Part 3, issue #441)

## Verification

All three files in the declared write set were read before editing. Changes are additive and do not alter existing prose. No executable code produced. Decision records D-440-01.md and D-441-01.md exist at `docs/decisions/` and are referenced correctly.
