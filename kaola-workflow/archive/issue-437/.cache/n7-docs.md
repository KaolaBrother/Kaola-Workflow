evidence-binding: n7-docs 1f09bceda8e0

## Documents updated

1. `docs/decisions/D-437-01.md` — NEW decision record: problem statement (broken ADR close-side story), all four settlements as actually implemented (with real function names and line numbers), flag-OFF invariant (INV-6), group baseline mechanism, per-path attribution, `--parallel-safe` disjointness check, cross-lane protection posture (advisory), and the advisory finding R1 from n5-review (Math.max(2,groupCeiling) ceiling issue).

2. `docs/architecture.md` — New "Lane-group co-open" paragraph inserted in the Per-node running-set scheduler section: describes `runOpenReady` (L2550) + `tryFormLaneGroup` (L2522) co-open path, `closeGroupMember` (L2996) deferred/last-member close, `--group-barrier` invocation, cross-lane advisory protection posture, and flag-OFF INV-6. Cross-references `docs/decisions/D-437-01.md`.

3. `docs/api.md` — New "Lane-group co-open and group-scoped close barrier" section: `running-set.json` `lane_group` extension schema (field-by-field table), `--parallel-safe --nodes A,B --json` flag (success + refuse shapes + error table), `--group-barrier --group-id <id> --json` flag (success + typed-refusal table), `open-ready` `laneGroup` response field, `close-node` `barrier` field extension (`deferred_to_group` / `group_passed`) and new typed refusals (`member_vacuity`, `group_barrier_failed`).

4. `docs/workflow-state-contract.md` — Extended `running-set.json` bullet with a `lane_group` sub-section: absent-when-flag-OFF, absent-after-group-clear, outside-plan_hash durability, two-phase crash-safety, group baseline co-residence, `closed_members` vs `members` semantics, reconcile-running-set survival logic.

5. `CHANGELOG.md` — New `## [Unreleased]` → `### Added` entry documenting all three changed scripts (×4 editions each), the four settlements, the two new CLI flags (`--parallel-safe`, `--group-barrier`), the `lane_group` running-set extension, flag-OFF INV-6, test coverage with real assertion counts (85 / 623 / 214), and the decision record D-437-01.md.
