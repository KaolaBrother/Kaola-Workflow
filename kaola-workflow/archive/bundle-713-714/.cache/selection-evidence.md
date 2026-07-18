selection_mode: auto-bundle (follow-up bundle from the original issue-scout survey, adopted under the user's explicit "finish all issues" directive; #713+#714 share the adaptive-lifecycle repair/replan scope per the scout)

```json
{
  "source": "issue-scout survey of 2026-07-17 (persisted verbatim in kaola-workflow/archive/bundle-712-716-717/.cache/selection-evidence.md)",
  "adopted_bundle": {
    "issues": [713, 714],
    "confidence": "high",
    "rationale": "Same adaptive-lifecycle scope: #713 is the pass-then-later-fail repair-node fold wedge (runRepairNodeCore / deriveRepairDelta), #714 is the close-node compliance appender vs validateRequiredAgentCompliance mismatch — both live on the schema-2 repair / close-node emission surface shared by kaola-workflow-adaptive-node.js and kaola-workflow-adaptive-schema.js. #714 additionally fired live during the bundle-712-716-717 run (cmdFinalize refusal replan_snapshot_incomplete / state_compliance_authority_invalid; seeded as a run gap, mapped filed: #714 in that run's finalization-summary.md).",
    "scout_rejected_entries_now_adopted": [
      { "issue": 713, "scout_reason_then": "high severity (unrecoverable-claim wedge) but conditional on pass-then-later-fail serial multi-gate plan shapes; different subsystem from the gate-open path; deferred — natural follow-up bundle with #714" },
      { "issue": 714, "scout_reason_then": "same adaptive-lifecycle scope as #713 (close-node compliance appender vs validator); guaranteed per-cycle toil but no hard block; deferred to the #713 follow-up bundle" }
    ],
    "deferred": [
      { "issue": 715, "reason": "sink/release residue scope (claim release discard archive + interrupted-sink receipt as foreign_dirt); manual-unblock toil only after claim release; single-issue follow-up run next" }
    ]
  }
}
```
