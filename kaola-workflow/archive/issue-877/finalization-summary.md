# Finalization — Summary: issue-877

Build ADR 0017 — the mission list replaces the node/DAG executor. Closes #877.

## Delivered

`kaola-workflow/<run>/mission-list.md` is the run record: one file per run, four fields per item
(`item` / `status` / `dispatched` / `result`), three write moments (created, dispatched, closed).
No script owns it; the orchestrator writes it. An item is a mission in one line of prose — no role,
no write set, no dependency edge, no model, no cardinality — and the orchestrator decides at
reach-time whether to dispatch subagents or act itself, and at what width.

The node/DAG executor is retired with the plan grammar, the role vocabulary, declared write sets,
post-dominance gates, the disjointness proof, the serializer taxonomy, the freeze chain, `plan_hash`,
and the re-plan epoch machinery. `workflow-state.md` survives as the claim record only. The command
surface collapses to three: `/workflow-init`, `/workflow-next`, `/kaola-workflow-finalize`.

Refusals in the run design reach zero. What still stops is never a judgement of the work: the pre-tag
release gate, and operations that would destroy something (an archive that would lose a file, a sink
over a tree carrying uncommitted work). The sink stops without merging and reports; the orchestrator
owns the outcome.

Also shipped, by owner ruling during review: the pre-tag gate keeps its full unwaived four-chain
demand but gains a release-prep carry-over binding, so a green receipt from the finishing run no
longer forces a redundant re-run when only release-prep commits separate it from the release commit.

## Files Changed

293 files, +21,800 / −287,600 (approx.), across canonical `scripts/`, the three plugin editions,
`agents/`, `commands/`, `templates/routing/`, and `docs/`. Scripts 30 → 20 · commands 5 → 3 ·
routing surfaces 30 → 18.

## Test Coverage

- `simulate-workflow-walkthrough.js` green at FULL scope: 203/203 scenarios, 2,092 spawns.
- `scripts/test-sink-merge.js`: 170 assertions behind twelve mutation proofs; the converted
  preconditions assert git facts (main unmoved, branch not an ancestor, content absent from HEAD),
  not envelope text.
- `scripts/test-finalize-door.js` (new): the finalize receipt check is a report — finalize exits 0,
  closure completes, and the typed finding lands durably in `finalization-summary.md`.
- `scripts/test-ledger-compare.js` (new): 40 assertions over mission-list records, three
  scratch-mirror mutation proofs, plus the restored #816 transaction scenario.

## Validation

All four chains green in one pass at the finalize commit, no waivers:
claude · codex · gitlab · gitea, receipt bound to `12cc3bab` over a clean tree.
`generate-routing-surfaces.js --check`: all 18 surfaces byte-match the skeleton.

## Changed Paths

Recorded by the finalize transaction.

## Documentation Docking

`CLAUDE.md` rewritten onto the mission list (198 lines, ADR banner removed); `docs/mission-list.md`
is the format of record; README, `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`,
`docs/workflow-state-contract.md` and the doc index rewritten; `CHANGELOG.md` under `[Unreleased]`.

## Run gaps

The claim record for this run was reconstructed at finalize time — the campaign ran bare-session
style and `workflow-state.md` was never written at claim time. The reconstruction is conservative
and stated: branch `kaola/issue-877`, base `main`, sink `merge`, issue 877. The mission list carried
the run throughout, which is the property ADR 0017 was built to demonstrate.

A PR-#879 review found three defects the green suites did not: the gitea/gitlab claim ports kept the
retired planner-attestation chain while each edition's suite pinned its own copy in opposite
directions; `kaola-workflow-ledger-compare.js` was re-pointed at mission-list records with every test
of it deleted in the same change; and the attestation docs still described deleted exports as live
API. All three are repaired in this branch, and the forge validators now carry retirement sweeps so
the divergence class reds an edition chain instead of hiding.

## Follow-Up Items

- ~27 zero-consumer exports remain in `kaola-workflow-adaptive-schema.js` (plus two duplicate keys in
  the export literal and a block of orphaned comments). Deferred deliberately: the deletion must keep
  all four copies byte-identical and move the contract-validator pins with it.
- #878 (the watch list) stays open by design — reference only, do not schedule.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped
