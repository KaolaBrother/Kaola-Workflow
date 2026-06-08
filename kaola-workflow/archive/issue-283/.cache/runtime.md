# runtime (tdd-guide) — issue-283
RED: new assertion "R1: finalization-summary.md must be the completion signal" failed (exit 1) in testRepairFinalizationRoute (scripts/simulate-workflow-walkthrough.js:323) against current code.
GREEN: "Workflow walkthrough simulation passed", exit 0 (captured via echo $?, not piped).
Changes: repair-state.js (x2 byte-identical peers) stop emitting phase:6 / phase_name:Finalize / next_command:/kaola-workflow-phase6 and stop reading phase6-summary.md (legacy reader DELETED) -> finalization equivalents + read finalization-summary.md; sink-pr.js (x2 byte-identical) read/write finalization-summary.md; one-way in-flight migration added; walkthrough fixtures updated.
Byte-identity: cmp repair-state peers -> identical; cmp sink-pr peers -> identical.
