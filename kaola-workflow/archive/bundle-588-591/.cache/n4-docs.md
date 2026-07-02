evidence-binding: n4-docs c7df06888125

task: document the #591 (per-member leg_path/leg_branch dispatch threading) and #588
(write co-open width/mix coverage + max_concurrent write-cap fix) implementation and prose
already landed by n1-impl / n2-prose, verified clean by n3-adversarial (verdict: pass).

write_set (exactly the 4 allowed files, nothing else):
- CHANGELOG.md
- docs/decisions/D-588-01.md (new)
- docs/decisions/D-591-01.md (new)
- docs/api.md

## Per-file summary

**CHANGELOG.md** — added two `[Unreleased]` / `### Added` entries as siblings of the
existing `#587` entry (591 and 588 inserted before it, descending-issue-number order matching
the house style seen in prior releases): (1) `#591` — per-member `leg_path`/`leg_branch`
conditional-attach on `dispatch` (mirrors `goal_line`), `runOpenReady()` threading from
`legs[n.id]`, byte-identity guard on serial/read, six-surface + frontier-card prose
repointing, RED-first (6 failing assertions pre-impl); (2) `#588` — four new real-git cases
(3-leg octopus pinned correct; 5-wide write antichain vs `FANOUT_CAP` — **found and fixed** a
real `max_concurrent` defect recording the READ cap (8) instead of the WRITE cap (4) for a
write lane group, corrupting `reconcile-running-set`'s crash-resume ceiling; mixed
read+write frontier pinned deliberate; scheduler-path task-mirror fail-open pinned correct),
suite 1127→1219 assertions (+79 #588, +13 #591). Both entries cite cross-edition (#307) chain
requirements and their respective decision records.

**docs/decisions/D-588-01.md** (new ADR) — Context: width-2-only prior coverage (three named
gaps: no ≥3-leg octopus, no write-FANOUT_CAP case, no mixed frontier, no scheduler-path
task-mirror fail-open case). Decision: the four cases (a)-(d) with per-case outcome
(fix-or-pin-never-silently-pin, per the issue's own acceptance criteria), spelling out the
`laneGroupCeiling` fix mechanics. Consequences: reconcile ceiling now correct for write
groups; explicit note that a stale pre-fix `max_concurrent:8` manifest reconciles provably
harmless because `reconcile`'s roll-forward is bounded by the members actually PRESENT in the
manifest (never >4 for any write group), matching n3-adversarial's residual-notes item 3.
Two rejected alternatives recorded (special-casing reconcile; a second ceiling field).

**docs/decisions/D-591-01.md** (new ADR) — Context: discipline-dependent leg isolation +
the laneGroup-cross-reference-only routing gap (quotes the pre-fix "dispatch each leg with
its absolute legPath" instruction and the fact the per-member dispatch object only carried
`working_dir`). Decision: `buildDispatch()` conditional-attach (mirrors `goal_line`) +
`runOpenReady()` per-member `legs[n.id]` threading + the new byte-identity guard + the
six-surface/frontier-card prose repointing (verified byte-diff-identical across all six
changed regions per n2-prose evidence). Consequences: routing now per-member, byte-identical
serial shape preserved, `laneGroup` retained for observability only. Two rejected
alternatives recorded (prose-only tightening; a full nested-legs-map attach).

**docs/api.md** — three edits, all anchored to ground truth read from the actual code diff
(`buildDispatch`/`runOpenReady` in `scripts/kaola-workflow-adaptive-node.js`) and the existing
adjacent doc sections (never invented): (1) the `opened` payload `dispatch` sub-object stable
field set (issue #444/D-444-01 section) gained `leg_path?`/`leg_branch?` conditional fields
with the same optional-key convention as `goal_line?`, plus a new explanatory paragraph
cross-referencing `runOpenReady`'s `legs[n.id]` source and pointing at the `laneGroup`
section for the (now observability-only) prior mechanism. (2) The `running-set.json` —
`lane_group` extension section's example JSON `max_concurrent` was corrected from `8` (the
READ cap — inaccurate for a write-group example, the exact class of value #588 fixed) to `4`
(the WRITE cap), and a new paragraph documents the issue #588 write-cap-ceiling invariant
directly beneath the field-contract table. (3) The `open-ready` response — `laneGroup` field
section gained a short cross-reference paragraph pointing at the per-member `dispatch.leg_path`
/`dispatch.leg_branch` fields as the routing source of truth, clarifying `laneGroup` is
retained for group-level observability only.

## Verification (real exit codes)

- `node scripts/validate-workflow-contracts.js` -> "Workflow contract validation passed" EXIT:0
- `node scripts/validate-kaola-workflow-contracts.js` -> "Kaola-Workflow Codex contract validation passed" EXIT:0
- `node scripts/test-route-reachability.js` -> "Route-reachability test passed (185 assertions)." EXIT:0

Post-edit `git status --porcelain` confirms exactly the 4 allowed files touched/created
(CHANGELOG.md modified; docs/decisions/D-588-01.md and docs/decisions/D-591-01.md untracked
new; docs/api.md modified) — no other file was written by this node.
