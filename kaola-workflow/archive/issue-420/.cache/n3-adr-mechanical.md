# n3-adr-mechanical evidence
evidence-binding: n3-adr-mechanical b151258780bf

## Node
n3-adr-mechanical — role `doc-updater` — issue #420 (design(adaptive/auto): goal-driven automation)

## Deliverable
Authored `docs/decisions/D-420-02.md` — the ADR for issue #420 Parts 2 (enriched consent-halt
triage payload) + Part 4 (release aggregator `kaola-workflow-release.js`). Invariants continue
from D-420-01's [INV-12], starting at [INV-13] and running to [INV-23] (11 invariants across the
two parts).

## Write set
Declared: `docs/decisions/D-420-02.md` (+ this evidence file in `.cache/`). No other file touched.

## Invariants defined
- Part 2 (enriched halt payload): [INV-13] diagnosis threaded not re-derived; [INV-14] mechanical
  class = #406 reason generalized with 3 new subtypes (lockfile_write/mirror_write/count_bump),
  no taxonomy fork; [INV-15] repair diff is a suggestion, not applied; [INV-16] symmetric
  test_thrash delta in the same return shape; [INV-17] forge-neutral JSON, no CLI name; [INV-18]
  ×4 edition propagation.
- Part 4 (release aggregator): [INV-19] read-only `--verify` / re-verifying `--cut`; [INV-20]
  CHANGELOG completeness as a typed refusal (closes the #417 gap); [INV-21] operator runs the
  forge CLI, aggregator only prints the command; [INV-22] reuse existing checks, no
  reimplementation; [INV-23] ×4 edition propagation.

## Grounding (every claim cited to a real file/line or the investigation doc)
- `runWriteHalt` current payload + reasons: `kaola-workflow-adaptive-node.js:1454-1551` (valid
  reasons line 1457; consent→consent+security coupling 1470-1500; payload 1544-1550).
- `barrierCheck` offending arrays + #406 typed reason: `kaola-workflow-plan-validator.js:578-672`
  (sensitiveHits 618, outOfAllow 623, foreignArchiveHits 612, unattributed 645, reason 650-671).
- `write_set_granularity` #404 subtype + helper: `plan-validator.js:557-567`, `659-668`.
- `barrier_failed` close carrying barrierOut: `adaptive-node.js:1230-1237`.
- `computePlanHash` covers Meta+Nodes only (ledger-preserving --freeze repair):
  `plan-validator.js:682-687`.
- Release checks: `validate-workflow-contracts.js` tag-before-test 556-568, tag-ancestry 580-590,
  claude lockstep 469-475, codex lockstep 478-496, README 464-467/485, CHANGELOG presence 552,
  surface-drift 592-599; `release-surface-drift.js` tagAncestry 82-102, detectCodexReleaseSurfaceDrift
  107-118, inert-policy 51-57.
- #417 CHANGELOG-gap finding: `CHANGELOG.md` [Unreleased] Fixed (#417 entry).
- adaptive-handoff SPAWN-1/SPAWN-2 re-validate discipline (basis for [INV-19]):
  `adaptive-handoff.js:268`, `328`.
- House style: mirrored D-419-02 (Parts 2+4 "mechanical transactions" ADR) and D-420-01
  (continued invariant numbering, Related-block + Open Questions + Consequences structure).

## Verification
- File written: `docs/decisions/D-420-02.md` (Status: Proposed, Date 2026-06-12, Issue #420).
- Invariant range [INV-13]..[INV-23] continues cleanly from D-420-01 [INV-12]; no overlap.
- No forge CLI name (`gh`/`glab`/`tea`) used as a hardcoded contract in the ADR prose except where
  naming the editions-contract PROHIBITION (the design explicitly forbids those binaries in a
  shipped script — [INV-17]/[INV-21]).
- Constraint honoured: only the two declared files written; no CHANGELOG / D-420-01 / other edits.
