evidence-binding: n3-docs 552e01eb4f5e

## Doc-updater evidence — issue #616 `serialDegradeReason` documentation

Declared write set: `docs/api.md` only. Touched nothing else.

Located the existing `speculativeWriteExcluded` documentation first (`docs/api.md:295`, the
"Speculative-open kernel typed outcomes" bullet — the same location `speculative_write_excluded`
and its `parent_dirty` reason, added by #615, are already documented) and matched its exact
prose style (bolded `field-name` (#issue) lead-in, followed by field type/when-it-appears/value
prose, no separate JSON block — that bullet has none either).

Added one new bullet immediately after it (`docs/api.md:296`) documenting `serialDegradeReason`:
- Field: `serialDegradeReason` (string), additive to the `open-ready` response.
- When it appears: ONLY on a SUCCESSFUL single-write open (`result:'ok'`, `opened:[<one write
  node>]`) — explicitly called out as the OPPOSITE polarity of `speculativeWriteExcluded`, which
  rides an empty/no-open response.
- Value: `'parent_dirty'` — the only value the code ever assigns (verified at
  `scripts/kaola-workflow-adaptive-node.js:4387`, `if (parentDirty) serialDegradeReason =
  'parent_dirty';`) — set only when `parentCarriesProductionDirt()` caused the non-speculative
  serial degrade (the SAME `--parent-clean-check` fence #615's `speculativeWriteExcluded` reuses).
- Absent case: explicitly enumerated the other three serial-degrade causes that leave the field
  undefined (byte-identical to pre-#616) because none of them ever evaluate the parent-clean
  fence — a single ready write node (`writeNodes.length < 2`), `!legCoupled`, `groupCeiling < 2`,
  and `!grp.ok` (genuine `--parallel-safe` overlap).

Verified against source before writing (not fabricated): read
`scripts/kaola-workflow-adaptive-node.js:4240-4393` (the full `runOpenReady` branch that sets
`serialDegradeReason`) and `:4566-4618` (the response envelope's conditional spread at `:4615`),
plus `scripts/test-adaptive-node.js:6960-6986` (the positive `#616-SERIAL-DEGRADE-TELEMETRY` and
negative `#616-PLAIN-SERIAL-DEGRADE` assertions) confirming the field name, type, single value,
and the four degrade causes named above. Cross-checked against `n2-review.md`'s already-APPROVEd
code review (verdict: pass) so the documented behavior matches the reviewed implementation, not
a stale intermediate.

No other doc surface required an update: `docs/architecture.md` describes structure/data-flow at
a level above individual response-field additions (no existing per-field response documentation
there to extend); `README.md` and `CHANGELOG.md` are outside this node's declared write set and
are not touched here (CHANGELOG `[Unreleased]` entries for this issue are an orchestrator/other-
node concern, not part of this docs-only node's task as scoped).

## Not committed

Per contract, no commit was made — the orchestrator owns the implementation commit at finalize time.
