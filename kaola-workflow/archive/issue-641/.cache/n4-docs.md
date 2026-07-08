evidence-binding: n4-docs 5b2d36d49d32
delegation_outcome: interrupted_unresponsive

## n4-docs — doc-updater (dispatched agent died on an API error before writing; orchestrator completed inline)

The dispatched doc-updater subagent failed with an API error (connection closed mid-response) BEFORE
writing any file — nothing on disk, evidence header only. The orchestrator completed the node inline
as the documented last resort after a dead writer: the four targets are all barrier-invisible
`docs/**`/`docs/decisions/**` allowband files (trivial-inline eligible), and full grounding was in
hand. No re-dispatch (API instability + fully-specified low-risk prose).

Files written (all within the declared 4-file write set):
- **docs/decisions/D-641-01.md (NEW)** — ADR in the D-640-01 format. Records the G1/G2 relaxation and
  the closed-work-observation invariant it preserves (by ISOLATION for R1 — leg + retained G4
  `merge_awaits_read_drain`; by CONTRACT for R2 — `observes: scratch` gate + `isValidationInvisible`
  band cap), the R1 4-precondition fail-closed matrix + typed `serialDegradeReason`, the R2a freeze
  grammar + hash-coverage, the R2b legless predicate, AC5 byte-identity, and the barrier-invisible ≠
  observation-invisible correction. Related: #622/#596/#547. `## Consequences` records the TWO fenced
  residuals (A1 gate-blindness, A2 testConsumedExtra) deferred to **#644**. `## Non-goals`: no
  routing-surface/planner-profile edit, 17 must-not-relax guards untouched.
- **docs/architecture.md** — extended the running-set scheduler co-open prose (~:173) with the R1
  leg-contained write co-open behind live reads (mirror of #622), the retained G4 fence, and the R2
  `observes: scratch` legless co-open.
- **docs/plan-run-cards/frontier-batch.md** — added a companion "leg-contained write co-opens
  alongside live reads (#641)" block after the #622 read-co-open note, and updated the
  `write_awaits_drain` reason to a CONDITIONAL hold with the typed `serialDegradeReason`.
- **docs/workflow-state-contract.md** — added a lane_group note: an R1 write-behind-reads co-open
  forms a size-1 `lane_group` (same merge-fence hold); an R2b co-open is legless (no lane_group).

None under-written; all four edited. Markdown renders cleanly (surgical edits, existing structure
preserved). No CHANGELOG edit (that is the n5 sink). Nothing touched outside the write set.
