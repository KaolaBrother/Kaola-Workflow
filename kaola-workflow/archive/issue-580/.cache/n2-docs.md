evidence-binding: n2-docs 4c2975e7f291

## Docs written

- `docs/decisions/D-580-01.md` (NEW) — ADR recording the decision to add `SHARED_STATE_FIELDS`
  to `kaola-workflow-adaptive-schema.js` (byte-identical ×4) as the single authoritative list
  of shared engine `workflow-state.md` fields, plus the behavioral parity gate
  `scripts/test-active-folders-field-parity.js` wired into all four chains; covers context
  (silent forge-port miss class exposed by #579 audit-only approach), decision (three moves:
  constant, gate, chain wiring), consequences, and alternatives considered.

- `docs/conventions.md` (MODIFIED) — appended a new bullet under
  "## Testing — Cross-Edition Validation (issue #307)" stating the `SHARED_STATE_FIELDS`
  convention: declare shared fields once in the byte-identical `kaola-workflow-adaptive-schema.js`,
  enforce via `scripts/test-active-folders-field-parity.js` in all four chains; per-edition
  fields not pinned.
